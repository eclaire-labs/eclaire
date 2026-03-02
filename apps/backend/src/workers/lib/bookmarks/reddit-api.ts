import type { JobContext } from "@eclaire/queue/core";
import { createChildLogger } from "../../../lib/logger.js";
import { buildKey, getStorage } from "../../../lib/storage/index.js";
import { createRedditApiClient } from "../reddit-api-client.js";
import { extractRedditData } from "../reddit-extractor.js";
import {
  generateRedditHTMLNoComments,
  generateRedditHTMLWithComments,
} from "../reddit-renderer.js";
import { generateRedditTags } from "../reddit-tags.js";
import { BrowserPipeline } from "./browser-pipeline.js";
import type {
  BookmarkHandler,
  BookmarkHandlerType,
  BookmarkJobData,
} from "./index.js";
import { normalizeUrl } from "./index.js";
import { extractContentFromHtml, generateBookmarkTags } from "./utils.js";

const logger = createChildLogger("reddit-api-bookmark-handler");

/**
 * Reddit API-based bookmark processing handler using BrowserPipeline.
 */
export async function processRedditApiBookmark(
  ctx: JobContext<BookmarkJobData>,
): Promise<void> {
  const { bookmarkId, url: originalUrl, userId } = ctx.job.data;
  logger.info({ bookmarkId, userId }, "Processing with REDDIT-API handler");

  // biome-ignore lint/suspicious/noExplicitAny: dynamic artifact accumulator populated across processing stages
  const allArtifacts: Record<string, any> = {};

  const pipeline = new BrowserPipeline({ bookmarkId, userId, logger });

  try {
    const normalizedUrl = normalizeUrl(originalUrl);
    allArtifacts.normalizedUrl = normalizedUrl;

    await ctx.startStage("validation");
    await ctx.updateStageProgress("validation", 50);
    await ctx.completeStage("validation");

    await ctx.startStage("content_extraction");

    // Stage 1: Fetch raw Reddit data via API
    logger.info({ bookmarkId }, "Fetching Reddit data via API");
    const redditClient = createRedditApiClient({ maxMoreCalls: 3 });
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
    const rawJsonKey = buildKey(
      userId,
      "bookmarks",
      bookmarkId,
      "redditRaw.json",
    );
    await storage.writeBuffer(rawJsonKey, rawJsonBuffer, {
      contentType: "application/json",
    });
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
    const simpleJsonKey = buildKey(
      userId,
      "bookmarks",
      bookmarkId,
      "redditSimple.json",
    );
    await storage.writeBuffer(simpleJsonKey, simpleJsonBuffer, {
      contentType: "application/json",
    });
    allArtifacts.redditSimpleStorageId = simpleJsonKey;

    await ctx.updateStageProgress("content_extraction", 50);

    // Stage 3: Generate HTML versions
    logger.info({ bookmarkId }, "Generating HTML renders");

    const htmlNoComments = generateRedditHTMLNoComments(redditData);
    const htmlNoCommentsBuffer = Buffer.from(htmlNoComments, "utf-8");
    const noCommentsKey = buildKey(
      userId,
      "bookmarks",
      bookmarkId,
      "reddit-no-comments.html",
    );
    await storage.writeBuffer(noCommentsKey, htmlNoCommentsBuffer, {
      contentType: "text/html",
    });
    allArtifacts.redditNoCommentsStorageId = noCommentsKey;

    const htmlWithComments = generateRedditHTMLWithComments(redditData);
    const htmlWithCommentsBuffer = Buffer.from(htmlWithComments, "utf-8");
    const withCommentsKey = buildKey(
      userId,
      "bookmarks",
      bookmarkId,
      "reddit-with-comments.html",
    );
    await storage.writeBuffer(withCommentsKey, htmlWithCommentsBuffer, {
      contentType: "text/html",
    });
    allArtifacts.redditWithCommentsStorageId = withCommentsKey;

    await ctx.updateStageProgress("content_extraction", 75);

    // Stage 4: Screenshots and PDFs via browser pipeline
    logger.info({ bookmarkId }, "Generating screenshots and PDFs");
    await pipeline.launch();

    // Navigate to no-comments HTML for screenshots
    await pipeline.navigateToHtml(htmlNoComments);
    const screenshotArtifacts = await pipeline.captureAllScreenshots();
    Object.assign(allArtifacts, screenshotArtifacts);

    // Navigate to with-comments HTML for full-page screenshot and PDF
    await pipeline.navigateToHtml(htmlWithComments);

    // Capture full-page of the comments version (overrides the no-comments fullpage)
    try {
      const page = pipeline.page;
      await page.setViewportSize({ width: 1920, height: 1080 });
      const ssFullPageBuffer = await page.screenshot({
        type: "png",
        fullPage: true,
      });
      const fullpageKey = buildKey(
        userId,
        "bookmarks",
        bookmarkId,
        "screenshot-fullpage.png",
      );
      await storage.writeBuffer(fullpageKey, ssFullPageBuffer, {
        contentType: "image/png",
      });
      allArtifacts.screenshotFullPageStorageId = fullpageKey;
    } catch (err: unknown) {
      logger.warn(
        {
          bookmarkId,
          error: err instanceof Error ? err.message : String(err),
        },
        "Reddit full-page screenshot with comments failed, skipping",
      );
    }

    // PDF from with-comments version
    const pdfArtifacts = await pipeline.capturePdf();
    Object.assign(allArtifacts, pdfArtifacts);

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

    const redditTags = generateRedditTags(redditData.redditMetadata);
    const aiTags = await generateBookmarkTags(
      allArtifacts.extractedText,
      allArtifacts.title || "",
      false,
    );

    allArtifacts.tags = Array.from(new Set([...redditTags, ...aiTags]));

    const { extractedText: _excludeText, ...finalArtifacts } = allArtifacts;
    await ctx.completeStage("ai_tagging", finalArtifacts);
  } catch (error: unknown) {
    logger.error(
      {
        bookmarkId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Reddit API bookmark processing failed",
    );
    throw error;
  } finally {
    await pipeline.cleanup();
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

  async processBookmark(ctx: JobContext<BookmarkJobData>): Promise<void> {
    return processRedditApiBookmark(ctx);
  }
}

// Export singleton instance
export const redditApiHandler = new RedditApiBookmarkHandler();
