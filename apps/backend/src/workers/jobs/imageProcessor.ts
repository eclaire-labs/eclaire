import { Buffer } from "node:buffer";
import { type AIMessage, callAI } from "@eclaire/ai";
import type { JobContext } from "@eclaire/queue/core";
import sharp from "sharp";
import { createChildLogger } from "../../lib/logger.js";
import { buildKey, getStorage } from "../../lib/storage/index.js";
import { config } from "../config.js";

const logger = createChildLogger("image-processor");

export interface ImageJobData {
  photoId: string;
  storageId: string;
  mimeType: string;
  userId: string;
  originalFilename?: string;
}

// Define which MIME types require conversion to JPEG for consistent processing.
// Includes formats unsupported by AI models, those with alpha channels (transparency
// becomes black in JPEG thumbnails), and uncommon formats best normalized early.
const CONVERSION_REQUIRED_MIME_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/avif",
  "image/webp",
  "image/svg+xml",
  "image/png", // Normalize: avoids alpha-channel artifacts in JPEG thumbnails
  "image/tiff", // Normalize: some variants (CMYK, 16-bit, multi-page) can fail
  "image/bmp", // Normalize: unnecessarily large format
]);

const STAGES = {
  PREPARATION: "image_preparation",
  CONVERSION: "image_conversion",
  THUMBNAIL: "thumbnail_generation",
  CLASSIFICATION: "classification",
  OBJECT_DETECTION: "object_detection",
  CONTENT_EXTRACTION: "content_extraction",
  VISUAL_ANALYSIS: "visual_analysis",
  DOCUMENT_ANALYSIS: "document_analysis",
  TECHNICAL_ANALYSIS: "technical_analysis",
  FINALIZATION: "finalization",
} as const;

type Stage = (typeof STAGES)[keyof typeof STAGES];

const WORKFLOW_BRANCHES: Record<string, Stage[]> = {
  photograph_general: [STAGES.OBJECT_DETECTION, STAGES.VISUAL_ANALYSIS],
  screenshot: [STAGES.CONTENT_EXTRACTION, STAGES.DOCUMENT_ANALYSIS],
  document_scan: [STAGES.CONTENT_EXTRACTION, STAGES.DOCUMENT_ANALYSIS],
  whiteboard_note: [STAGES.CONTENT_EXTRACTION, STAGES.DOCUMENT_ANALYSIS],
  diagram_chart: [STAGES.TECHNICAL_ANALYSIS],
  illustration_art: [STAGES.OBJECT_DETECTION, STAGES.VISUAL_ANALYSIS],
  map: [STAGES.TECHNICAL_ANALYSIS],
  ui_mockup: [STAGES.CONTENT_EXTRACTION, STAGES.DOCUMENT_ANALYSIS],
  qr_barcode: [STAGES.CONTENT_EXTRACTION],
  other_graphic: [STAGES.VISUAL_ANALYSIS],
};

