// src/workers/document-processor.ts
import { Readability } from "@mozilla/readability";
import axios from "axios";
import type { Job } from "bullmq";
import { spawn } from "child_process";
import { execa } from "execa";
import FormData from "form-data";
import { promises as fs } from "fs";
import { convert as htmlToText } from "html-to-text";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import { tmpdir } from "os";
import { chromium } from "patchright";
import path from "path";
import sharp from "sharp";
import { Readable } from "stream";
import { config } from "../config";
import { type AIMessage, callAI } from "../../lib/ai-client";
import { createChildLogger } from "../../lib/logger";
import { createProcessingReporter } from "../lib/processing-reporter";
import { objectStorage } from "../../lib/storage";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const rtfToHTML = require("@iarna/rtf-to-html");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rtf2text = require("rtf2text");
// Removed pdfjs-dist and canvas dependencies - using pdftocairo instead

const logger = createChildLogger("document-processor");
const DOCLING_SERVER_URL =
  process.env.DOCLING_SERVER_URL || "http://localhost:5001";

// Check if pdftocairo is available on the system
async function isPdftocairoAvailable(): Promise<boolean> {
  try {
    await execa("pdftocairo", ["-v"]);
    return true;
  } catch (error) {
    logger.debug("pdftocairo not available, will use pdfjs-dist fallback");
    return false;
  }
}

// Generate PDF thumbnail using pdftocairo (faster, native approach)
async function generatePdfThumbnailWithPdftocairo(
  pdfPath: string,
  scale: number = 800,
): Promise<Buffer> {
  try {
    const tempDir = path.dirname(pdfPath);
    const outputBaseName = path.join(tempDir, "thumbnail");

    // For thumbnails, render at higher resolution to avoid double scaling
    // Use 1200px for thumbnails (scale=400) to get better quality when downscaling
    const renderScale = scale === 400 ? 1200 : scale;

    // Use pdftocairo to convert first page to PNG
    const result = await execa("pdftocairo", [
      "-png",
      "-f",
      "1", // first page
      "-l",
      "1", // last page (same as first)
      "-scale-to",
      renderScale.toString(), // scale to specified width
      pdfPath,
      outputBaseName, // output without extension
    ]);

    logger.debug(
      {
        stdout: result.stdout,
        stderr: result.stderr,
        pdfPath,
        scale,
        renderScale,
      },
      "pdftocairo command executed",
    );

    // Find the generated PNG file (pdftocairo may create different filename patterns)
    const files = await fs.readdir(tempDir);
    const thumbnailFile = files.find(
      (file) => file.startsWith("thumbnail-") && file.endsWith(".png"),
    );

    if (!thumbnailFile) {
      logger.debug({ files, tempDir }, "Available files in temp directory");
      throw new Error(
        `pdftocairo output file not found. Available files: ${files.join(", ")}`,
      );
    }

    const outputPath = path.join(tempDir, thumbnailFile);
    logger.debug({ outputPath, thumbnailFile }, "Found pdftocairo output file");

    // Read the generated PNG file
    const pngBuffer = await fs.readFile(outputPath);

    // Convert to JPG and resize based on scale
    const targetWidth = scale === 400 ? 600 : 1920;
    const targetHeight = scale === 400 ? 600 : 1440;
    const quality = scale === 400 ? 85 : 90; // Use 85 for thumbnails, 90 for screenshots

    const jpgBuffer = await sharp(pngBuffer)
      .resize(targetWidth, targetHeight, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality })
      .toBuffer();

    // Clean up temp file
    await fs.unlink(outputPath).catch(() => {});

    logger.debug(
      { scale, quality, targetWidth, targetHeight, renderScale },
      "pdftocairo thumbnail generation successful",
    );
    return jpgBuffer;
  } catch (error: any) {
    logger.warn(
      { error: error.message, pdfPath },
      "pdftocairo thumbnail generation failed, falling back to pdfjs-dist",
    );
    throw error;
  }
}

// --- Helper Functions ---

/**
 * Convert markdown to plain text using marked + html-to-text
 * This provides better handling of tables and other markdown elements
 */
function markdownToText(markdownContent: string): string {
  try {
    const html = marked.parse(markdownContent) as string;
    const plainText = htmlToText(html, {
      tables: true,
      wordwrap: false,
      selectors: [{ selector: "table", options: { uppercaseHeadings: false } }],
    });
    return plainText;
  } catch (error) {
    logger.warn(
      { error: (error as Error).message },
      "Failed to convert markdown to text, falling back to raw content",
    );
    return markdownContent;
  }
}

// --- Interfaces ---

interface DocumentJobData {
  documentId: string;
  storageId: string;
  mimeType: string;
  userId: string;
  originalFilename: string;
}

interface DocumentArtifacts {
  title?: string | null;
  description?: string | null;
  tags?: string[];
  extractedText?: string;
  extractedMdStorageId?: string;
  extractedTxtStorageId?: string;
  pdfStorageId?: string;
  thumbnailStorageId?: string;
  screenshotStorageId?: string;
}

// --- Main Job Processor ---

