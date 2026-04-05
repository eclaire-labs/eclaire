import type { JobContext } from "@eclaire/queue/core";
import { eq } from "drizzle-orm";
import { db, schema } from "../../../db/index.js";
import { createChildLogger } from "../../../lib/logger.js";
import { buildKey, getStorage } from "../../../lib/storage/index.js";
import { TwitterApiClient } from "../twitter-api-client.js";
import { extractTwitterData } from "../twitter-extractor.js";
import {
  generateTwitterHTMLNoReplies,
  generateTwitterHTMLWithReplies,
} from "../twitter-renderer.js";
import { generateTwitterTags } from "../twitter-tags.js";
import { BrowserPipeline } from "./browser-pipeline.js";
import type {
  BookmarkHandler,
  BookmarkHandlerType,
  BookmarkJobData,
} from "./index.js";
import { normalizeUrl } from "./index.js";
import { extractContentFromHtml, generateBookmarkTags } from "./utils.js";

const logger = createChildLogger("twitter-api-bookmark-handler");

/**
 * Twitter/X API-based bookmark processing handler using BrowserPipeline.
 * Uses app-only Bearer Token (X_BEARER_TOKEN) — works for all users,
 * no per-user OAuth connection required.
 */
export async function processTwitterApiBookmark(
  ctx: JobContext<BookmarkJobData>,
): Promise<void> {
  const { bookmarkId, url: originalUrl, userId } = ctx.job.data;
  logger.info({ bookmarkId, userId }, "Processing with TWITTER-API handler");

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

    // Stage 1: Get tweet data — use pre-fetched data from bookmarks sync if available,
    // otherwise fetch via X API v2 (app-only Bearer Token).
    // biome-ignore lint/suspicious/noExplicitAny: raw X API response
    let tweetApiData: any;

    const [bookmarkRecord] = await db
      .select({ rawMetadata: schema.bookmarks.rawMetadata })
      .from(schema.bookmarks)
      .where(eq(schema.bookmarks.id, bookmarkId))
      .limit(1);

    const prefetched =
      bookmarkRecord?.rawMetadata &&
      typeof bookmarkRecord.rawMetadata === "object" &&
      "twitterApiData" in bookmarkRecord.rawMetadata
        ? // biome-ignore lint/suspicious/noExplicitAny: pre-fetched API data stored in rawMetadata
          (bookmarkRecord.rawMetadata as any).twitterApiData
        : null;

    if (prefetched?.data) {
      logger.info(
        { bookmarkId },
        "Using pre-fetched tweet data from bookmarks sync",
      );
      tweetApiData = prefetched;
    } else {
      logger.info({ bookmarkId }, "Fetching tweet data via X API v2");
      const twitterClient = TwitterApiClient.createAppClient();
      const apiResponse = await twitterClient.fetchTweetFromUrl(normalizedUrl);

      if (!apiResponse.success || !apiResponse.data) {
        throw new Error(`X API fetch failed: ${apiResponse.error}`);
      }
      tweetApiData = apiResponse.data;
    }

    // Save raw API JSON
    const storage = getStorage();
    const rawJsonBuffer = Buffer.from(
      JSON.stringify(tweetApiData, null, 2),
      "utf-8",
    );
    const rawJsonKey = buildKey(
      userId,
      "bookmarks",
      bookmarkId,
      "twitterRaw.json",
    );
    await storage.writeBuffer(rawJsonKey, rawJsonBuffer, {
      contentType: "application/json",
    });
    allArtifacts.twitterRawStorageId = rawJsonKey;

    await ctx.updateStageProgress("content_extraction", 25);

    // Stage 2: Extract and transform data
    logger.info({ bookmarkId }, "Extracting Twitter data");
    const twitterData = extractTwitterData(tweetApiData);

    // Save simplified JSON
    const simpleJsonBuffer = Buffer.from(
      JSON.stringify(twitterData, null, 2),
      "utf-8",
    );
    const simpleJsonKey = buildKey(
      userId,
      "bookmarks",
      bookmarkId,
      "twitterSimple.json",
    );
    await storage.writeBuffer(simpleJsonKey, simpleJsonBuffer, {
      contentType: "application/json",
    });
    allArtifacts.twitterSimpleStorageId = simpleJsonKey;

    await ctx.updateStageProgress("content_extraction", 50);

    // Stage 3: Generate HTML versions
    logger.info({ bookmarkId }, "Generating HTML renders");

    const htmlNoReplies = generateTwitterHTMLNoReplies(twitterData);
    const htmlNoRepliesBuffer = Buffer.from(htmlNoReplies, "utf-8");
    const noRepliesKey = buildKey(
      userId,
      "bookmarks",
      bookmarkId,
      "twitter-no-replies.html",
    );
    await storage.writeBuffer(noRepliesKey, htmlNoRepliesBuffer, {
      contentType: "text/html",
    });
    allArtifacts.twitterNoRepliesStorageId = noRepliesKey;

    const htmlWithReplies = generateTwitterHTMLWithReplies(twitterData);
    const htmlWithRepliesBuffer = Buffer.from(htmlWithReplies, "utf-8");
    const withRepliesKey = buildKey(
      userId,
      "bookmarks",
      bookmarkId,
      "twitter-with-replies.html",
    );
    await storage.writeBuffer(withRepliesKey, htmlWithRepliesBuffer, {
      contentType: "text/html",
    });
    allArtifacts.twitterWithRepliesStorageId = withRepliesKey;

    await ctx.updateStageProgress("content_extraction", 75);

    // Stage 4: Screenshots and PDFs via browser pipeline
    logger.info({ bookmarkId }, "Generating screenshots and PDFs");
    await pipeline.launch();

    // Navigate to no-replies HTML for screenshots
    await pipeline.navigateToHtml(htmlNoReplies);
    const screenshotArtifacts = await pipeline.captureAllScreenshots();
    Object.assign(allArtifacts, screenshotArtifacts);

    // Navigate to with-replies HTML for full-page screenshot and PDF
    await pipeline.navigateToHtml(htmlWithReplies);

    // Full-page screenshot from the with-replies version
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
        "Twitter full-page screenshot failed, skipping",
      );
    }

    // PDF from with-replies version
    const pdfArtifacts = await pipeline.capturePdf();
    Object.assign(allArtifacts, pdfArtifacts);

    // Extract content from HTML for text search
    const contentData = await extractContentFromHtml(
      htmlWithReplies,
      normalizedUrl,
      userId,
      bookmarkId,
    );

    // Set Twitter-specific title and description
    const mainTweet = twitterData.mainTweet;
    const twitterTitle = `${mainTweet.author.name} (@${mainTweet.author.username}) on X`;
    const twitterDescription =
      mainTweet.text.slice(0, 200) + (mainTweet.text.length > 200 ? "..." : "");

    Object.assign(allArtifacts, {
      ...contentData,
      title: twitterTitle,
      description: twitterDescription,
      rawMetadata: {
        ...contentData.rawMetadata,
        twitter: {
          replies: twitterData.twitterMetadata.replies,
          retweets: twitterData.twitterMetadata.retweets,
          likes: twitterData.twitterMetadata.likes,
          bookmarks: twitterData.twitterMetadata.bookmarks,
          impressions: twitterData.twitterMetadata.impressions,
          quotes: twitterData.twitterMetadata.quotes,

          author_id: twitterData.twitterMetadata.author_id,
          author_name: twitterData.twitterMetadata.author_name,
          author_username: twitterData.twitterMetadata.author_username,
          author_verified_type:
            twitterData.twitterMetadata.author_verified_type,
          author_profile_image:
            twitterData.twitterMetadata.author_profile_image,

          tweet_type: twitterData.twitterMetadata.tweet_type,
          has_media: twitterData.twitterMetadata.has_media,
          media_count: twitterData.twitterMetadata.media_count,
          media_types: twitterData.twitterMetadata.media_types,
          has_links: twitterData.twitterMetadata.has_links,
          link_count: twitterData.twitterMetadata.link_count,

          created_at: twitterData.twitterMetadata.created_at,
          age_category: twitterData.twitterMetadata.age_category,
          lang: twitterData.twitterMetadata.lang,

          text_length: twitterData.twitterMetadata.text_length,
        },
      },
    });

    await ctx.completeStage("content_extraction");

    // Generate tags combining Twitter-specific and AI tags
    await ctx.startStage("ai_tagging");

    const twitterTags = generateTwitterTags(twitterData.twitterMetadata);
    const aiTags = await generateBookmarkTags(
      allArtifacts.extractedText,
      allArtifacts.title || "",
      false,
    );

    allArtifacts.tags = [...new Set([...twitterTags, ...aiTags])];

    const { extractedText: _excludeText, ...finalArtifacts } = allArtifacts;
    await ctx.completeStage("ai_tagging", finalArtifacts);
  } catch (error: unknown) {
    logger.error(
      {
        bookmarkId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Twitter API bookmark processing failed",
    );
    throw error;
  } finally {
    await pipeline.cleanup();
  }
}

/**
 * Twitter/X API bookmark handler implementation.
 */
export class TwitterApiBookmarkHandler implements BookmarkHandler {
  canHandle(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return (
        hostname === "twitter.com" ||
        hostname === "www.twitter.com" ||
        hostname === "x.com" ||
        hostname === "www.x.com"
      );
    } catch {
      return false;
    }
  }

  getHandlerType(): BookmarkHandlerType {
    return "twitter";
  }

  async processBookmark(ctx: JobContext<BookmarkJobData>): Promise<void> {
    return processTwitterApiBookmark(ctx);
  }
}

// Export singleton instance
export const twitterApiHandler = new TwitterApiBookmarkHandler();
