import { like, and, eq, or } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { TwitterApiClient } from "../../workers/lib/twitter-api-client.js";
import { createChildLogger } from "../logger.js";
import { createBookmarkAndQueueJob } from "./bookmarks.js";
import { humanCaller } from "./types.js";
import { getXTokenForUser } from "./x-tokens.js";

const logger = createChildLogger("x-bookmarks-sync");

export interface XBookmarkSyncResult {
  imported: number;
  skipped: number;
  total: number;
  errors: string[];
}

/**
 * Extract tweet ID from a tweet's data object returned by the X API.
 * The API returns the tweet ID directly in the data object.
 */
function tweetIdFromApiData(
  // biome-ignore lint/suspicious/noExplicitAny: X API tweet data shape
  tweet: any,
  // biome-ignore lint/suspicious/noExplicitAny: X API includes object
  includes: any,
): { tweetId: string; username: string } | null {
  const tweetId = tweet?.id;
  if (!tweetId) return null;

  // Resolve author username from includes.users
  const authorId = tweet.author_id;
  const users = includes?.users || [];
  // biome-ignore lint/suspicious/noExplicitAny: X API user object
  const author = users.find((u: any) => u.id === authorId);
  const username = author?.username || "i";

  return { tweetId, username };
}

/**
 * Check which tweet IDs from a batch already exist as bookmarks for this user.
 * Returns a Set of tweet IDs that are already imported.
 */
async function findExistingTweetIds(
  userId: string,
  tweetIds: string[],
): Promise<Set<string>> {
  if (tweetIds.length === 0) return new Set();

  // Build OR conditions: originalUrl LIKE '%/status/{tweetId}%' for each ID
  const conditions = tweetIds.map((id) =>
    like(schema.bookmarks.originalUrl, `%/status/${id}%`),
  );

  const existing = await db
    .select({ originalUrl: schema.bookmarks.originalUrl })
    .from(schema.bookmarks)
    .where(and(eq(schema.bookmarks.userId, userId), or(...conditions)));

  // Extract tweet IDs from the matched URLs
  const existingIds = new Set<string>();
  for (const row of existing) {
    const match = row.originalUrl.match(/\/status\/(\d+)/);
    if (match?.[1]) {
      existingIds.add(match[1]);
    }
  }

  return existingIds;
}

/**
 * Filter the page-level `includes` object to only the entries relevant to a
 * specific tweet, avoiding duplicating the full shared payload across every
 * bookmark row.
 */
function filterIncludesForTweet(
  // biome-ignore lint/suspicious/noExplicitAny: X API tweet data shape
  tweet: any,
  // biome-ignore lint/suspicious/noExplicitAny: X API includes object
  includes: any,
  // biome-ignore lint/suspicious/noExplicitAny: X API includes subset
): any {
  // biome-ignore lint/suspicious/noExplicitAny: building a filtered includes subset
  const filtered: any = {};

  // Collect relevant user IDs: tweet author + referenced tweet authors
  const userIds = new Set<string>();
  if (tweet.author_id) userIds.add(tweet.author_id);

  const referencedTweetIds = new Set<string>(
    (tweet.referenced_tweets || []).map((r: { id: string }) => r.id),
  );

  // Filter referenced tweets and collect their author IDs
  if (includes.tweets) {
    filtered.tweets = includes.tweets.filter(
      // biome-ignore lint/suspicious/noExplicitAny: X API tweet object
      (t: any) => {
        if (referencedTweetIds.has(t.id)) {
          if (t.author_id) userIds.add(t.author_id);
          return true;
        }
        return false;
      },
    );
  }

  // Filter users to only relevant author IDs
  if (includes.users) {
    // biome-ignore lint/suspicious/noExplicitAny: X API user object
    filtered.users = includes.users.filter((u: any) => userIds.has(u.id));
  }

  // Filter media to only keys referenced by this tweet's attachments
  const mediaKeys = new Set<string>(tweet.attachments?.media_keys || []);
  if (includes.media && mediaKeys.size > 0) {
    // biome-ignore lint/suspicious/noExplicitAny: X API media object
    filtered.media = includes.media.filter((m: any) =>
      mediaKeys.has(m.media_key),
    );
  }

  return filtered;
}

