// src/workers/document-processor.ts

import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { type AIMessage, callAI } from "@eclaire/ai";
import type { JobContext } from "@eclaire/queue/core";
import { Readability } from "@mozilla/readability";
import axios from "axios";
import { parse as parseCsv } from "csv-parse/sync";
import { execa } from "execa";
import FormData from "form-data";
import { convert as htmlToText } from "html-to-text";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import { type Browser, chromium } from "patchright";
import sharp from "sharp";
import { createChildLogger } from "../../lib/logger.js";
import { buildKey, getStorage } from "../../lib/storage/index.js";
import { config } from "../config.js";

// Use createRequire for CJS-only packages in ESM context
const require = createRequire(import.meta.url);
const rtfToHTML = require("@iarna/rtf-to-html");
const rtf2text = require("rtf2text");
// Removed pdfjs-dist and canvas dependencies - using pdftocairo instead

const logger = createChildLogger("document-processor");
const DOCLING_SERVER_URL = config.docling.url;

// Check if pdftocairo is available on the system (cached after first check)
let _pdftocairoAvailable: boolean | null = null;
async function isPdftocairoAvailable(): Promise<boolean> {
  if (_pdftocairoAvailable !== null) return _pdftocairoAvailable;
  try {
    await execa("pdftocairo", ["-v"]);
    _pdftocairoAvailable = true;
  } catch (_error) {
    logger.debug("pdftocairo not available");
    _pdftocairoAvailable = false;
  }
  return _pdftocairoAvailable;
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
    const result = await execa(
      "pdftocairo",
      [
        "-png",
        "-f",
        "1", // first page
        "-l",
        "1", // last page (same as first)
        "-scale-to",
        renderScale.toString(), // scale to specified width
        pdfPath,
        outputBaseName, // output without extension
      ],
      { timeout: 120_000 },
    );

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

    // Convert and resize based on scale
    const targetWidth = scale === 400 ? 600 : 1920;
    const targetHeight = scale === 400 ? 600 : 1440;
    const isThumbnail = scale === 400;

    const resized = sharp(pngBuffer).resize(targetWidth, targetHeight, {
      fit: "inside",
      withoutEnlargement: true,
    });
    const encoded = isThumbnail
      ? resized.webp({ quality: 80 })
      : resized.jpeg({ quality: 90 });
    const outputBuffer = await encoded.toBuffer();

    // Clean up temp file
    await fs.unlink(outputPath).catch(() => {});

    logger.debug(
      { scale, isThumbnail, targetWidth, targetHeight, renderScale },
      "pdftocairo thumbnail generation successful",
    );
    return outputBuffer;
  } catch (error: unknown) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        pdfPath,
      },
      "pdftocairo thumbnail generation failed",
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

export interface DocumentJobData {
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
  // extractedText is stored in blob storage via extractedTxtStorageId, not inline
  extractedMdStorageId?: string;
  extractedTxtStorageId?: string;
  pdfStorageId?: string;
  thumbnailStorageId?: string;
  screenshotStorageId?: string;
}

// --- Main Job Processor ---