const PROMPTS: Record<Stage, string> = {
  [STAGES.PREPARATION]: "",
  [STAGES.CONVERSION]: "",
  [STAGES.THUMBNAIL]: "",
  [STAGES.FINALIZATION]: "",
  [STAGES.CLASSIFICATION]: `Analyze this image and classify it. Choose the most appropriate type from this list:
- photograph_general: General photos (people, landscapes, objects, events, animals, food)
- screenshot: Image captured from a digital screen
- document_scan: Scanned document (letter, form, receipt, invoice, business card, book page)
- whiteboard_note: Photo of whiteboard, blackboard, or handwritten notes
- diagram_chart: Visual information representation (graph, flowchart, technical drawing, mind map)
- illustration_art: Drawings, paintings, digital art, comics, graphic designs
- map: Geographical area depiction
- ui_mockup: User interface design, wireframe, or prototype
- qr_barcode: Image primarily containing QR code or barcode
- other_graphic: Other graphics not fitting elsewhere

Respond with JSON: {"image_type": "exact_type_from_list", "description": "brief description of what you see"}`,
  [STAGES.OBJECT_DETECTION]: `List all visible objects and people in this image. Be specific but not overly detailed. Respond with JSON: {"objects": ["object1", "object2"]}`,
  [STAGES.CONTENT_EXTRACTION]: `Extract all visible text from this image, preserving formatting and line breaks. Respond with JSON: {"extracted_text": "all text here", "has_text": true/false}`,
  [STAGES.VISUAL_ANALYSIS]: `Analyze the visual characteristics. Identify dominant colors and provide descriptive tags about setting, mood, or style. Respond with JSON: {"dominant_colors": ["color1"], "tags": ["tag1", "tag2"], "mood_setting": "description"}`,
  [STAGES.DOCUMENT_ANALYSIS]: `Analyze what type of document or interface this is. Provide relevant categorical tags. Respond with JSON: {"document_type": "specific type", "tags": ["tag1", "tag2"], "purpose": "what this document/interface is for"}`,
  [STAGES.TECHNICAL_ANALYSIS]: `Analyze the technical content of this diagram, chart, or map. Identify main concepts and components. Respond with JSON: {"main_concepts": ["concept1"], "components": ["component1"], "tags": ["tag1"], "diagram_type": "specific type"}`,
};

/**
 * Generic conversion function for all unsupported formats to JPEG.
 */
