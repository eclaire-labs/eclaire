import type { JobContext } from "@eclaire/queue/core";
import { type BrowserContext, chromium, type Page } from "patchright";
import sharp from "sharp";
import { Readable } from "stream";
import { createChildLogger } from "../../lib/logger.js";
import { buildKey, getStorage } from "../../lib/storage/index.js";
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
import { TimeoutError, withTimeout } from "../lib/utils/timeout.js";

const logger = createChildLogger("bookmark-processor");

// Validate API credentials on startup
validateApiCredentials();

/**
 * Regular bookmark processing handler using ctx methods.
 */
async function processRegularBookmarkJob(ctx: JobContext<BookmarkJobData>) {
  const { bookmarkId, url: originalUrl, userId } = ctx.job.data;
  logger.info({ bookmarkId, userId }, "Processing with REGULAR handler");
  let browser: any = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  const allArtifacts: Record<string, any> = {};
  let currentStage = "initialization";

  try {
    currentStage = "validation";
    const processUrl = normalizeUrl(originalUrl);

    await ctx.startStage("validation");
    await ctx.updateStageProgress("validation", 10);
    await ctx.completeStage("validation");

    currentStage = "content_extraction";
    await ctx.startStage("content_extraction");

    // Browser launch with hard timeout
    try {
      logger.debug({ bookmarkId }, "Attempting to launch browser...");
      browser = await withTimeout(
        chromium.launch({
          headless: true,
          args: ["--use-mock-keychain"],
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
    // biome-ignore lint/suspicious/noImplicitAnyLet: type inferred from page.goto
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

      // Extract raw pixel data to bypass libvips colorspace interpretation issues
      // (Playwright PNGs can have colorspace values that libvips doesn't recognize)
      const { data: rawPixels, info: imageInfo } = await sharp(ssDesktopBuffer)
        .raw()
        .toBuffer({ resolveWithObject: true });

      const rawInput = {
        raw: {
          width: imageInfo.width,
          height: imageInfo.height,
          channels: imageInfo.channels,
        },
      };

      // Generate thumbnail (lower resolution, 400x400, 85% quality)
      const storage = getStorage();
      const thumbnailBuffer = await sharp(rawPixels, rawInput)
        .resize(400, 400, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      const thumbnailKey = buildKey(
        userId,
        "bookmarks",
        bookmarkId,
        "thumbnail.jpg",
      );
      await storage.writeBuffer(thumbnailKey, thumbnailBuffer, {
        contentType: "image/jpeg",
      });
      allArtifacts.thumbnailStorageId = thumbnailKey;

      // Generate screenshot (higher resolution, 1920x1440, 90% quality)
      const screenshotBuffer = await sharp(rawPixels, rawInput)
        .resize(1920, 1440, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer();
      const screenshotKey = buildKey(
        userId,
        "bookmarks",
        bookmarkId,
        "screenshot.jpg",
      );
      await storage.writeBuffer(screenshotKey, screenshotBuffer, {
        contentType: "image/jpeg",
      });
      allArtifacts.screenshotDesktopStorageId = screenshotKey;
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
        "Desktop screenshot/thumbnail generation failed",
      );
      // Let the error propagate - don't create fallback, let job fail
      throw screenshotError;
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
      const storageForFullPage = getStorage();
      const fullpageKey = buildKey(
        userId,
        "bookmarks",
        bookmarkId,
        "screenshot-fullpage.png",
      );
      await storageForFullPage.writeBuffer(fullpageKey, ssFullPageBuffer, {
        contentType: "image/png",
      });
      allArtifacts.screenshotFullPageStorageId = fullpageKey;
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
      const storageForMobile = getStorage();
      const mobileKey = buildKey(
        userId,
        "bookmarks",
        bookmarkId,
        "screenshot-mobile.png",
      );
      await storageForMobile.writeBuffer(mobileKey, ssMobileBuffer, {
        contentType: "image/png",
      });
      allArtifacts.screenshotMobileStorageId = mobileKey;
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
      const storageForPdf = getStorage();
      const pdfKey = buildKey(userId, "bookmarks", bookmarkId, "content.pdf");
      await storageForPdf.writeBuffer(pdfKey, pdfBuffer, {
        contentType: "application/pdf",
      });
      allArtifacts.pdfStorageId = pdfKey;
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

    // Favicon extraction via Playwright (before closing page)
    currentStage = "favicon_extraction";
    let faviconStorageId: string | null = null;
    try {
      logger.debug(
        { bookmarkId },
        "Attempting favicon extraction via Playwright...",
      );
      const faviconHref = await page.evaluate(() => {
        const link =
          document.querySelector("link[rel='icon']") ||
          document.querySelector("link[rel='shortcut icon']");
        return link?.getAttribute("href") || null;
      });

      if (faviconHref) {
        const absoluteFaviconUrl = new URL(faviconHref, page.url()).href;
        logger.debug(
          { bookmarkId, faviconUrl: absoluteFaviconUrl },
          "Found favicon, fetching via Playwright...",
        );
        const faviconResponse = await page.request.get(absoluteFaviconUrl);
        if (faviconResponse.ok()) {
          const faviconBuffer = await faviconResponse.body();
          if (faviconBuffer.length > 0) {
            const contentType =
              faviconResponse.headers()["content-type"] || "image/x-icon";
            // Determine file extension from content type
            let ext = ".ico";
            if (contentType.includes("svg")) ext = ".svg";
            else if (contentType.includes("png")) ext = ".png";
            else if (
              contentType.includes("jpeg") ||
              contentType.includes("jpg")
            )
              ext = ".jpg";
            else if (contentType.includes("gif")) ext = ".gif";

            const storage = getStorage();
            const faviconKey = buildKey(
              userId,
              "bookmarks",
              bookmarkId,
              `favicon${ext}`,
            );
            await storage.writeBuffer(faviconKey, faviconBuffer, {
              contentType,
            });
            faviconStorageId = faviconKey;
            logger.debug(
              { bookmarkId, faviconKey },
              "Favicon saved successfully",
            );
          }
        }
      } else {
        logger.debug({ bookmarkId }, "No favicon link found in page");
      }
    } catch (faviconError: any) {
      logger.debug(
        { bookmarkId, error: faviconError.message },
        "Could not fetch favicon via Playwright",
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
        faviconStorageId, // Pass pre-fetched favicon
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

    await ctx.completeStage("content_extraction");

    // AI tagging with error handling
    currentStage = "ai_tagging";
    await ctx.startStage("ai_tagging");
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
    // Remove extractedText from artifacts - it's stored in blob storage via extractedTxtStorageId
    // The artifact processor will load it from storage when updating the domain table
    const { extractedText: _excludeText, ...finalArtifacts } = allArtifacts;
    await ctx.completeStage("ai_tagging", finalArtifacts);
    // Job completes implicitly when handler returns successfully
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
    await ctx.failStage(currentStage, error);
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
 * Now uses JobContext for stage tracking and progress reporting.
 */
async function processBookmarkJob(ctx: JobContext<BookmarkJobData>) {
  const { bookmarkId, url: originalUrl, userId } = ctx.job.data;

  // Validate required job data
  if (!bookmarkId || !originalUrl || !userId) {
    logger.error(
      {
        jobId: ctx.job.id,
        bookmarkId,
        originalUrl,
        userId,
        jobData: ctx.job.data,
      },
      "Missing required job data - cannot process bookmark",
    );
    throw new Error(
      `Missing required job data: bookmarkId=${bookmarkId}, url=${originalUrl}, userId=${userId}`,
    );
  }

  const jobId = ctx.job.id || `${bookmarkId}-${Date.now()}`;

  logger.info(
    { jobId, bookmarkId, originalUrl },
    "Starting bookmark processing job",
  );

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
        await ctx.initStages(["validation"]);
        await ctx.failStage("validation", new Error(errorMessage));
        throw new Error(errorMessage);
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

      // Throw rate limit error to signal queue to reschedule
      throw createRateLimitError(availability.delayMs);
    }

    domainRateLimiter.markDomainProcessing(originalUrl, jobId);

    try {
      await ctx.initStages(["validation", "content_extraction", "ai_tagging"]);

      const handlerType: BookmarkHandlerType =
        (availability.rule?.handler as BookmarkHandlerType) ||
        preliminaryHandlerType;
      logger.debug(
        { bookmarkId, handlerType, selectedRule: availability.rule },
        "Routing to handler",
      );

      if (handlerType === "github") {
        await processGitHubBookmark(ctx);
      } else if (handlerType === "reddit") {
        await processRedditApiBookmark(ctx);
      } else {
        await processRegularBookmarkJob(ctx);
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

    // Job failure is handled implicitly when the handler throws
    // The queue driver will mark the job as failed
    throw error;
  }
}

export default processBookmarkJob;