export async function processDocumentJob(ctx: JobContext<DocumentJobData>) {
  const { documentId, storageId, mimeType, userId, originalFilename } =
    ctx.job.data;
  const jobLogger = logger.child({
    jobId: ctx.job.id,
    documentId,
    userId,
    storageId,
  });

  // Validate required job data
  if (!documentId || !userId) {
    throw new Error(
      `Missing required job data: documentId=${documentId}, userId=${userId}`,
    );
  }
  if (!storageId || storageId.trim() === "") {
    const errorMsg = `Invalid or missing storageId for document ${documentId}. Received: ${storageId}`;
    jobLogger.error({ documentId, jobId: ctx.job.id, storageId }, errorMsg);
    throw new Error(errorMsg);
  }

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
    await ctx.initStages(stages);

    // 2. Preparation Stage
    currentStage = "preparation";
    await ctx.startStage(currentStage);
    jobLogger.info("Starting preparation stage.");
    tempDir = await fs.mkdtemp(path.join(tmpdir(), `doc-proc-${documentId}-`));
    const storage = getStorage();

    // Check file size before downloading to prevent OOM on very large files
    const MAX_DOCUMENT_SIZE = 200 * 1024 * 1024; // 200MB
    const meta = await storage.head(storageId);
    if (meta && meta.size > MAX_DOCUMENT_SIZE) {
      throw new Error(
        `Document too large: ${meta.size} bytes exceeds ${MAX_DOCUMENT_SIZE} byte limit`,
      );
    }

    const { buffer: documentBuffer } = await storage.readBuffer(storageId);
    jobLogger.info(
      { bufferSize: documentBuffer.length },
      "Document downloaded.",
    );
    await ctx.completeStage(currentStage);

    // 3. Content Extraction Stage
    let extractedText = "";
    if (useDocling) {
      currentStage = "docling_processing";
      await ctx.startStage(currentStage);
      jobLogger.info("Starting Docling processing.");
      try {
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
        const doclingJsonKey = buildKey(
          userId,
          "documents",
          documentId,
          "docling.json",
        );
        await storage.write(
          doclingJsonKey,
          Readable.from([
            JSON.stringify(doclingResult, null, 2),
          ]) as unknown as NodeJS.ReadableStream,
          { contentType: "application/json" },
        );

        // Save individual format outputs
        if (doclingResult.document.md_content) {
          const mdKey = buildKey(
            userId,
            "documents",
            documentId,
            "extracted.md",
          );
          await storage.write(
            mdKey,
            Readable.from([
              doclingResult.document.md_content,
            ]) as unknown as NodeJS.ReadableStream,
            { contentType: "text/markdown" },
          );
          allArtifacts.extractedMdStorageId = mdKey;
        }

        // Save the cleaned plain text as extracted.txt
        if (extractedText) {
          const txtKey = buildKey(
            userId,
            "documents",
            documentId,
            "extracted.txt",
          );
          await storage.write(
            txtKey,
            Readable.from([extractedText]) as unknown as NodeJS.ReadableStream,
            { contentType: "text/plain" },
          );
          allArtifacts.extractedTxtStorageId = txtKey;
        }

        if (doclingResult.document.json_content) {
          const extractedJsonKey = buildKey(
            userId,
            "documents",
            documentId,
            "extracted.json",
          );
          await storage.write(
            extractedJsonKey,
            Readable.from([
              JSON.stringify(doclingResult.document.json_content, null, 2),
            ]) as unknown as NodeJS.ReadableStream,
            { contentType: "application/json" },
          );
        }
        jobLogger.info(
          { textLength: extractedText.length },
          "Docling processing complete.",
        );
      } catch (doclingError: unknown) {
        const errMsg =
          doclingError instanceof Error
            ? doclingError.message
            : String(doclingError);
        jobLogger.warn(
          { error: errMsg },
          "Docling processing failed, falling back to standard extraction",
        );
        try {
          extractedText = await extractTextFromDocument(
            documentBuffer,
            mimeType,
            originalFilename,
            tempDir,
          );
        } catch (fallbackError: unknown) {
          jobLogger.warn(
            {
              error:
                fallbackError instanceof Error
                  ? fallbackError.message
                  : String(fallbackError),
            },
            "Standard extraction fallback also failed after Docling failure",
          );
          allArtifacts.description = `Content extraction failed: ${errMsg}`;
          allArtifacts.tags = ["extraction-failed"];
        }
      }
    } else {
      currentStage = "content_extraction";
      await ctx.startStage(currentStage);
      jobLogger.info("Starting standard content extraction.");
      try {
        extractedText = await extractTextFromDocument(
          documentBuffer,
          mimeType,
          originalFilename,
          tempDir,
        );
      } catch (extractionError: unknown) {
        const errMsg =
          extractionError instanceof Error
            ? extractionError.message
            : String(extractionError);
        jobLogger.warn({ error: errMsg }, "Content extraction failed");
        allArtifacts.description = `Content extraction failed: ${errMsg}`;
        allArtifacts.tags = ["extraction-failed"];
      }
      jobLogger.info(
        { textLength: extractedText.length },
        "Standard content extraction complete.",
      );
    }

    // Surface a warning if extraction produced no text
    if (!extractedText || extractedText.trim().length === 0) {
      jobLogger.warn("Content extraction produced no text");
      allArtifacts.description ??=
        "No text could be extracted from this document";
      if (!allArtifacts.tags?.includes("extraction-failed")) {
        allArtifacts.tags = [...(allArtifacts.tags || []), "extraction-empty"];
      }
    }

    await ctx.completeStage(currentStage);
    // extractedText is stored via extractedTxtStorageId, not inline in artifacts

    // 4. AI Analysis Stage
    currentStage = "ai_analysis";
    await ctx.startStage(currentStage);
    if (extractedText && extractedText.length > 50) {
      jobLogger.info("Starting AI metadata analysis.");
      const aiMetadata = await generateDocumentMetadata(
        extractedText,
        originalFilename,
      );
      Object.assign(allArtifacts, aiMetadata);
      jobLogger.info(
        { title: aiMetadata.title, tags: aiMetadata.tags },
        "AI metadata analysis complete",
      );
    } else {
      jobLogger.info("Skipping AI analysis due to insufficient text.");
    }
    await ctx.completeStage(currentStage);

    // 5. PDF Generation + 6. Thumbnail Generation
    // For HTML documents, share a single Chromium browser across both stages
    let pdfBuffer: Buffer | null = null;
    if (isHtml) {
      const htmlBrowser = await chromium.launch();
      try {
        // 5a. PDF Generation Stage (HTML)
        currentStage = "pdf_generation";
        await ctx.startStage(currentStage);
        jobLogger.info("Starting PDF generation.");
        pdfBuffer = await generateHtmlPdf(
          documentBuffer.toString("utf-8"),
          htmlBrowser,
        );
        const pdfKey = buildKey(
          userId,
          "documents",
          documentId,
          "converted.pdf",
        );
        await storage.writeBuffer(pdfKey, pdfBuffer, {
          contentType: "application/pdf",
        });
        allArtifacts.pdfStorageId = pdfKey;
        jobLogger.info(
          { pdfStorageId: pdfKey },
          "PDF generation and storage complete",
        );
        await ctx.completeStage(currentStage);

        // 6a. Thumbnail Generation Stage (HTML)
        currentStage = "html_thumbnail_generation";
        await ctx.startStage(currentStage);
        jobLogger.info("Starting HTML thumbnail and screenshot generation.");

        const { thumbnail: thumbnailBuffer, screenshot: screenshotBuffer } =
          await generateHtmlThumbnailAndScreenshot(documentBuffer, htmlBrowser);

        const thumbnailKey = buildKey(
          userId,
          "documents",
          documentId,
          "thumbnail.webp",
        );
        const screenshotKey = buildKey(
          userId,
          "documents",
          documentId,
          "screenshot.jpg",
        );
        await Promise.all([
          storage.writeBuffer(thumbnailKey, thumbnailBuffer, {
            contentType: "image/webp",
          }),
          storage.writeBuffer(screenshotKey, screenshotBuffer, {
            contentType: "image/jpeg",
          }),
        ]);
        allArtifacts.thumbnailStorageId = thumbnailKey;
        allArtifacts.screenshotStorageId = screenshotKey;

        jobLogger.info(
          {
            thumbnailStorageId: thumbnailKey,
            screenshotStorageId: screenshotKey,
          },
          "HTML thumbnail and screenshot generation complete",
        );
        await ctx.completeStage(currentStage);
      } finally {
        await htmlBrowser.close();
      }
    } else {
      // 5b. PDF Generation Stage (non-HTML)
      if (needsPdf) {
        currentStage = "pdf_generation";
        await ctx.startStage(currentStage);
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
        const pdfKey = buildKey(
          userId,
          "documents",
          documentId,
          "converted.pdf",
        );
        await storage.writeBuffer(pdfKey, pdfBuffer, {
          contentType: "application/pdf",
        });
        allArtifacts.pdfStorageId = pdfKey;
        jobLogger.info(
          { pdfStorageId: pdfKey },
          "PDF generation and storage complete",
        );
        await ctx.completeStage(currentStage);
      } else {
        pdfBuffer = documentBuffer;
      }

      // 6b. Thumbnail Generation Stage (non-HTML)
      currentStage = "thumbnail_generation";
      await ctx.startStage(currentStage);
      if (pdfBuffer) {
        jobLogger.info(
          "Starting thumbnail and screenshot generation from PDF.",
        );
        const tempPdfPath = path.join(tempDir, "document.pdf");
        await fs.writeFile(tempPdfPath, pdfBuffer);

        // Generate thumbnail
        const thumbnailBuffer = await generatePdfThumbnail(tempPdfPath);
        const thumbnailKey = buildKey(
          userId,
          "documents",
          documentId,
          "thumbnail.webp",
        );
        await storage.writeBuffer(thumbnailKey, thumbnailBuffer, {
          contentType: "image/webp",
        });
        allArtifacts.thumbnailStorageId = thumbnailKey;

        // Generate screenshot
        const screenshotBuffer = await generatePdfScreenshot(tempPdfPath);
        const screenshotKey = buildKey(
          userId,
          "documents",
          documentId,
          "screenshot.jpg",
        );
        await storage.writeBuffer(screenshotKey, screenshotBuffer, {
          contentType: "image/jpeg",
        });
        allArtifacts.screenshotStorageId = screenshotKey;

        jobLogger.info(
          {
            thumbnailStorageId: thumbnailKey,
            screenshotStorageId: screenshotKey,
          },
          "PDF thumbnail and screenshot generation complete",
        );
      } else {
        jobLogger.warn("Skipping thumbnail generation, no PDF available.");
      }
      await ctx.completeStage(currentStage);
    }

    // 7. Finalization and Delivery
    currentStage = "finalization";
    await ctx.startStage(currentStage);
    jobLogger.info("Finalizing job and delivering all artifacts.");

    // Save extracted text as extracted.txt for non-Docling processed documents
    // (Docling-processed documents already have their extracted.txt saved above)
    if (extractedText && !useDocling) {
      const txtKey = buildKey(userId, "documents", documentId, "extracted.txt");
      await storage.write(
        txtKey,
        Readable.from([extractedText]) as unknown as NodeJS.ReadableStream,
        { contentType: "text/plain" },
      );
      allArtifacts.extractedTxtStorageId = txtKey;

      // Also generate a markdown version for richer Content tab display and AI consumption
      const mdContent = generateMarkdownContent(
        documentBuffer,
        extractedText,
        mimeType,
        originalFilename,
      );
      if (mdContent) {
        const mdKey = buildKey(userId, "documents", documentId, "extracted.md");
        await storage.write(
          mdKey,
          Readable.from([mdContent]) as unknown as NodeJS.ReadableStream,
          { contentType: "text/markdown" },
        );
        allArtifacts.extractedMdStorageId = mdKey;
      }
    }
    // Complete the final stage with all artifacts - job completion is implicit when handler returns
    await ctx.completeStage(
      currentStage,
      allArtifacts as Record<string, unknown>,
    );
    jobLogger.info("Job completed successfully.");
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    jobLogger.error(
      { error: errMsg, stack: errStack, currentStage },
      "Document processing job failed.",
    );

    // Report the error on the current stage
    try {
      await ctx.failStage(
        currentStage,
        error instanceof Error ? error : new Error(String(error)),
      );
    } catch (reportError: unknown) {
      jobLogger.error(
        {
          documentId,
          reportError:
            reportError instanceof Error
              ? reportError.message
              : String(reportError),
        },
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
      } catch (cleanupError: unknown) {
        jobLogger.warn(
          {
            error:
              cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError),
            tempDir,
          },
          "Failed to clean up temp directory",
        );
        // Try alternative cleanup approach
        try {
          const files = await fs.readdir(tempDir);
          for (const file of files) {
            await fs.unlink(path.join(tempDir, file)).catch(() => {});
          }
          await fs.rmdir(tempDir).catch(() => {});
        } catch (altCleanupError: unknown) {
          jobLogger.error(
            {
              error:
                altCleanupError instanceof Error
                  ? altCleanupError.message
                  : String(altCleanupError),
              tempDir,
            },
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
  _filename: string,
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
    return extractTextFromCsv(docBuffer);
  }

  if (mimeType === "application/json") {
    return extractTextFromJson(docBuffer.toString("utf-8"));
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
    // Preserve XML structure as-is — LLMs handle XML natively.
    // Just strip processing instructions and comments for cleaner indexing.
    if (mimeType === "text/xml" || mimeType === "application/xml") {
      return rawText
        .replace(/<\?xml[^?]*\?>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "")
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

  throw new Error(`Unsupported file type for text extraction: ${mimeType}`);
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
        // oxlint-disable-next-line promise/no-multiple-resolved -- ternary ensures exactly one branch
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
    // Use JSDOM with no JavaScript execution (omitting runScripts = scripts disabled by default)
    const dom = new JSDOM(rawHtml);
    const document = dom.window.document;

    // Remove all script tags to ensure no potential issues
    const scripts = document.querySelectorAll("script");
    scripts.forEach((script) => {
      script.remove();
    });

    const reader = new Readability(document);
    const article = reader.parse();

    return { text: htmlToText(article?.content || "", { wordwrap: false }) };
  } catch (error: unknown) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
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
  const { stdout } = await execa("pdftotext", [pdfPath, "-"], {
    timeout: 120_000,
  });
  return stdout;
}

async function extractNumbersDocumentText(
  docPath: string,
  tempDir: string,
): Promise<string> {
  try {
    const csvOutputDir = path.join(tempDir, "csv_output");
    await fs.mkdir(csvOutputDir, { recursive: true });
    const libreOfficeCmd = await findLibreOfficeExecutable();
    await execa(
      libreOfficeCmd,
      ["--headless", "--convert-to", "csv", "--outdir", csvOutputDir, docPath],
      { timeout: 120_000 },
    );
    const files = await fs.readdir(csvOutputDir);
    const csvFile = files.find((f) => f.endsWith(".csv"));
    if (csvFile) {
      const csvBuffer = await fs.readFile(path.join(csvOutputDir, csvFile));
      return extractTextFromCsv(csvBuffer);
    }
    throw new Error(
      `LibreOffice conversion succeeded but no CSV file found for .numbers (files: ${files.join(", ")})`,
    );
  } catch (error: unknown) {
    throw error instanceof Error
      ? error
      : new Error(
          `Failed to extract text from .numbers file: ${String(error)}`,
        );
  }
}

async function extractOfficeDocumentText(
  docPath: string,
  tempDir: string,
): Promise<string> {
  try {
    const textOutputDir = path.join(tempDir, "text_output");
    await fs.mkdir(textOutputDir, { recursive: true });
    const libreOfficeCmd = await findLibreOfficeExecutable();
    await execa(
      libreOfficeCmd,
      ["--headless", "--convert-to", "txt", "--outdir", textOutputDir, docPath],
      { timeout: 120_000 },
    );
    const files = await fs.readdir(textOutputDir);
    const txtFile = files.find((f) => f.endsWith(".txt"));
    if (txtFile) {
      return await fs.readFile(path.join(textOutputDir, txtFile), "utf-8");
    }
    throw new Error(
      `LibreOffice conversion succeeded but no txt file found (files: ${files.join(", ")})`,
    );
  } catch (error: unknown) {
    throw error instanceof Error
      ? error
      : new Error(
          `Failed to extract text from office document: ${String(error)}`,
        );
  }
}

async function processWithDoclingServer(
  documentBuffer: Buffer,
  mimeType: string,
  originalFilename: string,
  // biome-ignore lint/suspicious/noExplicitAny: Docling API response has variable structure
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
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStatus =
      error != null && typeof error === "object" && "response" in error
        ? (error as { response?: { status?: number } }).response?.status
        : undefined;
    logger.error(
      { error: errMsg, status: errStatus },
      "Docling server API call failed",
    );
    throw new Error(`Docling processing failed: ${errMsg}`);
  }
}

// --- AI Analysis Helpers ---

function cleanAIResponse(response: string): string {
  return response.replace(/```json\s*|```/g, "").trim();
}

/**
 * Sample text from beginning, middle, and end of a document for better AI analysis.
 * For short documents the full text is returned; for long ones we take representative slices.
 */
function sampleDocumentText(text: string, budget = 4000): string {
  if (text.length <= budget) return text;
  const introLen = Math.floor(budget * 0.5);
  const midLen = Math.floor(budget * 0.25);
  const outroLen = budget - introLen - midLen;
  const intro = text.substring(0, introLen);
  const midStart = Math.floor(text.length / 2) - Math.floor(midLen / 2);
  const middle = text.substring(midStart, midStart + midLen);
  const outro = text.substring(text.length - outroLen);
  return `[Document length: ${text.length} characters]\n\n--- Beginning ---\n${intro}\n\n--- Middle ---\n${middle}\n\n--- End ---\n${outro}`;
}

async function generateDocumentMetadata(
  extractedText: string,
  originalFilename: string,
): Promise<{
  title: string | null;
  description: string | null;
  tags: string[];
}> {
  const textSample = sampleDocumentText(extractedText);
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
        ? parsed.tags.filter((t: unknown): t is string => typeof t === "string")
        : [],
    };
  } catch (error: unknown) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "AI metadata generation failed",
    );
    return { title: null, description: null, tags: [] };
  }
}

