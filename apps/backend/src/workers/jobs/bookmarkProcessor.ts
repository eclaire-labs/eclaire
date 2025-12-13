import { type Job, Worker } from "bullmq";
import { type BrowserContext, chromium, type Page } from "patchright";
import sharp from "sharp";
import { Readable } from "stream";
import { config } from "../config.js";
import {
  type BookmarkHandlerType,
  type BookmarkJobData,
  extractContentFromHtml,
  generateBookmarkTags,
  generateOptimizedPdf,
  getHandlerForUrl,
  normalizeUrl,
  processGitHubBookmark,
  validateApiCredentials,
} from "../lib/bookmarks/index.js";
import { processRedditApiBookmark } from "../lib/bookmarks/reddit-api.js";
import { domainRateLimiter } from "../lib/domainRateLimiter.js";
import { createRateLimitError } from "../lib/job-utils.js";
import { createChildLogger } from "../../lib/logger.js";
import {
  createProcessingReporter,
  type ProcessingReporter,
} from "../lib/processing-reporter.js";
import { objectStorage } from "../../lib/storage.js";
import { TimeoutError, withTimeout } from "../lib/utils/timeout.js";

const logger = createChildLogger("bookmark-processor");

// Validate API credentials on startup
validateApiCredentials();

/**
 * Regular bookmark processing handler using the new reporter pattern.
 */
