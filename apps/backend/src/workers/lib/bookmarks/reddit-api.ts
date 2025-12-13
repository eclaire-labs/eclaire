import type { Job } from "bullmq";
import { type BrowserContext, chromium } from "patchright";
import sharp from "sharp";
import { Readable } from "stream";
import { createChildLogger } from "../../../lib/logger.js";
import type { ProcessingReporter } from "../processing-reporter.js";
import { createRedditApiClient } from "../reddit-api-client.js";
import { extractRedditData } from "../reddit-extractor.js";
import {
  generateRedditHTMLNoComments,
  generateRedditHTMLWithComments,
} from "../reddit-renderer.js";
import { generateRedditTags } from "../reddit-tags.js";
import { objectStorage } from "../../../lib/storage.js";
import type {
  BookmarkHandler,
  BookmarkHandlerType,
  BookmarkJobData,
} from "./index.js";
import {
  extractContentFromHtml,
  generateBookmarkTags,
  generateOptimizedPdf,
} from "./utils.js";

const logger = createChildLogger("reddit-api-bookmark-handler");

/**
 * Reddit API-based bookmark processing handler
 */
export async function processRedditApiBookmark(
  job: Job<BookmarkJobData>,
  reporter: ProcessingReporter,
): Promise<void> {
  const { bookmarkId, url: originalUrl, userId } = job.data;
  logger.info({ bookmarkId, userId }, "Processing with REDDIT-API handler");

  let browser: any = null;
  let context: BrowserContext | null = null;
  const allArtifacts: Record<string, any> = {};

  try {
    // Normalize the URL
    const normalizedUrl = originalUrl.startsWith("http")
      ? originalUrl
      : `https://${originalUrl}`;
    allArtifacts.normalizedUrl = normalizedUrl;

    await reporter.updateStage("validation", "processing", 50);
    await reporter.completeStage("validation");

    await reporter.updateStage("content_extraction", "processing", 0);

    // Stage 1: Fetch raw Reddit data via API
    logger.info({ bookmarkId }, "Fetching Reddit data via API");
    const redditClient = createRedditApiClient({ maxMoreCalls: 3 }); // Use requested limit
    const apiResponse = await redditClient.fetchPostFromUrl(normalizedUrl);

    if (!apiResponse.success || !apiResponse.data) {
      throw new Error(`Reddit API fetch failed: ${apiResponse.error}`);
    }

    // Save raw Reddit JSON
    const rawJsonBuffer = Buffer.from(
      JSON.stringify(apiResponse.data, null, 2),
      "utf-8",
    );
    allArtifacts.redditRawStorageId = (
      await objectStorage.saveAsset({
        userId,
        assetType: "bookmarks",
        assetId: bookmarkId,
        fileName: "redditRaw.json",
        fileStream: Readable.from(rawJsonBuffer),
        contentType: "application/json",
      })
    ).storageId;

    await reporter.updateStage("content_extraction", "processing", 25);

    // Stage 2: Extract and transform Reddit data
    logger.info({ bookmarkId }, "Extracting Reddit data");
    const redditData = extractRedditData(apiResponse.data);

    if (!redditData.mainPost) {
      throw new Error("Could not extract main post from API response");
    }

    // Save simplified Reddit JSON
    const simpleJsonBuffer = Buffer.from(
      JSON.stringify(redditData, null, 2),
      "utf-8",
    );
    allArtifacts.redditSimpleStorageId = (
      await objectStorage.saveAsset({
        userId,
        assetType: "bookmarks",
        assetId: bookmarkId,
        fileName: "redditSimple.json",
        fileStream: Readable.from(simpleJsonBuffer),
        contentType: "application/json",
      })
    ).storageId;

    await reporter.updateStage("content_extraction", "processing", 50);

    // Stage 3: Generate HTML versions
    logger.info({ bookmarkId }, "Generating HTML renders");

    // Generate HTML without comments (for thumbnails and screenshots)
    const htmlNoComments = generateRedditHTMLNoComments(redditData);
    const htmlNoCommentsBuffer = Buffer.from(htmlNoComments, "utf-8");
    allArtifacts.redditNoCommentsStorageId = (
      await objectStorage.saveAsset({
        userId,
        assetType: "bookmarks",
        assetId: bookmarkId,
        fileName: "reddit-no-comments.html",
        fileStream: Readable.from(htmlNoCommentsBuffer),
        contentType: "text/html",
      })
    ).storageId;

    // Generate HTML with comments (for full content and PDFs)
    const htmlWithComments = generateRedditHTMLWithComments(redditData);
    const htmlWithCommentsBuffer = Buffer.from(htmlWithComments, "utf-8");
    allArtifacts.redditWithCommentsStorageId = (
      await objectStorage.saveAsset({
        userId,
        assetType: "bookmarks",
        assetId: bookmarkId,
        fileName: "reddit-with-comments.html",
        fileStream: Readable.from(htmlWithCommentsBuffer),
        contentType: "text/html",
      })
    ).storageId;

    await reporter.updateStage("content_extraction", "processing", 75);

    // Stage 4: Generate screenshots and PDFs using browser automation
    logger.info({ bookmarkId }, "Generating screenshots and PDFs");

    // Launch browser
    browser = await chromium.launch({
      headless: true,
      args: ['--use-mock-keychain'],
    });
    context = await browser.newContext({ viewport: null });
    const page = await context!.newPage();

    // Create a data URL for the HTML content (no-comments version for screenshots)
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlNoComments)}`;
    await page.goto(dataUrl, { waitUntil: "networkidle", timeout: 60000 });

    // Take desktop screenshot (post only, no comments)
    await page.setViewportSize({ width: 1920, height: 1080 });
    const ssDesktopBuffer = await page.screenshot({ type: "png" });

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

    // Take full page screenshot using full content HTML (with comments)
    const fullDataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlWithComments)}`;
    await page.goto(fullDataUrl, { waitUntil: "networkidle", timeout: 60000 });
    const ssFullPageBuffer = await page.screenshot({
      type: "png",
      fullPage: true,
    });
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

    // Take mobile screenshot (post only, no comments)
    const mobileDataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlNoComments)}`;
    await page.goto(mobileDataUrl, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await page.setViewportSize({ width: 375, height: 667 });
    const ssMobileBuffer = await page.screenshot({ type: "png" });
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

    // Reset viewport for PDF generation
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Generate PDF from full content HTML (with comments)
    await page.goto(fullDataUrl, { waitUntil: "networkidle", timeout: 60000 });
    const pdfBuffer = await generateOptimizedPdf(page, bookmarkId);
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

    // Extract content from the full HTML for text analysis (with comments)
    const contentData = await extractContentFromHtml(
      htmlWithComments,
      normalizedUrl,
      userId,
      bookmarkId,
    );

    // Set Reddit-specific title and description
    const mainPost = redditData.mainPost;
    const redditTitle = `${mainPost.title} - r/${mainPost.subreddit}`;
    const redditDescription = mainPost.selftext
      ? mainPost.selftext.slice(0, 200) +
        (mainPost.selftext.length > 200 ? "..." : "")
      : `Post by u/${mainPost.author} in r/${mainPost.subreddit}`;

    Object.assign(allArtifacts, {
      ...contentData,
      title: redditTitle,
      description: redditDescription,
      // Store Reddit-specific metadata following GitHub pattern
      rawMetadata: {
        ...contentData.rawMetadata,
        reddit: {
          score: redditData.redditMetadata.score,
          upvote_ratio: redditData.redditMetadata.upvote_ratio,
          num_comments: redditData.redditMetadata.num_comments,
          view_count: redditData.redditMetadata.view_count,
          post_type: redditData.redditMetadata.post_type,
          subreddit_name: redditData.redditMetadata.subreddit_name,
          subreddit_subscribers:
            redditData.redditMetadata.subreddit_subscribers,
          subreddit_description:
            redditData.redditMetadata.subreddit_description,
          created_utc: redditData.redditMetadata.created_utc,
          edited_utc: redditData.redditMetadata.edited_utc,
          age_category: redditData.redditMetadata.age_category,
          external_domain: redditData.redditMetadata.external_domain,
          text_length: redditData.redditMetadata.text_length,
          has_media: redditData.redditMetadata.has_media,
        },
      },
    });

    await reporter.completeStage("content_extraction");

    // Generate tags combining Reddit-specific and AI tags
    await reporter.updateStage("ai_tagging", "processing", 0);

    // Generate Reddit-specific tags
    const redditTags = generateRedditTags(redditData.redditMetadata);

    // Generate AI tags using the full content
    const aiTags = await generateBookmarkTags(
      allArtifacts.extractedText,
      allArtifacts.title || "",
      false, // isTwitter = false
    );

    // Combine Reddit tags with AI tags, removing duplicates
    allArtifacts.tags = Array.from(new Set([...redditTags, ...aiTags]));

    await reporter.completeStage("ai_tagging");

    // Prepare final artifacts with size limit
    const finalArtifacts = {
      ...allArtifacts,
      extractedText: allArtifacts.extractedText?.substring(0, 50000) || null, // Limit to 50KB
    };

    await reporter.completeJob(finalArtifacts);
  } catch (error: any) {
    logger.error(
      { bookmarkId, error: error.message },
      "Reddit API bookmark processing failed",
    );
    throw error;
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
  }
}

/**
 * Reddit API bookmark handler implementation
 */
export class RedditApiBookmarkHandler implements BookmarkHandler {
  canHandle(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return hostname.includes("reddit.com");
    } catch {
      return false;
    }
  }

  getHandlerType(): BookmarkHandlerType {
    return "reddit";
  }

  async processBookmark(
    job: Job<BookmarkJobData>,
    reporter: ProcessingReporter,
  ): Promise<void> {
    return processRedditApiBookmark(job, reporter);
  }
}

// Export singleton instance
export const redditApiHandler = new RedditApiBookmarkHandler();