// --- PDF Generation Helpers ---

async function generatePdf(
  docBuffer: Buffer,
  mimeType: string,
  _filename: string,
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

async function generateHtmlPdf(
  htmlContent: string,
  existingBrowser?: Browser,
): Promise<Buffer> {
  const browser = existingBrowser ?? (await chromium.launch());
  const page = await browser.newPage();
  try {
    // Block network requests to prevent SSRF from user-uploaded HTML
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith("data:") || url === "about:blank") {
        return route.continue();
      }
      return route.abort();
    });
    await page.setContent(htmlContent, { waitUntil: "domcontentloaded" });
    return await page.pdf({
      format: "A4",
      margin: { top: "1in", right: "1in", bottom: "1in", left: "1in" },
      printBackground: true,
    });
  } finally {
    await page.close();
    if (!existingBrowser) await browser.close();
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
  const pdfOutputDir = path.join(tempDir, "pdf_output");
  await fs.mkdir(pdfOutputDir, { recursive: true });
  const libreOfficeCmd = await findLibreOfficeExecutable();
  await execa(
    libreOfficeCmd,
    ["--headless", "--convert-to", "pdf", "--outdir", pdfOutputDir, docPath],
    { timeout: 120_000 },
  );
  const files = await fs.readdir(pdfOutputDir);
  const pdfFile = files.find((f) => f.endsWith(".pdf"));
  if (pdfFile) {
    return await fs.readFile(path.join(pdfOutputDir, pdfFile));
  }
  throw new Error("LibreOffice conversion succeeded but no PDF file found");
}