async function processRegularBookmarkJob(
  job: Job<BookmarkJobData>,
  reporter: ProcessingReporter,
) {
  const { bookmarkId, url: originalUrl, userId } = job.data;
  logger.info({ bookmarkId, userId }, "Processing with REGULAR handler");
  let browser: any = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  const allArtifacts: Record<string, any> = {};
  let currentStage = "initialization";

  try {
    currentStage = "validation";
    const processUrl = normalizeUrl(originalUrl);

    await reporter.updateStage("validation", "processing", 10);
    await reporter.completeStage("validation");

    currentStage = "content_extraction";
    await reporter.updateStage("content_extraction", "processing", 0);

    // Browser launch with hard timeout
    try {
      logger.debug({ bookmarkId }, "Attempting to launch browser...");
      browser = await withTimeout(
        chromium.launch({
          headless: true,
          args: ['--use-mock-keychain'],
        }),
        config.timeouts.browserContext,
        "Browser launch",
      );
      logger.debug({ bookmarkId }, "Browser launched successfully.");

      context = await browser.newContext({ viewport: null });
      logger.debug({ bookmarkId }, "Browser context created successfully.");
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw new Error(
          `Browser launch timed out after ${config.timeouts.browserContext}ms`,
        );
      }
      throw error;
    }

    if (!context) {
      throw new Error("Failed to create browser context");
    }

    logger.debug({ bookmarkId }, "Creating new page...");
    page = await context.newPage();
    logger.debug({ bookmarkId }, "New page created successfully.");

    // Navigate to the URL and let the browser handle redirects with hard timeout
    let response;
    try {
      logger.debug(
        { bookmarkId, url: processUrl },
        "Attempting to navigate to page...",
      );
      response = await withTimeout(
        page.goto(processUrl, {
          waitUntil: "networkidle",
          timeout: 60000, // Playwright's internal timeout
        }),
        config.timeouts.pageNavigation, // Hard timeout (65s)
        "Page navigation",
      );
      logger.debug(
        { bookmarkId, url: processUrl },
        "Page navigation successful.",
      );
    } catch (navError: any) {
      logger.warn(
        { bookmarkId, url: processUrl, error: navError.message },
        "Navigation failed, attempting with reduced timeout",
      );
      // Retry with reduced timeout and different wait condition
      try {
        response = await withTimeout(
          page.goto(processUrl, {
            waitUntil: "load",
            timeout: 30000, // Playwright's internal timeout
          }),
          35000, // Hard timeout slightly longer than Playwright timeout
          "Page navigation (retry)",
        );
      } catch (retryError: any) {
        if (retryError instanceof TimeoutError) {
          throw new Error(
            `Page navigation timed out after retries (${retryError.message})`,
          );
        }
        throw retryError;
      }
    }

    // Get the final URL after redirects and extract metadata
    allArtifacts.normalizedUrl = page.url();
    allArtifacts.contentType = response?.headers()["content-type"] || "";
    allArtifacts.etag = response?.headers()["etag"] || "";
    allArtifacts.lastModified = response?.headers()["last-modified"] || "";

    // Screenshot generation with error boundaries
    currentStage = "screenshot_generation";
    let ssDesktopBuffer: Buffer;
    try {
      logger.debug(
        { bookmarkId },
        "Setting viewport for desktop screenshot...",
      );
      await page.setViewportSize({ width: 1920, height: 1080 });
      logger.debug({ bookmarkId }, "Attempting desktop screenshot...");
      ssDesktopBuffer = await withTimeout(
        page.screenshot({
          type: "png",
          timeout: 30000, // Playwright's internal timeout
        }),
        config.timeouts.screenshotDesktop, // Hard timeout (35s)
        "Desktop screenshot",
      );
      logger.debug(
        { bookmarkId },
        "Desktop screenshot completed successfully.",
      );

      // Generate thumbnail (lower resolution, 400x400, 85% quality)
      const thumbnailBuffer = await sharp(ssDesktopBuffer)
        .resize(400, 400, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      allArtifacts.thumbnailStorageId = (
        await objectStorage.saveAsset({
          userId,
          assetType: "bookmarks",
          assetId: bookmarkId,
          fileName: "thumbnail.jpg",
          fileStream: Readable.from(thumbnailBuffer),
          contentType: "image/jpeg",
        })
      ).storageId;

      // Generate screenshot (higher resolution, 1920x1440, 90% quality)
      const screenshotBuffer = await sharp(ssDesktopBuffer)
        .resize(1920, 1440, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer();
      allArtifacts.screenshotDesktopStorageId = (
        await objectStorage.saveAsset({
          userId,
          assetType: "bookmarks",
          assetId: bookmarkId,
          fileName: "screenshot.jpg",
          fileStream: Readable.from(screenshotBuffer),
          contentType: "image/jpeg",
        })
      ).storageId;
    } catch (screenshotError: any) {
      const errorMessage =
        screenshotError instanceof TimeoutError
          ? `Desktop screenshot timed out after ${screenshotError.timeoutMs}ms`
          : screenshotError.message;
      logger.error(
        {
          bookmarkId,
          error: errorMessage,
          isTimeout: screenshotError instanceof TimeoutError,
        },
        "Desktop screenshot generation failed, creating fallback",
      );
      // Create a simple fallback thumbnail
      const fallbackBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      );
      allArtifacts.thumbnailStorageId = (
        await objectStorage.saveAsset({
          userId,
          assetType: "bookmarks",
          assetId: bookmarkId,
          fileName: "thumbnail-fallback.jpg",
          fileStream: Readable.from(fallbackBuffer),
          contentType: "image/jpeg",
        })
      ).storageId;
      ssDesktopBuffer = fallbackBuffer;
    }

    // Full page screenshot with error handling
    try {
      logger.debug({ bookmarkId }, "Attempting full page screenshot...");
      const ssFullPageBuffer = await withTimeout(
        page.screenshot({
          type: "png",
          fullPage: true,
          timeout: 45000, // Playwright's internal timeout
        }),
        config.timeouts.screenshotFullpage, // Hard timeout (50s)
        "Full page screenshot",
      );
      logger.debug(
        { bookmarkId },
        "Full page screenshot completed successfully.",
      );
      allArtifacts.screenshotFullPageStorageId = (
        await objectStorage.saveAsset({
          userId,
          assetType: "bookmarks",
          assetId: bookmarkId,
          fileName: "screenshot-fullpage.png",
          fileStream: Readable.from(ssFullPageBuffer),
          contentType: "image/png",
        })
      ).storageId;
    } catch (fullPageError: any) {
      const errorMessage =
        fullPageError instanceof TimeoutError
          ? `Full page screenshot timed out after ${fullPageError.timeoutMs}ms`
          : fullPageError.message;
      logger.warn(
        {
          bookmarkId,
          error: errorMessage,
          isTimeout: fullPageError instanceof TimeoutError,
        },
        "Full page screenshot failed, skipping",
      );
    }

    // Mobile screenshot with error handling
    try {
      logger.debug({ bookmarkId }, "Setting viewport for mobile screenshot...");
      await page.setViewportSize({ width: 375, height: 667 });
      logger.debug({ bookmarkId }, "Attempting mobile screenshot...");
      const ssMobileBuffer = await withTimeout(
        page.screenshot({
          type: "png",
          timeout: 30000, // Playwright's internal timeout
        }),
        config.timeouts.screenshotMobile, // Hard timeout (35s)
        "Mobile screenshot",
      );
      logger.debug({ bookmarkId }, "Mobile screenshot completed successfully.");
      allArtifacts.screenshotMobileStorageId = (
        await objectStorage.saveAsset({
          userId,
          assetType: "bookmarks",
          assetId: bookmarkId,
          fileName: "screenshot-mobile.png",
          fileStream: Readable.from(ssMobileBuffer),
          contentType: "image/png",
        })
      ).storageId;
    } catch (mobileError: any) {
      const errorMessage =
        mobileError instanceof TimeoutError
          ? `Mobile screenshot timed out after ${mobileError.timeoutMs}ms`
          : mobileError.message;
      logger.warn(
        {
          bookmarkId,
          error: errorMessage,
          isTimeout: mobileError instanceof TimeoutError,
        },
        "Mobile screenshot failed, skipping",
      );
    }

    // PDF generation with error handling
    currentStage = "pdf_generation";
    try {
      logger.debug({ bookmarkId }, "Resetting viewport for PDF generation...");
      // Reset viewport for PDF generation
      await page.setViewportSize({ width: 1920, height: 1080 });

      logger.debug({ bookmarkId }, "Attempting PDF generation...");
      const pdfBuffer = await withTimeout(
        generateOptimizedPdf(page, bookmarkId),
        config.timeouts.pdfGeneration, // Hard timeout (90s)
        "PDF generation",
      );
      logger.debug({ bookmarkId }, "PDF generation completed successfully.");
      allArtifacts.pdfStorageId = (
        await objectStorage.saveAsset({
          userId,
          assetType: "bookmarks",
          assetId: bookmarkId,
          fileName: "content.pdf",
          fileStream: Readable.from(pdfBuffer),
          contentType: "application/pdf",
        })
      ).storageId;
    } catch (pdfError: any) {
      const errorMessage =
        pdfError instanceof TimeoutError
          ? `PDF generation timed out after ${pdfError.timeoutMs}ms`
          : pdfError.message;
      logger.warn(
        {
          bookmarkId,
          error: errorMessage,
          isTimeout: pdfError instanceof TimeoutError,
        },
        "PDF generation failed, skipping",
      );
    }

    // Content extraction with error handling
    currentStage = "html_content_extraction";
    try {
      logger.debug({ bookmarkId }, "Attempting HTML content extraction...");
      const rawHtml = await page.content();
      const contentData = await extractContentFromHtml(
        rawHtml,
        allArtifacts.normalizedUrl,
        userId,
        bookmarkId,
      );
      Object.assign(allArtifacts, contentData);
      logger.debug(
        { bookmarkId },
        "HTML content extraction completed successfully.",
      );
    } catch (contentError: any) {
      logger.error(
        { bookmarkId, error: contentError.message, stack: contentError.stack },
        "Content extraction failed with happy-dom error",
      );

      // Set minimal fallback content
      allArtifacts.title = allArtifacts.title || "Content extraction failed";
      allArtifacts.description =
        allArtifacts.description || "Unable to extract content from this page";
      allArtifacts.extractedText = "";
      allArtifacts.author = null;
      allArtifacts.lang = "en";
    }

    await reporter.completeStage("content_extraction");

    // AI tagging with error handling
    currentStage = "ai_tagging";
    await reporter.updateStage("ai_tagging", "processing", 0);
    try {
      logger.debug({ bookmarkId }, "Attempting AI tag generation...");
      allArtifacts.tags = await generateBookmarkTags(
        allArtifacts.extractedText || allArtifacts.title || "",
        allArtifacts.title || "",
        false,
      );
      logger.debug({ bookmarkId }, "AI tag generation completed successfully.");
    } catch (aiError: any) {
      logger.warn(
        { bookmarkId, error: aiError.message },
        "AI tagging failed, using fallback tags",
      );
      // Use fallback tags based on domain or basic content
      allArtifacts.tags = ["webpage", "bookmark"];
    }
    await reporter.completeStage("ai_tagging");

    // Keep extractedText in artifacts for database storage, but limit its size to avoid issues
    const finalArtifacts = {
      ...allArtifacts,
      extractedText: allArtifacts.extractedText?.substring(0, 1024000) || null, // Limit to 1MB
    };
    await reporter.completeJob(finalArtifacts);
  } catch (error: any) {
    logger.error(
      {
        bookmarkId,
        currentStage,
        error: error.message,
        stack: error.stack,
      },
      "Regular bookmark processing failed at stage",
    );

    // Report the error with stage context
    await reporter.reportError(error, currentStage);
    throw error;
  } finally {
    logger.debug(
      { bookmarkId },
      "Entering cleanup phase for bookmark processing.",
    );

    // Cleanup with individual error handling
    try {
      if (page && !page.isClosed()) {
        logger.debug({ bookmarkId }, "Closing page...");
        await page.close();
        logger.debug({ bookmarkId }, "Page closed successfully.");
      }
    } catch (pageCloseError: any) {
      logger.warn(
        { bookmarkId, error: pageCloseError.message },
        "Failed to close page during cleanup",
      );
    }

    try {
      if (context) {
        logger.debug({ bookmarkId }, "Closing browser context...");
        await context.close();
        logger.debug({ bookmarkId }, "Browser context closed successfully.");
      }
    } catch (contextCloseError: any) {
      logger.warn(
        { bookmarkId, error: contextCloseError.message },
        "Failed to close browser context during cleanup",
      );
    }

    try {
      if (browser) {
        logger.debug({ bookmarkId }, "Closing browser...");
        await browser.close();
        logger.debug({ bookmarkId }, "Browser closed successfully.");
      }
    } catch (browserCloseError: any) {
      logger.warn(
        { bookmarkId, error: browserCloseError.message },
        "Failed to close browser during cleanup",
      );
    }

    logger.debug({ bookmarkId }, "Cleanup phase completed.");
  }
}

