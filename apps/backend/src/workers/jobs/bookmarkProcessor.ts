import {
  type JobContext,
  PermanentError,
  RateLimitError,
} from "@eclaire/queue/core";
import { createChildLogger } from "../../lib/logger.js";
import { BrowserPipeline } from "../lib/bookmarks/browser-pipeline.js";
import {
  type BookmarkHandlerType,
  type BookmarkJobData,
  extractContentFromHtml,
  generateBookmarkTags,
  getHandlerForUrl,
  lightweightFetch,
  normalizeUrl,
  processGitHubBookmark,
  validateApiCredentials,
} from "../lib/bookmarks/index.js";
import { processRedditApiBookmark } from "../lib/bookmarks/reddit-api.js";
import { processTwitterApiBookmark } from "../lib/bookmarks/twitter-api.js";
import {
  type DomainErrorCategory,
  domainRateLimiter,
} from "../lib/domainRateLimiter.js";

const logger = createChildLogger("bookmark-processor");

// Validate API credentials on startup
validateApiCredentials();

/**
 * Regular bookmark processing handler using BrowserPipeline.
 */
async function processRegularBookmarkJob(ctx: JobContext<BookmarkJobData>) {
  const { bookmarkId, url: originalUrl, userId } = ctx.job.data;
  logger.info({ bookmarkId, userId }, "Processing with REGULAR handler");

  // biome-ignore lint/suspicious/noExplicitAny: dynamic artifact accumulator populated across processing stages
  const allArtifacts: Record<string, any> = {};
  let currentStage = "initialization";

  const pipeline = new BrowserPipeline({ bookmarkId, userId, logger });

  try {
    currentStage = "validation";
    const processUrl = normalizeUrl(originalUrl);

    await ctx.startStage("validation");
    await ctx.updateStageProgress("validation", 10);
    await ctx.completeStage("validation");

    currentStage = "content_extraction";
    await ctx.startStage("content_extraction");

    // Tiered extraction: start lightweight fetch and browser launch concurrently
    const lightweightPromise = lightweightFetch(processUrl, bookmarkId);
    const browserLaunchPromise = pipeline.launch();
    const [lightweightResult] = await Promise.all([
      lightweightPromise,
      browserLaunchPromise,
    ]);

    // Browser navigation (always needed for screenshots/PDF)
    const navResult = await pipeline.navigateTo(processUrl);
    Object.assign(allArtifacts, navResult);

    // Detect non-HTML content types and handle appropriately
    const ct = (allArtifacts.contentType || "").toLowerCase();
    const isNonHtml =
      ct.includes("application/pdf") ||
      ct.startsWith("image/") ||
      ct.includes("application/octet-stream");

    if (isNonHtml) {
      logger.info(
        { bookmarkId, contentType: ct },
        "Non-HTML content detected, using simplified extraction",
      );

      // Still capture screenshots (the browser renders PDFs and images)
      currentStage = "screenshot_generation";
      const screenshotArtifacts = await pipeline.captureAllScreenshots();
      Object.assign(allArtifacts, screenshotArtifacts);

      // For PDFs, the original URL is the PDF -- store it directly as the PDF artifact
      if (ct.includes("application/pdf")) {
        // Browser already rendered the PDF; use the navigation URL as the source
        // The PDF is the content itself, so skip Readability and just note the content type
        allArtifacts.title =
          allArtifacts.title ||
          new URL(processUrl).pathname.split("/").pop() ||
          "PDF Document";
        allArtifacts.description = `PDF document from ${new URL(processUrl).hostname}`;
        allArtifacts.extractedText = "";
        allArtifacts.author = null;
        allArtifacts.lang = "en";
      } else if (ct.startsWith("image/")) {
        allArtifacts.title =
          allArtifacts.title ||
          new URL(processUrl).pathname.split("/").pop() ||
          "Image";
        allArtifacts.description = `Image from ${new URL(processUrl).hostname}`;
        allArtifacts.extractedText = "";
        allArtifacts.author = null;
        allArtifacts.lang = "en";
      } else {
        allArtifacts.title = allArtifacts.title || "Binary content";
        allArtifacts.description = `Content type: ${ct}`;
        allArtifacts.extractedText = "";
        allArtifacts.author = null;
        allArtifacts.lang = "en";
      }

      await ctx.completeStage("content_extraction");

      // AI tagging with limited info
      currentStage = "ai_tagging";
      await ctx.startStage("ai_tagging");
      allArtifacts.tags = ct.includes("pdf")
        ? ["pdf", "document"]
        : ct.startsWith("image/")
          ? ["image"]
          : ["file"];
      const { extractedText: _excludeText, ...finalArtifacts } = allArtifacts;
      await ctx.completeStage("ai_tagging", finalArtifacts);
      return;
    }

    // --- Standard HTML processing path ---

    // Screenshots (desktop/thumbnail fatal, fullpage/mobile non-fatal)
    currentStage = "screenshot_generation";
    const screenshotArtifacts = await pipeline.captureAllScreenshots();
    Object.assign(allArtifacts, screenshotArtifacts);

    // PDF generation (non-fatal)
    currentStage = "pdf_generation";
    const pdfArtifacts = await pipeline.capturePdf();
    Object.assign(allArtifacts, pdfArtifacts);

    // Content extraction -- tiered approach
    currentStage = "html_content_extraction";
    try {
      if (lightweightResult) {
        // Lightweight path: use pre-fetched HTML (extractContentFromHtml handles its own favicon fetch)
        logger.info(
          { bookmarkId },
          "Using lightweight extraction (HTTP fetch + Readability)",
        );
        const contentData = await extractContentFromHtml(
          lightweightResult.html,
          lightweightResult.finalUrl,
          userId,
          bookmarkId,
          undefined,
          lightweightResult.article,
        );
        Object.assign(allArtifacts, contentData);
        if (lightweightResult.finalUrl !== processUrl) {
          allArtifacts.normalizedUrl = lightweightResult.finalUrl;
        }
      } else {
        // Full browser path: extract favicon from browser, then get rendered HTML
        logger.info(
          { bookmarkId },
          "Using full browser extraction (lightweight fetch failed or insufficient)",
        );
        const faviconStorageId = await pipeline.extractFavicon();
        const rawHtml = await pipeline.getPageContent();
        const contentData = await extractContentFromHtml(
          rawHtml,
          allArtifacts.normalizedUrl,
          userId,
          bookmarkId,
          faviconStorageId,
        );
        Object.assign(allArtifacts, contentData);
      }
      await ctx.completeStage("content_extraction");
    } catch (contentError: unknown) {
      const errorMessage =
        contentError instanceof Error
          ? contentError.message
          : String(contentError);
      logger.error(
        { bookmarkId, error: errorMessage },
        "Content extraction failed, continuing with degraded results",
      );
      allArtifacts.title = allArtifacts.title || "Content extraction failed";
      allArtifacts.description =
        allArtifacts.description || "Unable to extract content from this page";
      allArtifacts.extractedText = "";
      allArtifacts.author = null;
      allArtifacts.lang = "en";
      allArtifacts.contentExtractionFailed = true;
      allArtifacts.contentExtractionError = errorMessage;
      await ctx.failStage(
        "content_extraction",
        contentError instanceof Error ? contentError : new Error(errorMessage),
      );
    }

    // AI tagging (pass structured metadata for better results)
    currentStage = "ai_tagging";
    await ctx.startStage("ai_tagging");
    try {
      allArtifacts.tags = await generateBookmarkTags(
        allArtifacts.extractedText || allArtifacts.title || "",
        allArtifacts.title || "",
        false,
        allArtifacts.rawMetadata?.structured,
      );
    } catch (aiError: unknown) {
      logger.warn(
        {
          bookmarkId,
          error: aiError instanceof Error ? aiError.message : String(aiError),
        },
        "AI tagging failed, using fallback tags",
      );
      allArtifacts.tags = ["webpage", "bookmark"];
      allArtifacts.aiTaggingFailed = true;
    }

    const { extractedText: _excludeText, ...finalArtifacts } = allArtifacts;
    await ctx.completeStage("ai_tagging", finalArtifacts);
  } catch (error: unknown) {
    logger.error(
      {
        bookmarkId,
        currentStage,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Regular bookmark processing failed at stage",
    );
    await ctx.failStage(
      currentStage,
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  } finally {
    await pipeline.cleanup();
  }
}

// --- ERROR CLASSIFICATION ---

/**
 * Classify an error message into a domain error category for graduated failure tracking.
 * Only server_error and network_error count toward domain blocking.
 */
function classifyError(errorMessage: string): DomainErrorCategory {
  const msg = errorMessage.toLowerCase();

  // Server errors (5xx) - blockable
  if (
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("internal server error") ||
    msg.includes("bad gateway") ||
    msg.includes("service unavailable")
  ) {
    return "server_error";
  }

  // Network errors - blockable
  if (
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("dns") ||
    msg.includes("econnreset") ||
    msg.includes("ssl") ||
    msg.includes("tls") ||
    msg.includes("certificate") ||
    msg.includes("err_name_not_resolved")
  ) {
    return "network_error";
  }

  // Client errors (4xx) - not blockable
  if (
    msg.includes("403") ||
    msg.includes("401") ||
    msg.includes("404") ||
    msg.includes("429") ||
    msg.includes("forbidden") ||
    msg.includes("unauthorized") ||
    msg.includes("not found")
  ) {
    return "client_error";
  }

  // Processing errors (sharp, storage, module, timeout, content extraction) - not blockable
  if (
    msg.includes("sharp") ||
    msg.includes("storage") ||
    msg.includes("err_module_not_found") ||
    msg.includes("cannot find module") ||
    msg.includes("timeout") ||
    msg.includes("readability") ||
    msg.includes("content extraction") ||
    msg.includes("screenshot")
  ) {
    return "processing_error";
  }

  // Default: treat unknown errors as processing errors (non-blockable) to avoid
  // over-blocking. Previously unknown errors would block the entire domain.
  return "processing_error";
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
    throw new PermanentError(
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
      throw new RateLimitError(availability.delayMs);
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
      } else if (handlerType === "twitter") {
        await processTwitterApiBookmark(ctx);
      } else {
        await processRegularBookmarkJob(ctx);
      }

      // Reset failure counter on success
      domainRateLimiter.markDomainSuccess(originalUrl);
    } finally {
      domainRateLimiter.markDomainComplete(originalUrl, jobId);
    }
  } catch (error: unknown) {
    // RateLimitError is not a real error - it's a signal to reschedule
    // We must let it bubble up without any error handling
    if (
      (error instanceof Error && error.name === "RateLimitError") ||
      (error instanceof Error && error.message === "rateLimitExceeded")
    ) {
      logger.info(
        { jobId, bookmarkId, domain: availability?.domain },
        "Job rate limited, will be rescheduled",
      );
      throw error;
    }

    logger.error(
      {
        jobId,
        bookmarkId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Bookmark job failed",
    );

    // Use graduated failure tracking instead of immediate domain blocking.
    // Only server_error and network_error count toward blocking, and only
    // after multiple consecutive failures within a time window.
    if (availability?.domain) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const category = classifyError(errorMessage);

      domainRateLimiter.recordFailure(
        availability.domain,
        category,
        errorMessage,
      );
    }

    // Job failure is handled implicitly when the handler throws
    // The queue driver will mark the job as failed
    throw error;
  }
}

export default processBookmarkJob;
