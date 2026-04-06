import type { JobContext } from "@eclaire/queue/core";
import { createChildLogger } from "../../../lib/logger.js";
import { TWITTER_HOSTNAMES } from "../twitter-api-client.js";

export * from "./github.js";
export * from "./lightweight-fetch.js";
export * from "./reddit-api.js";
export * from "./twitter-api.js";
// Re-export platform-specific handlers
export * from "./utils.js";

// --- TYPE DEFINITIONS ---

export interface BookmarkJobData {
  bookmarkId: string;
  url: string;
  userId: string;
}

export type BookmarkHandlerType = "regular" | "github" | "reddit" | "twitter";

export interface BookmarkArtifacts {
  normalizedUrl: string;
  title: string;
  description: string;
  author: string | null;
  lang: string;
  contentType: string;
  etag: string;
  lastModified: string;
  extractedMdStorageId: string;
  extractedTxtStorageId: string;
  rawHtmlStorageId: string;
  readableHtmlStorageId: string;
  faviconStorageId: string | null;
  screenshotDesktopStorageId: string;
  screenshotFullPageStorageId: string;
  screenshotMobileStorageId: string;
  pdfStorageId: string;
  extractedText: string;
  tags: string[];
  // biome-ignore lint/suspicious/noExplicitAny: dynamic artifact accumulator for various bookmark types
  rawMetadata?: Record<string, any>;
  // Platform-specific optional artifacts
  readmeStorageId?: string;
}

export interface BookmarkHandler {
  /**
   * Process a bookmark job with platform-specific handling
   */
  processBookmark(ctx: JobContext<BookmarkJobData>): Promise<void>;

  /**
   * Check if this handler can process the given URL
   */
  canHandle(url: string): boolean;

  /**
   * Get the handler type identifier
   */
  getHandlerType(): BookmarkHandlerType;
}

// --- UTILITY FUNCTIONS ---

/**
 * Check if Reddit API credentials are available
 */
function hasRedditCredentials(): boolean {
  return !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
}

/**
 * Check if GitHub API token is available
 */
function hasGitHubCredentials(): boolean {
  return !!process.env.GITHUB_TOKEN;
}

/**
 * Check if X (Twitter) Bearer Token is available for tweet lookup
 */
function hasXCredentials(): boolean {
  return !!process.env.X_BEARER_TOKEN;
}

/**
 * Validate and log API credential availability
 */
export function validateApiCredentials(): void {
  const hasGitHub = hasGitHubCredentials();
  const hasReddit = hasRedditCredentials();
  const hasX = hasXCredentials();

  console.log("\n=== API Credentials Status ===");

  if (hasGitHub) {
    console.log(
      "✅ GitHub API token found - enhanced GitHub repository processing available",
    );
  } else {
    console.log(
      "⚠️  No GitHub API token found - using unauthenticated requests (limited to ~60 requests/hour)",
    );
    console.log(
      "   Set GITHUB_TOKEN environment variable for enhanced GitHub features",
    );
  }

  if (hasReddit) {
    console.log(
      "✅ Reddit API credentials found - enhanced Reddit post processing available",
    );
  } else {
    console.log(
      "⚠️  No Reddit API credentials found - Reddit posts will be processed as regular web pages",
    );
    console.log(
      "   Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET environment variables for enhanced Reddit features",
    );
  }

  if (hasX) {
    console.log(
      "✅ X (Twitter) Bearer Token found - enhanced X/Twitter post processing available",
    );
  } else {
    console.log(
      "⚠️  No X (Twitter) Bearer Token found - X/Twitter posts will be processed as regular web pages",
    );
    console.log(
      "   Set X_BEARER_TOKEN environment variable for enhanced X features",
    );
  }

  console.log("==============================\n");

  // Log to structured logger as well
  const logger = createChildLogger("api-credentials");
  logger.info(
    {
      github: hasGitHub,
      reddit: hasReddit,
      x: hasX,
    },
    "API credential availability check",
  );
}

/**
 * Determine which handler should process a given URL
 */
export function getHandlerForUrl(url: string): BookmarkHandlerType {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    // Twitter/X URLs use the dedicated handler if app credentials are configured
    if (TWITTER_HOSTNAMES.has(hostname)) {
      return hasXCredentials() ? "twitter" : "regular";
    }

    if (hostname === "github.com" || hostname === "www.github.com") {
      return "github";
    }

    // Only use Reddit handler if credentials are available, otherwise fall back to regular
    if (hostname === "reddit.com" || hostname === "www.reddit.com") {
      return hasRedditCredentials() ? "reddit" : "regular";
    }

    return "regular";
  } catch (_error) {
    // If URL parsing fails, fall back to regular handler
    return "regular";
  }
}

/**
 * Normalize a URL by ensuring it has a protocol
 */
export function normalizeUrl(url: string): string {
  if (!url || typeof url !== "string") {
    throw new Error("URL must be a non-empty string");
  }

  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    throw new Error("URL cannot be empty or whitespace only");
  }

  if (/^https?:\/\//i.test(trimmedUrl)) {
    return trimmedUrl;
  }

  if (trimmedUrl.startsWith("//")) {
    return `https:${trimmedUrl}`;
  }

  return `https://${trimmedUrl}`;
}