// --- MAIN JOB PROCESSOR ---

/**
 * Main job processor entry point with domain-aware rate limiting and handler routing.
 */
async function processBookmarkJob(
  job: Job<BookmarkJobData>,
  token?: string,
  worker?: Worker,
) {
  const { bookmarkId, url: originalUrl, userId } = job.data;

  // Validate required job data
  if (!bookmarkId || !originalUrl || !userId) {
    logger.error(
      { jobId: job.id, bookmarkId, originalUrl, userId, jobData: job.data },
      "Missing required job data - cannot process bookmark"
    );
    throw new Error(
      `Missing required job data: bookmarkId=${bookmarkId}, url=${originalUrl}, userId=${userId}`
    );
  }

  const jobId = job.id?.toString() || `${bookmarkId}-${Date.now()}`;

  logger.info(
    { jobId, bookmarkId, originalUrl },
    "Starting bookmark processing job",
  );

  const reporter = await createProcessingReporter("bookmarks", bookmarkId, userId);
  let availability: ReturnType<
    typeof domainRateLimiter.checkDomainAvailability
  > | null = null;

  try {
    // Determine handler type first to use in rate limiting
    const preliminaryHandlerType: BookmarkHandlerType =
      getHandlerForUrl(originalUrl);

    availability = domainRateLimiter.checkDomainAvailability(
      originalUrl,
      preliminaryHandlerType,
    );

    if (!availability.canProcess) {
      if (availability.blocked) {
        const errorMessage = `Domain ${availability.domain} is blocked: ${availability.blockedReason}`;
        logger.error(
          { jobId, bookmarkId, domain: availability.domain },
          errorMessage,
        );
        await reporter.initializeJob(["validation"]);
        await reporter.failJob(errorMessage);
        return;
      }

      logger.info(
        {
          jobId,
          domain: availability.domain,
          delayMs: availability.delayMs,
          handler: preliminaryHandlerType,
        },
        "Rate limited, applying delay",
      );

      // Use proper BullMQ rate limiting instead of adding a new job
      if (worker) {
        await worker.rateLimit(availability.delayMs);
        // Throw RateLimitError to properly move the job back to waiting state
        throw Worker.RateLimitError();
      } else {
        // In database mode, throw error with delay information
        throw createRateLimitError(availability.delayMs);
      }
    }

    domainRateLimiter.markDomainProcessing(originalUrl, jobId);

    try {
      await reporter.initializeJob([
        "validation",
        "content_extraction",
        "ai_tagging",
      ]);

      const handlerType: BookmarkHandlerType =
        (availability.rule?.handler as BookmarkHandlerType) ||
        preliminaryHandlerType;
      logger.debug(
        { bookmarkId, handlerType, selectedRule: availability.rule },
        "Routing to handler",
      );

      if (handlerType === "github") {
        await processGitHubBookmark(job, reporter);
      } else if (handlerType === "reddit") {
        await processRedditApiBookmark(job, reporter);
      } else {
        await processRegularBookmarkJob(job, reporter);
      }
    } finally {
      domainRateLimiter.markDomainComplete(originalUrl, jobId);
    }
  } catch (error: any) {
    // RateLimitError is not a real error - it's a signal to BullMQ to reschedule
    // We must let it bubble up without any error handling
    if (
      error.name === "RateLimitError" ||
      error.message === "bullmq:rateLimitExceeded"
    ) {
      logger.info(
        { jobId, bookmarkId, domain: availability?.domain },
        "Job rate limited, will be rescheduled",
      );
      throw error;
    }

    logger.error(
      { jobId, bookmarkId, error: error.message, stack: error.stack },
      "Bookmark job failed",
    );

    // Only block domain for certain types of errors, not module resolution issues
    if (availability && availability.domain) {
      const errorMessage = error.message || "";
      const isModuleError =
        errorMessage.includes("ERR_MODULE_NOT_FOUND") ||
        errorMessage.includes("Cannot find module");
      const isTimeoutError =
        errorMessage.includes("timeout") || errorMessage.includes("Timeout");

      if (!isModuleError && !isTimeoutError) {
        domainRateLimiter.blockDomain(
          availability.domain,
          `Job failed: ${error.message}`,
        );
      } else {
        logger.info(
          { jobId, bookmarkId, domain: availability.domain },
          "Not blocking domain for module/timeout error",
        );
      }
    }

    // Ensure the job is properly failed with error details
    try {
      await reporter.failJob(error.message);
    } catch (reportError: any) {
      logger.error(
        { jobId, bookmarkId, reportError: reportError.message },
        "Failed to report job failure",
      );
    }

    throw error;
  }
}

export default processBookmarkJob;