export async function processDocumentJob(job: Job<DocumentJobData>) {
  const { documentId, storageId, mimeType, userId, originalFilename } =
    job.data;
  const jobLogger = logger.child({
    jobId: job.id,
    documentId,
    userId,
    storageId,
  });

  // Validate required job data
  if (!storageId || storageId.trim() === "") {
    const errorMsg = `Invalid or missing storageId for document ${documentId}. Received: ${storageId}`;
    jobLogger.error({ documentId, jobId: job.id, storageId }, errorMsg);
    throw new Error(errorMsg);
  }

  const reporter = createProcessingReporter("documents", documentId, userId);
  const allArtifacts: DocumentArtifacts = {};

  let tempDir: string | null = null;
  let currentStage: string = "initialization";

  try {
    // 1. Determine the processing plan
    const isHtml = mimeType === "text/html";
    const useDocling = shouldProcessWithDocling(mimeType);
    const needsPdf = mimeType !== "application/pdf";

    const stages = ["preparation"];
    if (useDocling) stages.push("docling_processing");
    else stages.push("content_extraction");

    stages.push("ai_analysis");

    if (needsPdf) stages.push("pdf_generation");

    if (isHtml) stages.push("html_thumbnail_generation");
    else stages.push("thumbnail_generation");

    stages.push("finalization");
    await reporter.initializeJob(stages);

    // 2. Preparation Stage
    currentStage = "preparation";
    await reporter.updateStage(currentStage, "processing");
    jobLogger.info("Starting preparation stage.");
    tempDir = await fs.mkdtemp(path.join(tmpdir(), `doc-proc-${documentId}-`));
    const documentBuffer = await objectStorage.getBuffer(storageId);
    jobLogger.info(
      { bufferSize: documentBuffer.length },
      "Document downloaded.",
    );
    await reporter.completeStage(currentStage);

    // 3. Content Extraction Stage
    let extractedText = "";
    if (useDocling) {
      currentStage = "docling_processing";
      await reporter.updateStage(currentStage, "processing");
      jobLogger.info("Starting Docling processing.");
      const doclingResult = await processWithDoclingServer(
        documentBuffer,
        mimeType,
        originalFilename,
      );

      // Extract text content from the new multi-format response
      // text_content may contain markdown markup, so we need to convert it to plain text
      const rawTextContent =
        doclingResult.document.text_content ||
        doclingResult.document.md_content ||
        "";

      // Convert markdown to plain text if needed
      extractedText = rawTextContent ? markdownToText(rawTextContent) : "";

      // Save the complete Docling response as docling.json
      await objectStorage.saveAsset({
        userId,
        assetType: "documents",
        assetId: documentId,
        fileName: "docling.json",
        fileStream: Readable.from([JSON.stringify(doclingResult, null, 2)]),
        contentType: "application/json",
      });

      // Save individual format outputs
      if (doclingResult.document.md_content) {
        const mdResult = await objectStorage.saveAsset({
          userId,
          assetType: "documents",
          assetId: documentId,
          fileName: "extracted.md",
          fileStream: Readable.from([doclingResult.document.md_content]),
          contentType: "text/markdown",
        });
        allArtifacts.extractedMdStorageId = mdResult.storageId;
      }

      // Save the cleaned plain text as extracted.txt
      if (extractedText) {
        const txtResult = await objectStorage.saveAsset({
          userId,
          assetType: "documents",
          assetId: documentId,
          fileName: "extracted.txt",
          fileStream: Readable.from([extractedText]),
          contentType: "text/plain",
        });
        allArtifacts.extractedTxtStorageId = txtResult.storageId;
      }

      if (doclingResult.document.json_content) {
        await objectStorage.saveAsset({
          userId,
          assetType: "documents",
          assetId: documentId,
          fileName: "extracted.json",
          fileStream: Readable.from([
            JSON.stringify(doclingResult.document.json_content, null, 2),
          ]),
          contentType: "application/json",
        });
      }
      jobLogger.info(
        { textLength: extractedText.length },
        "Docling processing complete.",
      );
    } else {
      currentStage = "content_extraction";
      await reporter.updateStage(currentStage, "processing");
      jobLogger.info("Starting standard content extraction.");
      extractedText = await extractTextFromDocument(
        documentBuffer,
        mimeType,
        originalFilename,
        tempDir,
      );
      jobLogger.info(
        { textLength: extractedText.length },
        "Standard content extraction complete.",
      );
    }
    await reporter.completeStage(currentStage);
    allArtifacts.extractedText = extractedText;

    // 4. AI Analysis Stage
    currentStage = "ai_analysis";
    await reporter.updateStage(currentStage, "processing");
    if (extractedText && extractedText.length > 50) {
      jobLogger.info("Starting AI metadata analysis.");
      const aiMetadata = await generateDocumentMetadata(
        extractedText,
        originalFilename,
      );
      Object.assign(allArtifacts, aiMetadata);
      jobLogger.info("AI metadata analysis complete.", {
        title: aiMetadata.title,
        tags: aiMetadata.tags,
      });
    } else {
      jobLogger.info("Skipping AI analysis due to insufficient text.");
    }
    await reporter.completeStage(currentStage);

    // 5. PDF Generation Stage (if needed)
    let pdfBuffer: Buffer | null = null;
    if (needsPdf) {
      currentStage = "pdf_generation";
      await reporter.updateStage(currentStage, "processing");
      jobLogger.info("Starting PDF generation.");
      const tempDocPath = path.join(
        tempDir,
        `source${getFileExtensionFromMimeType(mimeType)}`,
      );
      await fs.writeFile(tempDocPath, documentBuffer);
      pdfBuffer = await generatePdf(
        documentBuffer,
        mimeType,
        originalFilename,
        tempDocPath,
        tempDir,
      );
      const pdfResult = await objectStorage.saveAssetBuffer(
        pdfBuffer,
        userId,
        "documents",
        documentId,
        "converted.pdf",
      );
      allArtifacts.pdfStorageId = pdfResult.storageId;
      jobLogger.info("PDF generation and storage complete.", {
        pdfStorageId: pdfResult.storageId,
      });
      await reporter.completeStage(currentStage);
    } else {
      pdfBuffer = documentBuffer;
    }

    // 6. Thumbnail Generation Stage
    if (isHtml) {
      currentStage = "html_thumbnail_generation";
      await reporter.updateStage(currentStage, "processing");
      jobLogger.info("Starting HTML thumbnail and screenshot generation.");

      // Generate thumbnail
      const thumbnailBuffer = await generateHtmlThumbnail(documentBuffer);
      const thumbnailResult = await objectStorage.saveAssetBuffer(
        thumbnailBuffer,
        userId,
        "documents",
        documentId,
        "thumbnail.jpg",
      );
      allArtifacts.thumbnailStorageId = thumbnailResult.storageId;

      // Generate screenshot
      const screenshotBuffer = await generateHtmlScreenshot(documentBuffer);
      const screenshotResult = await objectStorage.saveAssetBuffer(
        screenshotBuffer,
        userId,
        "documents",
        documentId,
        "screenshot.jpg",
      );
      allArtifacts.screenshotStorageId = screenshotResult.storageId;

      jobLogger.info("HTML thumbnail and screenshot generation complete.", {
        thumbnailStorageId: thumbnailResult.storageId,
        screenshotStorageId: screenshotResult.storageId,
      });
      await reporter.completeStage(currentStage);
    } else {
      currentStage = "thumbnail_generation";
      await reporter.updateStage(currentStage, "processing");
      if (pdfBuffer) {
        jobLogger.info(
          "Starting thumbnail and screenshot generation from PDF.",
        );
        const tempPdfPath = path.join(tempDir, "document.pdf");
        await fs.writeFile(tempPdfPath, pdfBuffer);

        // Generate thumbnail
        const thumbnailBuffer = await generatePdfThumbnail(tempPdfPath);
        const thumbnailResult = await objectStorage.saveAssetBuffer(
          thumbnailBuffer,
          userId,
          "documents",
          documentId,
          "thumbnail.jpg",
        );
        allArtifacts.thumbnailStorageId = thumbnailResult.storageId;

        // Generate screenshot
        const screenshotBuffer = await generatePdfScreenshot(tempPdfPath);
        const screenshotResult = await objectStorage.saveAssetBuffer(
          screenshotBuffer,
          userId,
          "documents",
          documentId,
          "screenshot.jpg",
        );
        allArtifacts.screenshotStorageId = screenshotResult.storageId;

        jobLogger.info("PDF thumbnail and screenshot generation complete.", {
          thumbnailStorageId: thumbnailResult.storageId,
          screenshotStorageId: screenshotResult.storageId,
        });
      } else {
        jobLogger.warn("Skipping thumbnail generation, no PDF available.");
      }
      await reporter.completeStage(currentStage);
    }

    // 7. Finalization and Delivery
    currentStage = "finalization";
    await reporter.updateStage(currentStage, "processing");
    jobLogger.info("Finalizing job and delivering all artifacts.");

    // Save extracted text as extracted.txt for non-Docling processed documents
    // (Docling-processed documents already have their extracted.txt saved above)
    if (allArtifacts.extractedText && !useDocling) {
      const txtResult = await objectStorage.saveAsset({
        userId,
        assetType: "documents",
        assetId: documentId,
        fileName: "extracted.txt",
        fileStream: Readable.from([allArtifacts.extractedText]),
        contentType: "text/plain",
      });
      allArtifacts.extractedTxtStorageId = txtResult.storageId;
    }
    await reporter.completeJob(allArtifacts);
    jobLogger.info("Job completed successfully.");
  } catch (error: any) {
    jobLogger.error(
      { error: error.message, stack: error.stack, currentStage },
      "Document processing job failed.",
    );

    // Enhanced error handling with context
    const errorMessage = error.message || "Unknown error";
    const isModuleError =
      errorMessage.includes("ERR_MODULE_NOT_FOUND") ||
      errorMessage.includes("Cannot find module");
    const isHappyDomError = errorMessage.includes("happy-dom");

    if (isModuleError || isHappyDomError) {
      jobLogger.warn(
        { documentId, currentStage, error: errorMessage },
        "Document processing failed with module/happy-dom error, providing fallback result",
      );

      // Provide minimal fallback artifacts for happy-dom/module errors
      try {
        const fallbackArtifacts = {
          title: `Document processing failed: ${originalFilename}`,
          description:
            "Content extraction failed due to JavaScript module error",
          tags: ["document", "processing-failed"],
          extractedText: `Failed to extract text from ${originalFilename}`,
        };
        await reporter.completeJob(fallbackArtifacts);
        return; // Don't throw error for recoverable module issues
      } catch (fallbackError: any) {
        jobLogger.error(
          { documentId, fallbackError: fallbackError.message },
          "Failed to provide fallback result",
        );
      }
    }

    // Report the error with enhanced context
    try {
      await reporter.reportError(error, currentStage);
      await reporter.failJob(errorMessage);
    } catch (reportError: any) {
      jobLogger.error(
        { documentId, reportError: reportError.message },
        "Failed to report job failure",
      );
    }

    throw error;
  } finally {
    // Enhanced cleanup with individual error handling
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        jobLogger.debug({ tempDir }, "Temp directory cleaned up successfully");
      } catch (cleanupError: any) {
        jobLogger.warn(
          { error: cleanupError.message, tempDir },
          "Failed to clean up temp directory",
        );
        // Try alternative cleanup approach
        try {
          const files = await fs.readdir(tempDir);
          for (const file of files) {
            await fs.unlink(path.join(tempDir, file)).catch(() => {});
          }
          await fs.rmdir(tempDir).catch(() => {});
        } catch (altCleanupError: any) {
          jobLogger.error(
            { error: altCleanupError.message, tempDir },
            "Alternative cleanup also failed",
          );
        }
      }
    }
  }
}