// --- Thumbnail Generation Helpers ---

async function generateHtmlThumbnailAndScreenshot(
  htmlBuffer: Buffer,
  existingBrowser?: Browser,
): Promise<{ thumbnail: Buffer; screenshot: Buffer }> {
  const browser = existingBrowser ?? (await chromium.launch());
  const page = await browser.newPage();
  try {
    // Block network requests to prevent SSRF from user-uploaded HTML
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith("data:") || url === "about:blank") {
        return route.continue();
      }
      return route.abort();
    });
    // Render at high-res, then derive both sizes from the same capture
    await page.setViewportSize({ width: 2560, height: 1600 });
    await page.setContent(htmlBuffer.toString("utf-8"), {
      waitUntil: "domcontentloaded",
    });
    const screenshotPng = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: 2560, height: 1600 },
    });

    const [screenshot, thumbnail] = await Promise.all([
      sharp(screenshotPng)
        .resize(1920, 1440, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer(),
      sharp(screenshotPng)
        .resize(600, 600, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer(),
    ]);

    return { thumbnail, screenshot };
  } finally {
    await page.close();
    if (!existingBrowser) await browser.close();
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
  } catch (error: unknown) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
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
  } catch (error: unknown) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "PDF screenshot generation failed, using placeholder",
    );
    return generatePlaceholderScreenshot();
  }
}

