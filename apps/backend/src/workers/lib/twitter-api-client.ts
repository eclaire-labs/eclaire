import https from "node:https";
import { createChildLogger } from "../../lib/logger.js";

const logger = createChildLogger("twitter-api-client");

const X_API_BASE = "api.x.com";

/** Canonical set of Twitter/X hostnames recognized for routing and extraction. */
export const TWITTER_HOSTNAMES: ReadonlySet<string> = new Set([
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
  "x.com",
  "www.x.com",
]);

// Tweet fields to request from the API
const TWEET_FIELDS = [
  "author_id",
  "created_at",
  "text",
  "public_metrics",
  "entities",
  "attachments",
  "referenced_tweets",
  "conversation_id",
  "lang",
].join(",");

const EXPANSIONS = [
  "author_id",
  "attachments.media_keys",
  "referenced_tweets.id",
  "referenced_tweets.id.author_id",
].join(",");

const USER_FIELDS = [
  "name",
  "username",
  "verified_type",
  "profile_image_url",
  "public_metrics",
].join(",");

const MEDIA_FIELDS = [
  "type",
  "url",
  "height",
  "width",
  "variants",
  "alt_text",
  "preview_image_url",
].join(",");

export interface TwitterApiResponse {
  success: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: X API v2 response structure varies by endpoint
  data?: any;
  error?: string;
  rateLimitReset?: number;
}

/**
 * Client for interacting with X (Twitter) API v2.
 * Supports both app-only Bearer Token auth and per-user OAuth token auth.
 */
export class TwitterApiClient {
  private bearerToken: string;

  private constructor(bearerToken: string) {
    this.bearerToken = bearerToken;
  }

  /**
   * Create an app-only client using X_BEARER_TOKEN from env.
   * Used for Scenario 1: looking up individual tweets by URL.
   */
  static createAppClient(): TwitterApiClient {
    const token = process.env.X_BEARER_TOKEN;
    if (!token) {
      throw new Error(
        "X_BEARER_TOKEN environment variable is required for X API access",
      );
    }
    return new TwitterApiClient(token);
  }

  /**
   * Create a user-context client with an OAuth access token.
   * Used for Scenario 2: fetching a user's bookmarks.
   */
  static createUserClient(accessToken: string): TwitterApiClient {
    return new TwitterApiClient(accessToken);
  }

  /**
   * Extract tweet ID from various Twitter/X URL formats.
   *
   * Supports:
   *   x.com/username/status/1234567890
   *   twitter.com/username/status/1234567890
   *   mobile.twitter.com/username/status/1234567890
   *   x.com/i/web/status/1234567890
   */
  static extractTweetId(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      if (!TWITTER_HOSTNAMES.has(hostname)) {
        logger.error(
          { url, hostname },
          "URL is not from a valid Twitter/X domain",
        );
        return null;
      }

      const pathParts = urlObj.pathname
        .split("/")
        .filter((part) => part.length > 0);

      // Find "status" in the path and get the next part as tweet ID
      const statusIndex = pathParts.indexOf("status");
      if (statusIndex !== -1 && statusIndex < pathParts.length - 1) {
        const tweetId = pathParts[statusIndex + 1]?.split("?")[0];
        if (tweetId && /^\d+$/.test(tweetId)) {
          return tweetId;
        }
      }

      // Fallback: look for numeric ID in path
      const numericId = pathParts.find((part) => /^\d+$/.test(part));
      if (numericId) {
        return numericId;
      }

      logger.error({ url, pathParts }, "No tweet ID found in URL");
      return null;
    } catch (error) {
      logger.error(
        { url, error: error instanceof Error ? error.message : String(error) },
        "Failed to parse URL when extracting tweet ID",
      );
      return null;
    }
  }

  /**
   * Fetch a single tweet with full field expansions.
   */
  async fetchTweet(tweetId: string): Promise<TwitterApiResponse> {
    const queryParams = new URLSearchParams({
      "tweet.fields": TWEET_FIELDS,
      expansions: EXPANSIONS,
      "user.fields": USER_FIELDS,
      "media.fields": MEDIA_FIELDS,
    });

    const path = `/2/tweets/${tweetId}?${queryParams.toString()}`;
    logger.info({ tweetId }, "Fetching tweet from X API v2");

    return this.apiRequest(path);
  }

  /**
   * Fetch a tweet from a URL (extracts tweet ID first).
   */
  async fetchTweetFromUrl(url: string): Promise<TwitterApiResponse> {
    const tweetId = TwitterApiClient.extractTweetId(url);

    if (!tweetId) {
      return {
        success: false,
        error: `Could not extract tweet ID from URL: ${url}`,
      };
    }

    return this.fetchTweet(tweetId);
  }

  /**
   * Fetch a user's bookmarks (requires user-context OAuth token).
   * Used for Scenario 2: bookmarks sync.
   */
  async fetchBookmarks(
    xUserId: string,
    paginationToken?: string,
  ): Promise<TwitterApiResponse> {
    const params = new URLSearchParams({
      "tweet.fields": TWEET_FIELDS,
      expansions: EXPANSIONS,
      "user.fields": USER_FIELDS,
      "media.fields": MEDIA_FIELDS,
      max_results: "100",
    });

    if (paginationToken) {
      params.set("pagination_token", paginationToken);
    }

    const path = `/2/users/${xUserId}/bookmarks?${params.toString()}`;
    logger.info(
      { xUserId, hasPaginationToken: !!paginationToken },
      "Fetching bookmarks from X API v2",
    );

    return this.apiRequest(path);
  }

  /**
   * Make an authenticated request to the X API v2.
   */
  private async apiRequest(path: string): Promise<TwitterApiResponse> {
    return new Promise((resolve, _reject) => {
      const req = https.request(
        {
          hostname: X_API_BASE,
          path,
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.bearerToken}`,
            "User-Agent": "Eclaire/1.0.0",
          },
          timeout: 30000,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            const statusCode = res.statusCode || 0;

            // Parse rate limit headers
            const rateLimitReset = res.headers["x-rate-limit-reset"]
              ? Number(res.headers["x-rate-limit-reset"])
              : undefined;

            try {
              const parsed = JSON.parse(data);

              if (statusCode === 200) {
                resolve({ success: true, data: parsed, rateLimitReset });
              } else if (statusCode === 429) {
                logger.warn(
                  { path, rateLimitReset },
                  "X API rate limit exceeded",
                );
                resolve({
                  success: false,
                  error: "X API rate limit exceeded",
                  rateLimitReset,
                });
              } else if (statusCode === 401) {
                resolve({
                  success: false,
                  error: "X API authentication failed — token may be expired",
                });
              } else if (statusCode === 403) {
                resolve({
                  success: false,
                  error:
                    parsed?.detail ||
                    "Access forbidden — tweet may be from a protected account",
                });
              } else if (statusCode === 404) {
                resolve({
                  success: false,
                  error: "Tweet not found or deleted",
                });
              } else {
                resolve({
                  success: false,
                  error:
                    parsed?.detail ||
                    parsed?.title ||
                    `X API returned status ${statusCode}`,
                  rateLimitReset,
                });
              }
            } catch {
              resolve({
                success: false,
                error: `Failed to parse X API response (status ${statusCode})`,
              });
            }
          });
        },
      );

      req.on("error", (error) => {
        logger.error(
          { path, error: error.message },
          "X API request network error",
        );
        resolve({
          success: false,
          error: `Network error: ${error.message}`,
        });
      });

      req.on("timeout", () => {
        req.destroy();
        resolve({
          success: false,
          error: "X API request timed out",
        });
      });

      req.end();
    });
  }
}
