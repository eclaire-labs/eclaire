import { type BrowserContext, chromium } from "patchright";
import sharp from "sharp";
import { Readable } from "stream";
import type { JobContext } from "@eclaire/queue/core";
import { createChildLogger } from "../../../lib/logger.js";
import { createRedditApiClient } from "../reddit-api-client.js";
import { extractRedditData } from "../reddit-extractor.js";
import {
  generateRedditHTMLNoComments,
  generateRedditHTMLWithComments,
} from "../reddit-renderer.js";
import { generateRedditTags } from "../reddit-tags.js";
import { getStorage, buildKey } from "../../../lib/storage/index.js";
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
  ctx: JobContext<BookmarkJobData>,
): Promise<void> {
  const { bookmarkId, url: originalUrl, userId } = ctx.job.data;
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

    await ctx.startStage("validation");
    await ctx.updateStageProgress("validation", 50);
    await ctx.completeStage("validation");

    await ctx.startStage("content_extraction");

    // Stage 1: Fetch raw Reddit data via API
    logger.info({ bookmarkId }, "Fetching Reddit data via API");
    const redditClient = createRedditApiClient({ maxMoreCalls: 3 }); // Use requested limit
    const apiResponse = await redditClient.fetchPostFromUrl(normalizedUrl);

    if (!apiResponse.success || !apiResponse.data) {
      throw new Error(`Reddit API fetch failed: ${apiResponse.error}`);
    }

    // Save raw Reddit JSON
    const storage = getStorage();
    const rawJsonBuffer = Buffer.from(
      JSON.stringify(apiResponse.data, null, 2),
      "utf-8",
    );
    const rawJsonKey = buildKey(userId, "bookmarks", bookmarkId, "redditRaw.json");
    await storage.writeBuffer(rawJsonKey, rawJsonBuffer, { contentType: "application/json" });
    allArtifacts.redditRawStorageId = rawJsonKey;

    await ctx.updateStageProgress("content_extraction", 25);

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
    const simpleJsonKey = buildKey(userId, "bookmarks", bookmarkId, "redditSimple.json");
    await storage.writeBuffer(simpleJsonKey, simpleJsonBuffer, { contentType: "application/json" });
    allArtifacts.redditSimpleStorageId = simpleJsonKey;

    await ctx.updateStageProgress("content_extraction", 50);

    // Stage 3: Generate HTML versions
    logger.info({ bookmarkId }, "Generating HTML renders");

    // Generate HTML without comments (for thumbnails and screenshots)
    const htmlNoComments = generateRedditHTMLNoComments(redditData);
    const htmlNoCommentsBuffer = Buffer.from(htmlNoComments, "utf-8");
    const noCommentsKey = buildKey(userId, "bookmarks", bookmarkId, "reddit-no-comments.html");
    await storage.writeBuffer(noCommentsKey, htmlNoCommentsBuffer, { contentType: "text/html" });
    allArtifacts.redditNoCommentsStorageId = noCommentsKey;

    // Generate HTML with comments (for full content and PDFs)
    const htmlWithComments = generateRedditHTMLWithComments(redditData);
    const htmlWithCommentsBuffer = Buffer.from(htmlWithComments, "utf-8");
    const withCommentsKey = buildKey(userId, "bookmarks", bookmarkId, "reddit-with-comments.html");
    await storage.writeBuffer(withCommentsKey, htmlWithCommentsBuffer, { contentType: "text/html" });
    allArtifacts.redditWithCommentsStorageId = withCommentsKey;

    await ctx.updateStageProgress("content_extraction", 75);

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
    const thumbnailKey = buildKey(userId, "bookmarks", bookmarkId, "thumbnail.jpg");
    await storage.writeBuffer(thumbnailKey, thumbnailBuffer, { contentType: "image/jpeg" });
    allArtifacts.thumbnailStorageId = thumbnailKey;

    // Generate screenshot (higher resolution, 1920x1440, 90% quality)
    const screenshotBuffer = await sharp(ssDesktopBuffer)
      .resize(1920, 1440, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
    const screenshotKey = buildKey(userId, "bookmarks", bookmarkId, "screenshot.jpg");
    await storage.writeBuffer(screenshotKey, screenshotBuffer, { contentType: "image/jpeg" });
    allArtifacts.screenshotDesktopStorageId = screenshotKey;

    // Take full page screenshot using full content HTML (with comments)
    const fullDataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlWithComments)}`;
    await page.goto(fullDataUrl, { waitUntil: "networkidle", timeout: 60000 });
    const ssFullPageBuffer = await page.screenshot({
      type: "png",
      fullPage: true,
    });
    const fullpageKey = buildKey(userId, "bookmarks", bookmarkId, "screenshot-fullpage.png");
    await storage.writeBuffer(fullpageKey, ssFullPageBuffer, { contentType: "image/png" });
    allArtifacts.screenshotFullPageStorageId = fullpageKey;

    // Take mobile screenshot (post only, no comments)
    const mobileDataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlNoComments)}`;
    await page.goto(mobileDataUrl, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await page.setViewportSize({ width: 375, height: 667 });
    const ssMobileBuffer = await page.screenshot({ type: "png" });
    const mobileKey = buildKey(userId, "bookmarks", bookmarkId, "screenshot-mobile.png");
    await storage.writeBuffer(mobileKey, ssMobileBuffer, { contentType: "image/png" });
    allArtifacts.screenshotMobileStorageId = mobileKey;

    // Reset viewport for PDF generation
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Generate PDF from full content HTML (with comments)
    await page.goto(fullDataUrl, { waitUntil: "networkidle", timeout: 60000 });
    const pdfBuffer = await generateOptimizedPdf(page, bookmarkId);
    const pdfKey = buildKey(userId, "bookmarks", bookmarkId, "content.pdf");
    await storage.writeBuffer(pdfKey, pdfBuffer, { contentType: "application/pdf" });
    allArtifacts.pdfStorageId = pdfKey;

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

    await ctx.completeStage("content_extraction");

    // Generate tags combining Reddit-specific and AI tags
    await ctx.startStage("ai_tagging");

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

    // Prepare final artifacts with size limit
    const finalArtifacts = {
      ...allArtifacts,
      extractedText: allArtifacts.extractedText?.substring(0, 50000) || null, // Limit to 50KB
    };

    // Complete the final stage with artifacts - job completion is implicit when handler returns
    await ctx.completeStage("ai_tagging", finalArtifacts);
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
    ctx: JobContext<BookmarkJobData>,
  ): Promise<void> {
    return processRedditApiBookmark(ctx);
  }
}

// Export singleton instance
export const redditApiHandler = new RedditApiBookmarkHandler();