async function executeImageConversion(
  imageBuffer: Buffer,
  sourceMimeType: string,
  photoId: string,
  userId: string,
  ctx: JobContext<ImageJobData>,
): Promise<{ convertedJpgStorageId: string; imageBuffer: Buffer }> {
  const stageName = STAGES.CONVERSION;
  await ctx.startStage(stageName);
  await ctx.updateStageProgress(stageName, 10);

  try {
    // Sharp handles all formats: HEIC/HEIF (via libheif), AVIF, WebP, SVG,
    // PNG, TIFF, BMP, and more. Using .rotate() auto-applies EXIF orientation.
    const sharpOptions =
      sourceMimeType === "image/svg+xml" ? { density: 300 } : {};
    const jpegBuffer = await sharp(imageBuffer, sharpOptions)
      .rotate()
      .jpeg({ quality: 90 })
      .toBuffer();

    await ctx.updateStageProgress(stageName, 50);

    // Save the converted JPEG and use the required artifact name.
    const storage = getStorage();
    const convertedKey = buildKey(userId, "photos", photoId, "converted.jpg");
    await storage.writeBuffer(convertedKey, jpegBuffer, {
      contentType: "image/jpeg",
    });
    const artifacts = { convertedJpgStorageId: convertedKey };

    await ctx.completeStage(stageName, artifacts);
    logger.info(
      { photoId, storageId: convertedKey, from: sourceMimeType },
      "Successfully converted image to JPEG",
    );

    return { ...artifacts, imageBuffer: jpegBuffer };
  } catch (error: unknown) {
    logger.error(
      {
        photoId,
        from: sourceMimeType,
        error: error instanceof Error ? error.message : String(error),
      },
      "Image conversion failed",
    );
    await ctx.failStage(
      stageName,
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}

/**
 * Execute thumbnail generation.
 */
async function executeThumbnailGeneration(
  imageBuffer: Buffer,
  photoId: string,
  userId: string,
  ctx: JobContext<ImageJobData>,
): Promise<{ thumbnailStorageId: string }> {
  const stageName = STAGES.THUMBNAIL;
  await ctx.startStage(stageName);
  await ctx.updateStageProgress(stageName, 10);

  try {
    const thumbnailBuffer = await sharp(imageBuffer)
      .rotate() // Auto-apply EXIF orientation
      .resize(800, 800, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    await ctx.updateStageProgress(stageName, 50);
    const storage = getStorage();
    const thumbnailKey = buildKey(userId, "photos", photoId, "thumbnail.webp");
    await storage.writeBuffer(thumbnailKey, thumbnailBuffer, {
      contentType: "image/webp",
    });
    const artifacts = { thumbnailStorageId: thumbnailKey };

    await ctx.completeStage(stageName, artifacts);
    logger.info(
      { photoId, storageId: thumbnailKey },
      "Successfully generated thumbnail.",
    );

    return artifacts;
  } catch (error: unknown) {
    logger.error(
      {
        photoId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Thumbnail generation failed",
    );
    await ctx.failStage(
      stageName,
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}

/**
 * Execute a single AI workflow step.
 */
async function executeAIWorkflowStep(
  stageName: Stage,
  imageBase64: string,
  mediaMime: string,
  photoId: string,
  ctx: JobContext<ImageJobData>,
  // biome-ignore lint/suspicious/noExplicitAny: AI model returns dynamic JSON output
): Promise<any> {
  await ctx.startStage(stageName);
  await ctx.updateStageProgress(stageName, 10);

  const prompt = PROMPTS[stageName];
  if (!prompt) {
    throw new Error(`No prompt defined for AI stage: ${stageName}`);
  }

  // Content extraction uses a dedicated OCR prompt with lower temperature and
  // higher maxTokens since documents can contain significant text.
  if (stageName === STAGES.CONTENT_EXTRACTION) {
    const ocrMessages: AIMessage[] = [
      {
        role: "system",
        content:
          "You are an expert Optical Character Recognition (OCR) engine. Your task is to extract all text from an image. You must respond with a single, valid JSON object that strictly adheres to the provided schema. Do not include any other text, explanations, or markdown formatting in your response.",
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mediaMime};base64,${imageBase64}` },
          },
          {
            type: "text",
            text: 'Extract all visible text from this image. Respond with JSON: {"extracted_text": "all text here", "has_text": true/false}',
          },
        ],
      },
    ];

    try {
      const modelResponse = await callAI(ocrMessages, "workers", {
        temperature: 0.1,
        maxTokens: 4096,
        timeout: config.worker.aiTimeout || 180000,
      });

      logger.debug(
        { photoId, step: stageName, modelResponse },
        "OCR workflow step response",
      );

      // Check for repetitive content (model stuck in a loop)
      if (modelResponse.content && detectRepetition(modelResponse.content)) {
        logger.warn(
          {
            photoId,
            step: stageName,
            contentLength: modelResponse.content.length,
          },
          "Detected repetitive pattern in OCR response",
        );
        throw new Error(
          "AI response contains repetitive content - model may be stuck in a loop",
        );
      }

      // Handle truncation gracefully for OCR — return partial text instead of failing
      if (modelResponse.finishReason === "length") {
        logger.warn(
          { photoId, step: stageName },
          "OCR response truncated due to token limit - returning partial result",
        );
        try {
          const partial = parseModelResponse(modelResponse);
          partial._truncated = true;
          await ctx.updateStageProgress(stageName, 80);
          await ctx.completeStage(stageName, partial);
          return partial;
        } catch {
          // JSON was cut off mid-parse; wrap raw content as best-effort
          const fallback = {
            extracted_text: modelResponse.content || "",
            has_text: !!modelResponse.content?.trim(),
            _truncated: true,
          };
          await ctx.updateStageProgress(stageName, 80);
          await ctx.completeStage(stageName, fallback);
          return fallback;
        }
      }

      await ctx.updateStageProgress(stageName, 80);
      const parsedResponse = parseModelResponse(modelResponse);
      await ctx.completeStage(stageName, parsedResponse);
      return parsedResponse;
    } catch (error: unknown) {
      logger.error(
        {
          photoId,
          step: stageName,
          error: error instanceof Error ? error.message : String(error),
        },
        "OCR workflow step failed",
      );
      await ctx.failStage(
        stageName,
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  // Generic AI workflow for non-OCR stages (classification, object detection, etc.)
  const messages: AIMessage[] = [
    {
      role: "system",
      content:
        "You are an expert image analysis AI. Analyze the provided image and return ONLY valid JSON. Do not include explanatory text before or after the JSON.",
    },
    {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: { url: `data:${mediaMime};base64,${imageBase64}` },
        },
        { type: "text", text: prompt },
      ],
    },
  ];

  try {
    const modelResponse = await callAI(messages, "workers", {
      temperature: 0.2,
      maxTokens: 1000,
      timeout: config.worker.aiTimeout || 180000,
    });

    logger.debug(
      { photoId, step: stageName, modelResponse },
      "AI workflow step response",
    );

    // Check for truncation due to token limit
    if (modelResponse.finishReason === "length") {
      logger.warn(
        { photoId, step: stageName, finishReason: modelResponse.finishReason },
        "AI response truncated due to token limit",
      );
      throw new Error(
        "AI response truncated due to token limit - output may be incomplete",
      );
    }

    // Check for repetitive content (model stuck in a loop)
    if (modelResponse.content && detectRepetition(modelResponse.content)) {
      logger.warn(
        {
          photoId,
          step: stageName,
          contentLength: modelResponse.content.length,
        },
        "Detected repetitive pattern in AI response - model may be stuck in a loop",
      );
      throw new Error(
        "AI response contains repetitive content - model may be stuck in a loop",
      );
    }

    await ctx.updateStageProgress(stageName, 80);
    const parsedResponse = parseModelResponse(modelResponse);

    await ctx.completeStage(stageName, parsedResponse);
    return parsedResponse;
  } catch (error: unknown) {
    logger.error(
      {
        photoId,
        step: stageName,
        error: error instanceof Error ? error.message : String(error),
      },
      "AI workflow step failed",
    );
    await ctx.failStage(
      stageName,
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}

/**
 * Detect if text contains repetitive patterns (model stuck in a loop).
 * Looks for sequences of 30+ characters repeated 3+ times consecutively.
 */
function detectRepetition(text: string): boolean {
  // Match 30+ character sequences that repeat 3+ times in a row
  const match = text.match(/(.{30,})\1{2,}/);
  return match !== null;
}

/**
 * Parse AI model response to extract JSON.
 * Handles both string responses and AIResponse objects from callAI().
 * Strips markdown code blocks if present.
 */
// biome-ignore lint/suspicious/noExplicitAny: AI model response can be string or pre-parsed object
function parseModelResponse(responseText: string | any): any {
  try {
    // Handle AIResponse objects from callAI()
    if (typeof responseText === "object" && responseText !== null) {
      // If it has a 'content' property (AIResponse), extract and parse it
      if (
        "content" in responseText &&
        typeof responseText.content === "string"
      ) {
        const content = responseText.content;
        // First try to extract from markdown code blocks
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
        const cleanedJsonString = (jsonMatch?.[1] || content).trim();

        // Validate that the string looks like JSON before parsing
        if (
          !cleanedJsonString.startsWith("[") &&
          !cleanedJsonString.startsWith("{")
        ) {
          throw new Error("Content does not appear to be JSON");
        }

        return JSON.parse(cleanedJsonString);
      }
      // Otherwise assume it's already parsed JSON
      return responseText;
    }
    // Handle string responses - same logic
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    const cleanedJsonString = (jsonMatch?.[1] || responseText).trim();

    if (
      !cleanedJsonString.startsWith("[") &&
      !cleanedJsonString.startsWith("{")
    ) {
      throw new Error("Content does not appear to be JSON");
    }

    return JSON.parse(cleanedJsonString);
  } catch (error: unknown) {
    logger.warn(
      {
        responseText,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to parse AI response as JSON.",
    );
    throw new Error(
      `Could not parse AI response: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Prepare an image buffer for AI analysis by resizing to a manageable dimension,
 * auto-orienting from EXIF, and converting to JPEG. This prevents memory issues
 * with large images (especially important for local models with limited VRAM)
 * and ensures the data URI MIME type always matches the actual content.
 */
async function prepareImageForAI(
  imageBuffer: Buffer,
): Promise<{ base64: string; mediaType: string }> {
  const AI_MAX_DIMENSION = 2048;
  const processed = await sharp(imageBuffer)
    .rotate()
    .resize(AI_MAX_DIMENSION, AI_MAX_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { base64: processed.toString("base64"), mediaType: "image/jpeg" };
}

/**
 * Main processing function for an image.
 */
async function processImageJob(ctx: JobContext<ImageJobData>): Promise<void> {
  const { photoId, storageId, mimeType, userId, originalFilename } =
    ctx.job.data;
  logger.info(
    { photoId, jobId: ctx.job.id, userId, mimeType, storageId },
    "Starting image processing job",
  );

  // Validate required job data
  if (!photoId || !userId) {
    throw new Error(
      `Missing required job data: photoId=${photoId}, userId=${userId}`,
    );
  }
  if (!storageId || storageId.trim() === "") {
    const errorMsg = `Invalid or missing storageId for photo ${photoId}. Received: ${storageId}`;
    logger.error({ photoId, jobId: ctx.job.id, storageId }, errorMsg);
    throw new Error(errorMsg);
  }

  // Check if the mimeType is in our list of formats that need conversion.
  const needsConversion = CONVERSION_REQUIRED_MIME_TYPES.has(mimeType);

  const initialStages = [
    STAGES.PREPARATION,
    ...(needsConversion ? [STAGES.CONVERSION] : []),
    STAGES.THUMBNAIL,
    STAGES.CLASSIFICATION,
  ];

  await ctx.initStages(initialStages);

  // biome-ignore lint/suspicious/noExplicitAny: parsed AI model output
  const allArtifacts: Record<string, any> = {};
  // biome-ignore lint/suspicious/noExplicitAny: parsed AI model output
  const extractedData: Record<string, any> = {
    photoId,
    mimeType,
    originalFilename,
    processedAt: new Date().toISOString(),
    aiAnalysis: {},
  };

  try {
    // STAGE: IMAGE PREPARATION
    await ctx.startStage(STAGES.PREPARATION);
    const storage = getStorage();

    // Check file size before downloading to prevent OOM on very large files
    const MAX_IMAGE_SIZE = 100 * 1024 * 1024; // 100MB
    const meta = await storage.head(storageId);
    if (meta && meta.size > MAX_IMAGE_SIZE) {
      throw new Error(
        `Image too large: ${meta.size} bytes exceeds ${MAX_IMAGE_SIZE} byte limit`,
      );
    }

    const { buffer: imageBufferRaw } = await storage.readBuffer(storageId);
    let imageBuffer = imageBufferRaw;
    if (imageBuffer.length === 0)
      throw new Error("Fetched image file is empty.");
    await ctx.completeStage(STAGES.PREPARATION);

    // STAGE: CONVERSION (Conditional)
    if (needsConversion) {
      // Use the new generic conversion function.
      const { imageBuffer: convertedBuffer, ...convArtifacts } =
        await executeImageConversion(
          imageBuffer,
          mimeType,
          photoId,
          userId,
          ctx,
        );
      // The rest of the workflow will use the converted JPEG buffer.
      imageBuffer = Buffer.from(convertedBuffer);
      // Add the `convertedJpgStorageId` to our artifacts.
      Object.assign(allArtifacts, convArtifacts);
      extractedData.conversion = {
        originalMimeType: mimeType,
        convertedTo: "image/jpeg",
        convertedJpgStorageId: convArtifacts.convertedJpgStorageId,
      };
    }

    // STAGE: THUMBNAIL
    // This will now use the original buffer or the converted JPEG buffer.
    const thumbArtifacts = await executeThumbnailGeneration(
      imageBuffer,
      photoId,
      userId,
      ctx,
    );
    Object.assign(allArtifacts, thumbArtifacts);
    extractedData.thumbnail = {
      thumbnailStorageId: thumbArtifacts.thumbnailStorageId,
    };

    // STAGE: CLASSIFICATION
    // Resize and normalize the image for AI analysis to avoid memory issues
    // with large files and ensure consistent MIME types in data URIs.
    const { base64: imageBase64, mediaType: aiMimeType } =
      await prepareImageForAI(imageBuffer);
    const classificationResult = await executeAIWorkflowStep(
      STAGES.CLASSIFICATION,
      imageBase64,
      aiMimeType,
      photoId,
      ctx,
    );
    Object.assign(allArtifacts, {
      photoType: classificationResult.image_type,
      description: classificationResult.description,
    });
    extractedData.aiAnalysis.classification = classificationResult;

    // DYNAMIC STAGE ADDITION
    const dynamicSteps = WORKFLOW_BRANCHES[classificationResult.image_type] || [
      STAGES.VISUAL_ANALYSIS,
    ];

    // Create the full list of stages to add in the correct order.
    const stagesToAdd = [...dynamicSteps, STAGES.FINALIZATION];

    logger.info(
      { photoId, imageType: classificationResult.image_type, stagesToAdd },
      "Dynamically adding new stages in correct order.",
    );
    await ctx.addStages(stagesToAdd);

    // Execute dynamic steps
    const tags: string[] = [];
    for (const stepName of dynamicSteps) {
      const stepArtifacts = await executeAIWorkflowStep(
        stepName,
        imageBase64,
        aiMimeType,
        photoId,
        ctx,
      );

      // Store the raw AI analysis results
      extractedData.aiAnalysis[stepName] = stepArtifacts;

      switch (stepName) {
        case STAGES.CONTENT_EXTRACTION:
          if (stepArtifacts.has_text)
            allArtifacts.ocrText = stepArtifacts.extracted_text;
          break;
        case STAGES.VISUAL_ANALYSIS:
          tags.push(...(stepArtifacts.tags || []));
          allArtifacts.dominantColors = stepArtifacts.dominant_colors || null;
          break;
        case STAGES.OBJECT_DETECTION:
          tags.push(...(stepArtifacts.objects || []));
          break;
        case STAGES.DOCUMENT_ANALYSIS:
        case STAGES.TECHNICAL_ANALYSIS:
          tags.push(...(stepArtifacts.tags || []));
          break;
      }
    }
    allArtifacts.tags = [...new Set(tags)].slice(0, 15);
    extractedData.processedTags = allArtifacts.tags;

    // FINAL STAGE: FINALIZATION
    await ctx.startStage(STAGES.FINALIZATION);
    await ctx.updateStageProgress(STAGES.FINALIZATION, 50);

    // Save the extracted JSON data to storage
    const extractedJsonBuffer = Buffer.from(
      JSON.stringify(extractedData, null, 2),
    );
    const extractedJsonKey = buildKey(
      userId,
      "photos",
      photoId,
      "extracted.json",
    );
    await storage.writeBuffer(extractedJsonKey, extractedJsonBuffer, {
      contentType: "application/json",
    });
    allArtifacts.extractedJsonStorageId = extractedJsonKey;

    logger.info(
      { photoId, storageId: extractedJsonKey },
      "Successfully saved extracted analysis data as JSON",
    );

    // Complete the final stage with all artifacts - job completion is implicit when handler returns
    await ctx.completeStage(STAGES.FINALIZATION, allArtifacts);

    logger.info(
      { photoId, jobId: ctx.job.id },
      "Successfully completed image processing job.",
    );
  } catch (error: unknown) {
    logger.error(
      {
        photoId,
        jobId: ctx.job.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      "FAILED image processing job",
    );
    // Re-throw so queue knows the job failed
    throw error;
  }
}

export default processImageJob;