/**
 * Sync a user's X bookmarks into Eclaire.
 *
 * Fetches the user's bookmarks from the X API, deduplicates against existing
 * bookmarks, and creates new bookmarks for tweets not yet imported.
 *
 * Cost control:
 * - Stops paginating when a full page of already-known tweets is encountered
 *   (bookmarks are returned in reverse chronological order)
 * - Max 100 tweets per API page, max 800 total from the API
 */
export async function syncXBookmarks(
  userId: string,
): Promise<XBookmarkSyncResult> {
  const result: XBookmarkSyncResult = {
    imported: 0,
    skipped: 0,
    total: 0,
    errors: [],
  };

  // Get the user's OAuth token
  const tokenResult = await getXTokenForUser(userId);
  if (!tokenResult) {
    throw new Error(
      "X account not connected. Please connect your X account in Settings to sync bookmarks.",
    );
  }

  const client = TwitterApiClient.createUserClient(tokenResult.accessToken);
  let paginationToken: string | undefined;
  let pagesProcessed = 0;
  const maxPages = 8; // 8 pages * 100 = 800 max bookmarks (API limit)

  logger.info({ userId }, "Starting X bookmarks sync");

  while (pagesProcessed < maxPages) {
    const response = await client.fetchBookmarks(
      tokenResult.xUserId,
      paginationToken,
    );

    if (!response.success) {
      // If first page fails, throw. If later page fails, return partial results.
      if (pagesProcessed === 0) {
        throw new Error(`Failed to fetch X bookmarks: ${response.error}`);
      }
      logger.warn(
        { userId, page: pagesProcessed, error: response.error },
        "X bookmarks fetch failed on subsequent page, returning partial results",
      );
      result.errors.push(response.error || "Unknown error");
      break;
    }

    const tweets = response.data?.data || [];
    const includes = response.data?.includes || {};
    const nextToken = response.data?.meta?.next_token;

    if (tweets.length === 0) {
      break;
    }

    result.total += tweets.length;

    // Batch dedup check: which tweet IDs already exist?
    // biome-ignore lint/suspicious/noExplicitAny: X API tweet object
    const tweetIds = tweets.map((t: any) => t.id).filter(Boolean) as string[];
    const existingIds = await findExistingTweetIds(userId, tweetIds);

    let allKnown = true;

    for (const tweet of tweets) {
      const info = tweetIdFromApiData(tweet, includes);
      if (!info) {
        result.errors.push(
          `Could not extract ID from tweet: ${JSON.stringify(tweet).slice(0, 100)}`,
        );
        continue;
      }

      if (existingIds.has(info.tweetId)) {
        result.skipped++;
        continue;
      }

      // Not a duplicate — this page has new content
      allKnown = false;

      // Create bookmark with canonical URL
      const tweetUrl = `https://x.com/${info.username}/status/${info.tweetId}`;

      try {
        // Pass the pre-fetched tweet data so the handler skips the API call.
        // includes is filtered to only the entries relevant to this tweet to
        // avoid duplicating the full page payload across every bookmark row.
        await createBookmarkAndQueueJob(
          {
            url: tweetUrl,
            userId,
            rawMetadata: {
              title: tweet.text?.slice(0, 100) || `Tweet ${info.tweetId}`,
              importedFrom: "x-bookmarks-sync",
              twitterApiData: {
                data: tweet,
                includes: filterIncludesForTweet(tweet, includes),
              },
            },
            userAgent: "Eclaire X Bookmarks Sync",
          },
          humanCaller(userId),
        );
        result.imported++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(
          { userId, tweetId: info.tweetId, error: msg },
          "Failed to create bookmark for synced tweet",
        );
        result.errors.push(`Tweet ${info.tweetId}: ${msg}`);
      }
    }

    pagesProcessed++;

    // Cost control: if every tweet on this page was already known, stop.
    // Bookmarks are returned in reverse chronological order, so older pages
    // will also be known.
    if (allKnown) {
      logger.info(
        { userId, page: pagesProcessed },
        "All tweets on page already imported, stopping sync",
      );
      break;
    }

    // Continue to next page if available
    if (!nextToken) {
      break;
    }
    paginationToken = nextToken;
  }

  logger.info(
    {
      userId,
      imported: result.imported,
      skipped: result.skipped,
      total: result.total,
      pages: pagesProcessed,
      errors: result.errors.length,
    },
    "X bookmarks sync completed",
  );

  return result;
}