// --- Helper Functions (Consolidated, Corrected & Restored) ---

// --- Classification Helpers ---

function shouldProcessWithDocling(mimeType: string): boolean {
  const doclingSupportedTypes = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
    "image/jpeg",
    "image/png",
    "image/tiff",
    "image/bmp",
    "image/webp",
  ]);
  return doclingSupportedTypes.has(mimeType);
}

function getFileExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      ".docx",
    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      ".pptx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      ".xlsx",
    "application/vnd.oasis.opendocument.text": ".odt",
    "application/vnd.oasis.opendocument.presentation": ".odp",
    "application/vnd.oasis.opendocument.spreadsheet": ".ods",
    "text/markdown": ".md",
    "text/plain": ".txt",
    "text/rtf": ".rtf",
    "application/rtf": ".rtf",
    "application/vnd.apple.pages": ".pages",
    "application/vnd.apple.numbers": ".numbers",
    "application/vnd.apple.keynote": ".keynote",
    "text/html": ".html",
    "text/csv": ".csv",
    "image/jpeg": ".jpg",
    "image/png": ".png",
  };
  return mimeToExt[mimeType] || ".bin";
}

// --- Content Extraction Helpers ---

async function extractTextFromDocument(
  docBuffer: Buffer,
  mimeType: string,
  filename: string,
  tempDir: string,
): Promise<string> {
  // Handle simple text types that need processing
  if (mimeType === "text/plain") {
    return docBuffer.toString("utf-8");
  }

  if (mimeType === "text/markdown") {
    const rawMarkdown = docBuffer.toString("utf-8");
    return markdownToText(rawMarkdown);
  }

  if (mimeType === "text/csv") {
    return await extractTextFromCsv(docBuffer);
  }

  if (mimeType === "application/json") {
    return await extractTextFromJsonWithJq(docBuffer.toString("utf-8"));
  }

  // Handle other simple text types with basic XML/structured data cleaning
  const otherSimpleTextTypes = [
    "text/x-rst",
    "text/org",
    "text/xml",
    "application/xml",
  ];

  if (otherSimpleTextTypes.includes(mimeType)) {
    const rawText = docBuffer.toString("utf-8");
    // Clean XML tags if present
    if (mimeType === "text/xml" || mimeType === "application/xml") {
      return rawText
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    return rawText;
  }

  if (mimeType === "text/rtf" || mimeType === "application/rtf")
    return (await extractRTFText(docBuffer)).text;
  if (mimeType === "text/html")
    return (await extractTextFromHtml(docBuffer)).text;

  const tempDocPath = path.join(
    tempDir,
    `source${getFileExtensionFromMimeType(mimeType)}`,
  );
  await fs.writeFile(tempDocPath, docBuffer);

  if (mimeType === "application/pdf") return extractPdfText(tempDocPath);

  // Handle .numbers files specially since LibreOffice can't convert them to txt
  if (mimeType === "application/vnd.apple.numbers") {
    return extractNumbersDocumentText(tempDocPath, tempDir);
  }

  const officeTypes = [
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.oasis.opendocument.spreadsheet",
    "application/vnd.oasis.opendocument.presentation",
    "application/vnd.apple.pages",
    "application/vnd.apple.keynote",
  ];
  if (officeTypes.includes(mimeType))
    return extractOfficeDocumentText(tempDocPath, tempDir);

  logger.warn(
    { mimeType },
    "Unsupported file type for standard text extraction, returning empty.",
  );
  return "";
}

async function extractRTFText(
  rtfBuffer: Buffer,
): Promise<{ text: string; html: string }> {
  try {
    const rtfString = rtfBuffer.toString();
    const text = await new Promise<string>((resolve, reject) =>
      rtf2text.string(rtfString, (err: Error | null, res: string) =>
        err ? reject(err) : resolve(res || ""),
      ),
    );
    const html = await new Promise<string>((resolve, reject) =>
      rtfToHTML.fromString(rtfString, (err: Error | null, res: string) =>
        err ? reject(err) : resolve(res || ""),
      ),
    );
    if (!text && !html) throw new Error("RTF converters produced no output.");
    return { text, html };
  } catch (error) {
    logger.warn(
      { error: (error as Error).message },
      "Standard RTF parsing failed, attempting fallback.",
    );
    const rtfString = rtfBuffer.toString("utf-8");
    if (!rtfString.includes("\\rtf"))
      throw new Error("File does not appear to be valid RTF.");
    const fallbackText = rtfString
      .replace(/\\rtf\d+/gi, "")
      .replace(/\\[a-z]+\d*/gi, "")
      .replace(/\\[a-z]+/gi, "")
      .replace(/[{}]/g, "")
      .replace(/\\'/g, "'")
      .replace(/\\/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const fallbackHtml = `<html><body><p>${fallbackText}</p></body></html>`;
    return { text: fallbackText, html: fallbackHtml };
  }
}

async function extractTextFromHtml(
  htmlBuffer: Buffer,
): Promise<{ text: string }> {
  const rawHtml = htmlBuffer.toString("utf-8");

  try {
    // Use JSDOM with JavaScript execution disabled
    const dom = new JSDOM(rawHtml, {
      runScripts: "outside-only", // Disable all JavaScript execution
      // Default: no external resource loading (prevents CSS parsing errors)
    });
    const document = dom.window.document;

    // Remove all script tags to ensure no potential issues
    const scripts = document.querySelectorAll("script");
    scripts.forEach((script) => script.remove());

    const reader = new Readability(document);
    const article = reader.parse();

    return { text: htmlToText(article?.content || "", { wordwrap: false }) };
  } catch (error: any) {
    logger.warn(
      { error: error.message },
      "HTML extraction failed with JSDOM, using fallback plain text extraction",
    );

    // Fallback: simple HTML tag stripping
    const plainText = rawHtml
      .replace(/<script[\s\S]*?<\/script>/gi, "") // Remove script tags
      .replace(/<style[\s\S]*?<\/style>/gi, "") // Remove style tags
      .replace(/<[^>]*>/g, " ") // Remove all HTML tags
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim();

    return { text: plainText };
  }
}

async function extractPdfText(pdfPath: string): Promise<string> {
  return new Promise((resolve) => {
    const pdfProcess = spawn("pdftotext", [pdfPath, "-"]);
    let stdout = "";
    let stderr = "";
    pdfProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    pdfProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    pdfProcess.on("close", (code) => {
      if (code !== 0)
        logger.warn(
          { code, stderr },
          "pdftotext process exited with non-zero code.",
        );
      resolve(stdout);
    });
    pdfProcess.on("error", (err) => {
      logger.error(
        { error: err.message },
        "Failed to spawn pdftotext process.",
      );
      resolve("");
    });
  });
}

async function extractNumbersDocumentText(
  docPath: string,
  tempDir: string,
): Promise<string> {
  return new Promise(async (resolve) => {
    try {
      const csvOutputDir = path.join(tempDir, "csv_output");
      await fs.mkdir(csvOutputDir, { recursive: true });
      const libreOfficeCmd = await findLibreOfficeExecutable();
      const libreOfficeProcess = spawn(libreOfficeCmd, [
        "--headless",
        "--convert-to",
        "csv",
        "--outdir",
        csvOutputDir,
        docPath,
      ]);

      let stderr = "";
      libreOfficeProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      libreOfficeProcess.on("close", async (code) => {
        if (code === 0) {
          const files = await fs.readdir(csvOutputDir);
          const csvFile = files.find((f) => f.endsWith(".csv"));
          if (csvFile) {
            const csvBuffer = await fs.readFile(
              path.join(csvOutputDir, csvFile),
            );
            const extractedText = await extractTextFromCsv(csvBuffer);
            resolve(extractedText);
          } else {
            logger.warn(
              { docPath, files },
              "LibreOffice conversion succeeded but no CSV file found for .numbers",
            );
            resolve("");
          }
        } else {
          logger.warn(
            { code, stderr, docPath },
            "LibreOffice failed to convert .numbers file to CSV",
          );
          resolve("");
        }
      });

      libreOfficeProcess.on("error", (err) => {
        logger.error(
          { error: err.message, docPath },
          "Failed to spawn LibreOffice process for .numbers conversion",
        );
        resolve("");
      });
    } catch (error: any) {
      logger.error(
        { error: error.message, docPath },
        "Exception during .numbers text extraction",
      );
      resolve("");
    }
  });
}

async function extractOfficeDocumentText(
  docPath: string,
  tempDir: string,
): Promise<string> {
  return new Promise(async (resolve) => {
    try {
      const textOutputDir = path.join(tempDir, "text_output");
      await fs.mkdir(textOutputDir, { recursive: true });
      const libreOfficeCmd = await findLibreOfficeExecutable();
      const libreOfficeProcess = spawn(libreOfficeCmd, [
        "--headless",
        "--convert-to",
        "txt",
        "--outdir",
        textOutputDir,
        docPath,
      ]);

      let stderr = "";
      libreOfficeProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      libreOfficeProcess.on("close", async (code) => {
        if (code === 0) {
          const files = await fs.readdir(textOutputDir);
          const txtFile = files.find((f) => f.endsWith(".txt"));
          if (txtFile) {
            resolve(
              await fs.readFile(path.join(textOutputDir, txtFile), "utf-8"),
            );
          } else {
            logger.warn(
              { docPath, files },
              "LibreOffice conversion succeeded but no txt file found",
            );
            resolve("");
          }
        } else {
          logger.warn(
            { code, stderr, docPath },
            "LibreOffice failed to convert office document to txt",
          );
          resolve("");
        }
      });

      libreOfficeProcess.on("error", (err) => {
        logger.error(
          { error: err.message, docPath },
          "Failed to spawn LibreOffice process for office document conversion",
        );
        resolve("");
      });
    } catch (error: any) {
      logger.error(
        { error: error.message, docPath },
        "Exception during office document text extraction",
      );
      resolve("");
    }
  });
}

async function processWithDoclingServer(
  documentBuffer: Buffer,
  mimeType: string,
  originalFilename: string,
): Promise<any> {
  // Docling API documentation: https://github.com/docling-project/docling-serve/blob/main/docs/usage.md
  const formData = new FormData();
  formData.append("files", documentBuffer, {
    filename: originalFilename,
    contentType: mimeType,
  });

  // Set multiple output formats to get comprehensive extraction
  formData.append("to_formats", "md");
  formData.append("to_formats", "json");
  formData.append("to_formats", "text");

  // Explicitly enable OCR even though it's true by default
  formData.append("do_ocr", "true");

  // Set image export mode to placeholder for better handling
  formData.append("image_export_mode", "placeholder");

  // Set OCR engine explicitly
  // Available options: easyocr, tesserocr, tesseract, rapidocr, ocrmac
  formData.append("ocr_engine", "easyocr");

  try {
    const response = await axios.post(
      `${DOCLING_SERVER_URL}/v1/convert/file`,
      formData,
      {
        headers: { ...formData.getHeaders(), Accept: "application/json" },
        timeout: 300000,
      },
    );
    if (response.data.status !== "success") {
      throw new Error(
        `Docling processing failed: ${response.data.errors.join(", ")}`,
      );
    }
    return response.data;
  } catch (error: any) {
    logger.error(
      { error: error.message, status: error.response?.status },
      "Docling server API call failed",
    );
    throw new Error(`Docling processing failed: ${error.message}`);
  }
}

// --- AI Analysis Helpers ---

function cleanAIResponse(response: string): string {
  return response.replace(/```json\s*|```/g, "").trim();
}

async function generateDocumentMetadata(
  extractedText: string,
  originalFilename: string,
): Promise<{
  title: string | null;
  description: string | null;
  tags: string[];
}> {
  const textSample = extractedText.substring(0, 4000);
  const prompt = `Based on the following document text, generate a JSON object with a concise title, a brief description, and an array of relevant tags.\n\nFilename: ${originalFilename}\nContent: ${textSample}\n\nRespond with only a valid JSON object.`;
  const messages: AIMessage[] = [
    {
      role: "system",
      content:
        "You are an assistant that analyzes documents and generates metadata in JSON format.",
    },
    { role: "user", content: prompt },
  ];
  try {
    const aiResponse = await callAI(messages, "workers", {
      temperature: 0.1,
      maxTokens: 500,
    });
    const cleaned = cleanAIResponse(aiResponse.content);
    const parsed = JSON.parse(cleaned);
    return {
      title: parsed.title || null,
      description: parsed.description || null,
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.filter((t: any): t is string => typeof t === "string")
        : [],
    };
  } catch (error: any) {
    logger.error({ error: error.message }, "AI metadata generation failed");
    return { title: null, description: null, tags: [] };
  }
}

// --- PDF Generation Helpers ---

async function generatePdf(
  docBuffer: Buffer,
  mimeType: string,
  filename: string,
  docPath: string,
  tempDir: string,
): Promise<Buffer> {
  if (mimeType === "text/markdown")
    return generateMarkdownPdf(docBuffer.toString("utf-8"));
  if (mimeType === "text/html")
    return generateHtmlPdf(docBuffer.toString("utf-8"));
  if (mimeType === "text/plain")
    return generateTextPdf(docBuffer.toString("utf-8"));
  if (mimeType === "text/rtf" || mimeType === "application/rtf") {
    const { html } = await extractRTFText(docBuffer);
    return generateHtmlPdf(html);
  }
  return generateOfficePdf(docPath, tempDir);
}

async function generateMarkdownPdf(markdownContent: string): Promise<Buffer> {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:sans-serif;line-height:1.6;}</style></head><body>${marked(markdownContent)}</body></html>`;
  return generateHtmlPdf(html);
}

async function generateHtmlPdf(htmlContent: string): Promise<Buffer> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.setContent(htmlContent, { waitUntil: "networkidle" });
    return await page.pdf({
      format: "A4",
      margin: { top: "1in", right: "1in", bottom: "1in", left: "1in" },
      printBackground: true,
    });
  } finally {
    await browser.close();
  }
}

async function generateTextPdf(textContent: string): Promise<Buffer> {
  const escapedContent = textContent
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">");
  const html = `<html><body><pre style="white-space: pre-wrap; word-wrap: break-word; font-family: monospace;">${escapedContent}</pre></body></html>`;
  return generateHtmlPdf(html);
}

async function generateOfficePdf(
  docPath: string,
  tempDir: string,
): Promise<Buffer> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await attemptLibreOfficeConversion(docPath, tempDir);
    } catch (error) {
      logger.warn(
        { attempt, error: (error as Error).message },
        "LibreOffice conversion attempt failed",
      );
      if (attempt === 3) throw error;
      await new Promise((res) => setTimeout(res, 1000 * attempt));
    }
  }
  throw new Error("All LibreOffice conversion attempts failed");
}

async function attemptLibreOfficeConversion(
  docPath: string,
  tempDir: string,
): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const pdfOutputDir = path.join(tempDir, "pdf_output");
      await fs.mkdir(pdfOutputDir, { recursive: true });
      const libreOfficeCmd = await findLibreOfficeExecutable();
      const libreOfficeProcess = spawn(libreOfficeCmd, [
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        pdfOutputDir,
        docPath,
      ]);
      let stderr = "";
      libreOfficeProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      libreOfficeProcess.on("close", async (code) => {
        if (code === 0) {
          const files = await fs.readdir(pdfOutputDir);
          const pdfFile = files.find((f) => f.endsWith(".pdf"));
          if (pdfFile) {
            resolve(await fs.readFile(path.join(pdfOutputDir, pdfFile)));
          } else {
            reject(
              new Error(
                "LibreOffice conversion succeeded but no PDF file found",
              ),
            );
          }
        } else {
          reject(new Error(`LibreOffice failed with code ${code}: ${stderr}`));
        }
      });
      libreOfficeProcess.on("error", reject);
    } catch (error) {
      reject(error);
    }
  });
}

// --- Thumbnail Generation Helpers ---

async function generateHtmlThumbnail(htmlBuffer: Buffer): Promise<Buffer> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(htmlBuffer.toString("utf-8"), {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(1000);
    const screenshot = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: 1280, height: 800 },
    });
    // Convert to JPG and resize for thumbnail
    return await sharp(screenshot)
      .resize(600, 600, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } finally {
    await browser.close();
  }
}

async function generateHtmlScreenshot(htmlBuffer: Buffer): Promise<Buffer> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.setViewportSize({ width: 2560, height: 1600 });
    await page.setContent(htmlBuffer.toString("utf-8"), {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(1000);
    const screenshot = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: 2560, height: 1600 },
    });
    // Convert to JPG and resize for high-res screenshot
    return await sharp(screenshot)
      .resize(1920, 1440, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
  } finally {
    await browser.close();
  }
}

// Removed pdfjs-dist fallback function - using pdftocairo only

// Main PDF thumbnail generation function using pdftocairo
async function generatePdfThumbnail(pdfPath: string): Promise<Buffer> {
  try {
    // Check if pdftocairo is available
    if (await isPdftocairoAvailable()) {
      logger.debug("Using pdftocairo for PDF thumbnail generation");
      return await generatePdfThumbnailWithPdftocairo(pdfPath, 400);
    }

    // If pdftocairo is not available, log warning and use placeholder
    logger.warn("pdftocairo not available, using placeholder thumbnail");
    return generatePlaceholderThumbnail();
  } catch (error: any) {
    logger.warn(
      { error: error.message },
      "PDF thumbnail generation failed, using placeholder",
    );
    return generatePlaceholderThumbnail();
  }
}

// Generate high-resolution PDF screenshot for detail views
async function generatePdfScreenshot(pdfPath: string): Promise<Buffer> {
  try {
    // Check if pdftocairo is available
    if (await isPdftocairoAvailable()) {
      logger.debug("Using pdftocairo for PDF screenshot generation");
      return await generatePdfThumbnailWithPdftocairo(pdfPath, 1920);
    }

    // If pdftocairo is not available, log warning and use placeholder
    logger.warn("pdftocairo not available, using placeholder screenshot");
    return generatePlaceholderScreenshot();
  } catch (error: any) {
    logger.warn(
      { error: error.message },
      "PDF screenshot generation failed, using placeholder",
    );
    return generatePlaceholderScreenshot();
  }
}

async function generatePlaceholderThumbnail(): Promise<Buffer> {
  const htmlContent = `<!DOCTYPE html><html><head><style>body{margin:0;width:800px;height:600px;background:#f0f2f5;display:flex;justify-content:center;align-items:center;font-family:sans-serif;color:#a0aec0;}.icon{font-size:120px;}</style></head><body><div class="icon">📄</div></body></html>`;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.setContent(htmlContent);
    const screenshot = await page.screenshot({ type: "png" });
    // Convert to JPG for consistency
    return await sharp(screenshot).jpeg({ quality: 85 }).toBuffer();
  } finally {
    await browser.close();
  }
}

async function generatePlaceholderScreenshot(): Promise<Buffer> {
  const htmlContent = `<!DOCTYPE html><html><head><style>body{margin:0;width:1920px;height:1440px;background:#f0f2f5;display:flex;justify-content:center;align-items:center;font-family:sans-serif;color:#a0aec0;}.icon{font-size:320px;}</style></head><body><div class="icon">📄</div></body></html>`;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.setContent(htmlContent);
    const screenshot = await page.screenshot({ type: "png" });
    // Convert to JPG for consistency
    return await sharp(screenshot).jpeg({ quality: 90 }).toBuffer();
  } finally {
    await browser.close();
  }
}

// --- Utility Helpers ---

async function findLibreOfficeExecutable(): Promise<string> {
  const candidates = [
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    "/usr/bin/libreoffice",
    "libreoffice",
    "soffice",
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error(
    "LibreOffice executable not found. Please ensure it is installed and in the system PATH.",
  );
}

/**
 * Extracts searchable text from CSV by converting each row to descriptive sentences.
 * Uses the header row to create meaningful descriptions for each data row.
 */
async function extractTextFromCsv(csvBuffer: Buffer): Promise<string> {
  try {
    const csvContent = csvBuffer.toString("utf-8");
    const lines = csvContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      return "";
    }

    // Parse CSV manually (simple approach - assumes no commas in quoted fields for now)
    const parseCSVLine = (line: string): string[] => {
      // Simple CSV parsing - split by comma and trim whitespace
      return line.split(",").map((field) => field.trim().replace(/^"|"$/g, ""));
    };

    const firstLine = lines[0];
    if (!firstLine) {
      return "";
    }

    const headers = parseCSVLine(firstLine);
    const dataRows = lines.slice(1);

    const descriptiveRows: string[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const currentRow = dataRows[i];
      if (!currentRow) continue;

      const row = parseCSVLine(currentRow);
      if (row.length === 0) continue;

      const descriptions: string[] = [];
      for (let j = 0; j < Math.min(headers.length, row.length); j++) {
        const header = headers[j];
        const value = row[j];
        if (header && value && header.trim() && value.trim()) {
          const trimmedHeader = header.trim();
          const trimmedValue = value.trim();
          if (trimmedHeader && trimmedValue) {
            descriptions.push(`${trimmedHeader} is ${trimmedValue}`);
          }
        }
      }

      if (descriptions.length > 0) {
        descriptiveRows.push(`Row: ${descriptions.join(". ")}.`);
      }
    }

    return descriptiveRows.join("\n");
  } catch (error) {
    logger.warn(
      { error: (error as Error).message },
      "CSV parsing failed, falling back to raw text",
    );
    return csvBuffer.toString("utf-8");
  }
}

/**
 * Uses the 'jq' command-line tool to extract searchable text from a JSON string.
 * @param jsonString The raw JSON content as a string.
 * @returns A Promise that resolves to a single string of clean, searchable text.
 */
async function extractTextFromJsonWithJq(jsonString: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // The jq command and its arguments
    const jqCommand =
      '.. | strings? | select(test("^https?://|^-|@|/|\\\\.") | not)';

    const jqProcess = spawn("jq", ["-r", jqCommand]);

    let output = "";
    let errorOutput = "";

    jqProcess.stdout.on("data", (data) => {
      output += data.toString();
    });

    jqProcess.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    jqProcess.on("close", (code) => {
      if (code !== 0) {
        logger.warn(
          { code, error: errorOutput },
          "jq process failed, falling back to simple JSON text extraction",
        );
        // Fallback to simple JSON text extraction
        resolve(extractTextFromJsonFallback(jsonString));
        return;
      }
      // The output will be lines of text, join them with spaces.
      resolve(output.replace(/\n/g, " ").trim());
    });

    jqProcess.on("error", (err) => {
      logger.warn(
        { error: err.message },
        "jq command not found, falling back to simple JSON text extraction",
      );
      // Fallback to simple JSON text extraction
      resolve(extractTextFromJsonFallback(jsonString));
    });

    // Pipe the JSON string into the jq process
    jqProcess.stdin.write(jsonString);
    jqProcess.stdin.end();
  });
}

/**
 * Fallback JSON text extraction when jq is not available.
 */
function extractTextFromJsonFallback(jsonString: string): string {
  try {
    const json = JSON.parse(jsonString);
    return extractTextFromObject(json);
  } catch (error) {
    logger.warn(
      { error: (error as Error).message },
      "JSON parsing failed, returning raw content",
    );
    return jsonString;
  }
}

/**
 * Recursively extracts text values from a JSON object.
 */
function extractTextFromObject(obj: any): string {
  const textValues: string[] = [];

  function traverse(value: any) {
    if (typeof value === "string") {
      // Skip URLs, file paths, and other non-textual strings
      if (!/^https?:\/\/|^-|@|\/|\\\./.test(value)) {
        textValues.push(value);
      }
    } else if (typeof value === "number") {
      textValues.push(value.toString());
    } else if (Array.isArray(value)) {
      value.forEach(traverse);
    } else if (typeof value === "object" && value !== null) {
      Object.values(value).forEach(traverse);
    }
  }

  traverse(obj);
  return textValues.join(" ");
}