function generatePlaceholderSvg(width: number, height: number): Buffer {
  const fontSize = Math.round(Math.min(width, height) * 0.15);
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="#f0f2f5"/>
    <text x="${width / 2}" y="${height / 2 + fontSize * 0.35}" text-anchor="middle" font-family="sans-serif" font-size="${fontSize}" fill="#a0aec0">DOC</text>
  </svg>`;
  return Buffer.from(svg);
}

async function generatePlaceholderThumbnail(): Promise<Buffer> {
  return sharp(generatePlaceholderSvg(800, 600))
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function generatePlaceholderScreenshot(): Promise<Buffer> {
  return sharp(generatePlaceholderSvg(1920, 1440))
    .jpeg({ quality: 90 })
    .toBuffer();
}

// --- Utility Helpers ---

let _libreOfficeExecutable: string | null = null;
async function findLibreOfficeExecutable(): Promise<string> {
  if (_libreOfficeExecutable !== null) return _libreOfficeExecutable;
  const candidates = [
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    "/usr/bin/libreoffice",
    "libreoffice",
    "soffice",
  ];
  for (const candidate of candidates) {
    try {
      if (path.isAbsolute(candidate)) {
        await fs.access(candidate);
      } else {
        // For non-absolute paths, probe via PATH by running the command
        await execa(candidate, ["--version"]);
      }
      _libreOfficeExecutable = candidate;
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
function extractTextFromCsv(csvBuffer: Buffer): string {
  try {
    const MAX_CSV_ROWS = 10_000;
    const records: Record<string, string>[] = parseCsv(csvBuffer, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      relax_column_count: true,
      trim: true,
      to: MAX_CSV_ROWS,
    });

    if (records.length === 0) return "";

    const descriptiveRows: string[] = [];
    for (const record of records) {
      const descriptions: string[] = [];
      for (const [header, value] of Object.entries(record)) {
        if (header.trim() && value.trim()) {
          descriptions.push(`${header.trim()} is ${value.trim()}`);
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
 * Extracts searchable text from JSON, preserving key names as context.
 * Produces "key: value" pairs so LLMs and search can understand the structure.
 */
function extractTextFromJson(jsonString: string): string {
  try {
    const json = JSON.parse(jsonString);
    const lines: string[] = [];
    const MAX_DEPTH = 50;

    // biome-ignore lint/suspicious/noExplicitAny: recursive JSON traversal handles arbitrary nested structures
    function traverse(value: any, key?: string, depth = 0) {
      if (depth > MAX_DEPTH) return;
      if (typeof value === "string") {
        lines.push(key ? `${key}: ${value}` : value);
      } else if (typeof value === "number" || typeof value === "boolean") {
        lines.push(key ? `${key}: ${value}` : String(value));
      } else if (Array.isArray(value)) {
        for (const item of value) {
          traverse(item, key, depth + 1);
        }
      } else if (typeof value === "object" && value !== null) {
        for (const [k, v] of Object.entries(value)) {
          traverse(v, k, depth + 1);
        }
      }
    }

    traverse(json);
    return lines.join("\n");
  } catch (error) {
    logger.warn(
      { error: (error as Error).message },
      "JSON parsing failed, returning raw content",
    );
    return jsonString;
  }
}

/**
 * Generates a markdown representation of document content for the Content tab and AI.
 * For text-based formats processed via the standard (non-Docling) path, this produces
 * a richer version than plain text: markdown files pass through as-is, CSVs become tables,
 * JSON/XML get fenced code blocks, and other formats use the extracted text directly.
 */
function generateMarkdownContent(
  originalBuffer: Buffer,
  extractedText: string,
  mimeType: string,
  filename: string,
): string | null {
  try {
    switch (mimeType) {
      // Markdown files: the original IS the markdown — use it directly
      case "text/markdown":
        return originalBuffer.toString("utf-8");

      // CSV: parse into a markdown table
      case "text/csv":
        return csvToMarkdownTable(originalBuffer);

      // JSON: wrap in a fenced code block
      case "application/json":
        return `\`\`\`json\n${originalBuffer.toString("utf-8").trim()}\n\`\`\``;

      // XML: wrap in a fenced code block
      case "application/xml":
      case "text/xml":
        return `\`\`\`xml\n${originalBuffer.toString("utf-8").trim()}\n\`\`\``;

      // HTML: use the extracted text (Readability-cleaned) as-is
      // Plain text, RTF, and Office docs: extracted text is already usable
      default:
        return extractedText || null;
    }
  } catch (error) {
    logger.warn(
      {
        mimeType,
        filename,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to generate markdown content, skipping",
    );
    return null;
  }
}

/**
 * Converts a CSV buffer into a markdown table.
 * Falls back to the raw CSV text if parsing fails.
 */
function csvToMarkdownTable(csvBuffer: Buffer): string {
  const MAX_ROWS = 10_000;
  const records: Record<string, string>[] = parseCsv(csvBuffer, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
    to: MAX_ROWS,
  });

  if (records.length === 0 || !records[0]) return csvBuffer.toString("utf-8");

  const headers = Object.keys(records[0]);
  if (headers.length === 0) return csvBuffer.toString("utf-8");

  const escapeCell = (val: string) =>
    val.replace(/\|/g, "\\|").replace(/\n/g, " ");

  const headerRow = `| ${headers.map(escapeCell).join(" | ")} |`;
  const separatorRow = `| ${headers.map(() => "---").join(" | ")} |`;
  const dataRows = records.map(
    (record) =>
      `| ${headers.map((h) => escapeCell(record[h] || "")).join(" | ")} |`,
  );

  return [headerRow, separatorRow, ...dataRows].join("\n");
}
