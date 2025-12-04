import { Buffer } from "buffer";
import type { Job } from "bullmq";
import heicConvert from "heic-convert";
import sharp from "sharp";
import { config } from "../config";
import { type AIMessage, callAI } from "../../lib/ai-client";
import { createChildLogger } from "../../lib/logger";
import {
  createProcessingReporter,
  type ProcessingReporter,
} from "../lib/processing-reporter";
import { objectStorage } from "../../lib/storage";

const logger = createChildLogger("image-processor");

interface ImageJobData {
  photoId: string;
  storageId: string;
  mimeType: string;
  userId: string;
  originalFilename?: string;
}

// Define which MIME types are unsupported by the AI and require conversion.
const CONVERSION_REQUIRED_MIME_TYPES = [
  "image/heic",
  "image/heif",
  "image/avif",
  "image/webp",
  "image/svg+xml",
];

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
 * NEW: Generic conversion function for all unsupported formats to JPEG.
 */
async function executeImageConversion(
  imageBuffer: Buffer,
  sourceMimeType: string,
  photoId: string,
  userId: string,
  reporter: ProcessingReporter,
): Promise<{ convertedJpgStorageId: string; imageBuffer: Buffer }> {
  const stageName = STAGES.CONVERSION;
  await reporter.updateStage(stageName, "processing", 10);

  try {
    let jpegBuffer: Buffer;

    // HEIC/HEIF requires a special library.
    if (sourceMimeType === "image/heic" || sourceMimeType === "image/heif") {
      const u8 = new Uint8Array(
        imageBuffer.buffer,
        imageBuffer.byteOffset,
        imageBuffer.byteLength,
      );

      const conversionResult = await heicConvert({
        buffer: u8 as unknown as ArrayBufferLike, // appease the too-narrow d.ts
        format: "JPEG",
        quality: 0.9,
      });

      jpegBuffer = Buffer.from(conversionResult);
    } else {
      // Sharp handles AVIF, WebP, SVG, and more.
      jpegBuffer = await sharp(imageBuffer).jpeg({ quality: 90 }).toBuffer();
    }

    await reporter.updateProgress(stageName, 50);

    // Save the converted JPEG and use the required artifact name.
    const savedAsset = await objectStorage.saveAssetBuffer(
      jpegBuffer,
      userId,
      "photos",
      photoId,
      "converted.jpg",
    );
    const artifacts = { convertedJpgStorageId: savedAsset.storageId };

    await reporter.completeStage(stageName, artifacts);
    logger.info(
      { photoId, storageId: savedAsset.storageId, from: sourceMimeType },
      "Successfully converted image to JPEG",
    );

    return { ...artifacts, imageBuffer: jpegBuffer };
  } catch (error: any) {
    logger.error(
      { photoId, from: sourceMimeType, error: error.message },
      "Image conversion failed",
    );
    await reporter.reportError(error, stageName);
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
  reporter: ProcessingReporter,
): Promise<{ thumbnailStorageId: string }> {
  const stageName = STAGES.THUMBNAIL;
  await reporter.updateStage(stageName, "processing", 10);

  try {
    const thumbnailBuffer = await sharp(imageBuffer)
      .resize(400, 400, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    await reporter.updateProgress(stageName, 50);
    const savedAsset = await objectStorage.saveAssetBuffer(
      thumbnailBuffer,
      userId,
      "photos",
      photoId,
      "thumbnail.jpg",
    );
    const artifacts = { thumbnailStorageId: savedAsset.storageId };

    await reporter.completeStage(stageName, artifacts);
    logger.info(
      { photoId, storageId: savedAsset.storageId },
      "Successfully generated thumbnail.",
    );

    return artifacts;
  } catch (error: any) {
    logger.error(
      { photoId, error: error.message },
      "Thumbnail generation failed",
    );
    await reporter.reportError(error, stageName);
    throw error;
  }
}

/**
 * Execute a single AI workflow step.
 */
async function executeAIWorkflowStep(
  stageName: Stage,
  imageBase64: string,
  photoId: string,
  reporter: ProcessingReporter,
): Promise<any> {
  await reporter.updateStage(stageName, "processing", 10);

  const prompt = PROMPTS[stageName];
  if (!prompt) {
    throw new Error(`No prompt defined for AI stage: ${stageName}`);
  }

  if (stageName === STAGES.CONTENT_EXTRACTION) {
    const extractionSchema = {
      type: "object",
      properties: {
        extracted_text: {
          type: "string",
          description:
            "All visible text extracted from the image, preserving original formatting and line breaks.",
        },
        has_text: {
          type: "boolean",
          description:
            "A boolean flag indicating whether any text was found in the image.",
        },
      },
      required: ["extracted_text", "has_text"],
    };

    const tempMessages: AIMessage[] = [
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
            image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
          },
          {
            type: "text",
            text: "Extract all visible text from this image.",
          },
        ],
      },
    ];

    const modelResponse = await callAI(tempMessages, "workers", {
      temperature: 0.1,
      maxTokens: 1000,
      timeout: config.worker.aiTimeout || 180000,
      schema: extractionSchema,
    });

    // log raw response
    logger.debug(
      { photoId, step: stageName, modelResponse },
      "AI workflow step response",
    );
  }

  const messages: AIMessage[] = [
    {
      role: "system",
      content:
        "You are an expert image analysis AI. Analyze the provided image and return ONLY valid JSON. Do not include explanatory text before or after the JSON.",
    },
    {
      role: "user",
      content: [
        // Since we convert everything to JPEG, this data URI is always correct.
        {
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
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

    // log raw response
    logger.debug(
      { photoId, step: stageName, modelResponse },
      "AI workflow step response",
    );

    await reporter.updateProgress(stageName, 80);
    const parsedResponse = parseModelResponse(modelResponse);

    await reporter.completeStage(stageName, parsedResponse);
    return parsedResponse;
  } catch (error: any) {
    logger.error(
      { photoId, step: stageName, error: error.message },
      "AI workflow step failed",
    );
    await reporter.reportError(error, stageName);
    throw error;
  }
}

/**
 * Parse AI model response to extract JSON.
 */
function parseModelResponse(responseText: string | any): any {
  try {
    if (typeof responseText === "object") {
      return responseText;
    }
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error("No JSON object found in the AI response.");
  } catch (error: any) {
    logger.warn(
      { responseText, error: error.message },
      "Failed to parse AI response as JSON.",
    );
    throw new Error(`Could not parse AI response: ${error.message}`);
  }
}

/**
 * Main processing function for an image.
 */
async function processImageJob(job: Job<ImageJobData>): Promise<void> {
  const { photoId, storageId, mimeType, userId } = job.data;
  logger.info(
    { photoId, jobId: job.id, userId, mimeType, storageId },
    "Starting image processing job",
  );

  // Validate required job data
  if (!storageId || storageId.trim() === "") {
    const errorMsg = `Invalid or missing storageId for photo ${photoId}. Received: ${storageId}`;
    logger.error({ photoId, jobId: job.id, storageId }, errorMsg);
    throw new Error(errorMsg);
  }

  // Check if the mimeType is in our list of formats that need conversion.
  const needsConversion = CONVERSION_REQUIRED_MIME_TYPES.includes(mimeType);

  const initialStages = [
    STAGES.PREPARATION,
    ...(needsConversion ? [STAGES.CONVERSION] : []),
    STAGES.THUMBNAIL,
    STAGES.CLASSIFICATION,
    //STAGES.FINALIZATION,
  ];

  const reporter = createProcessingReporter("photos", photoId, userId);
  await reporter.initializeJob(initialStages);

  const allArtifacts: Record<string, any> = {};
  const extractedData: Record<string, any> = {
    photoId,
    mimeType,
    originalFilename: job.data.originalFilename,
    processedAt: new Date().toISOString(),
    aiAnalysis: {},
  };

  try {
    // STAGE: IMAGE PREPARATION
    await reporter.updateStage(STAGES.PREPARATION, "processing", 0);
    let imageBuffer = await objectStorage.getBuffer(storageId);
    if (imageBuffer.length === 0)
      throw new Error("Fetched image file is empty.");
    await reporter.completeStage(STAGES.PREPARATION);

    // STAGE: CONVERSION (Conditional)
    if (needsConversion) {
      // Use the new generic conversion function.
      const { imageBuffer: convertedBuffer, ...convArtifacts } =
        await executeImageConversion(
          imageBuffer,
          mimeType,
          photoId,
          userId,
          reporter,
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
      reporter,
    );
    Object.assign(allArtifacts, thumbArtifacts);
    extractedData.thumbnail = {
      thumbnailStorageId: thumbArtifacts.thumbnailStorageId,
    };

    // STAGE: CLASSIFICATION
    // This will also use the appropriate buffer.
    const imageBase64 = imageBuffer.toString("base64");
    const classificationResult = await executeAIWorkflowStep(
      STAGES.CLASSIFICATION,
      imageBase64,
      photoId,
      reporter,
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
    await reporter.addStages(stagesToAdd);

    // Execute dynamic steps
    const tags: string[] = [];
    for (const stepName of dynamicSteps) {
      const stepArtifacts = await executeAIWorkflowStep(
        stepName,
        imageBase64,
        photoId,
        reporter,
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
    await reporter.updateStage(STAGES.FINALIZATION, "processing", 50);

    // Save the extracted JSON data to storage
    const extractedJsonBuffer = Buffer.from(
      JSON.stringify(extractedData, null, 2),
    );
    const savedExtractedJson = await objectStorage.saveAssetBuffer(
      extractedJsonBuffer,
      userId,
      "photos",
      photoId,
      "extracted.json",
    );
    allArtifacts.extractedJsonStorageId = savedExtractedJson.storageId;

    logger.info(
      { photoId, storageId: savedExtractedJson.storageId },
      "Successfully saved extracted analysis data as JSON",
    );

    await reporter.completeStage(STAGES.FINALIZATION);

    // Mark the overall job as complete, sending all collected artifacts.
    await reporter.completeJob(allArtifacts);

    logger.info(
      { photoId, jobId: job.id },
      "Successfully completed image processing job.",
    );
  } catch (error: any) {
    logger.error(
      { photoId, jobId: job.id, error: error.message, stack: error.stack },
      "FAILED image processing job",
    );
    await reporter.failJob(error.message);
    throw error;
  }
}

export default processImageJob;
