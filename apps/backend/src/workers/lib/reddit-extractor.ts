import { createChildLogger } from "../../lib/logger.js";
import type {
  RedditMediaInfo,
  RedditSubredditInfo,
} from "./reddit-api-client.js";

const logger = createChildLogger("reddit-extractor");

export interface RedditPostData {
  id: string;
  title: string;
  author: string;
  subreddit: string;
  selftext: string;
  selftext_html: string;
  url: string;
  is_self: boolean;
  score: number;
  upvote_ratio: number;
  num_comments: number;
  created_utc: number;
  permalink: string;
  domain: string;
  media: RedditMediaInfo;
}

export interface RedditCommentData {
  id: string;
  author: string;
  body: string;
  body_html: string;
  score: number;
  created_utc: number;
  depth: number;
  replies: RedditCommentData[];
}

export interface RedditMetadata {
  // Post Engagement & Stats
  score: number;
  upvote_ratio: number;
  num_comments: number;
  view_count?: number;

  // Post Type Classification
  post_type: "text" | "image" | "video" | "gallery" | "link";

  // Subreddit Context
  subreddit_name: string;
  subreddit_subscribers?: number;
  subreddit_description?: string;

  // Temporal Data
  created_utc: number;
  edited_utc?: number;
  age_category: "fresh" | "recent" | "older";

  // Content Analysis
  external_domain?: string;
  text_length: number;
  has_media: boolean;
}

export interface RedditExtractedData {
  mainPost: RedditPostData;
  subreddit: RedditSubredditInfo | null;
  comments: RedditCommentData[];
  stats: {
    totalComments: number;
    apiCallsUsed: number;
  };
  metadata: {
    fetchTimestamp: number;
    originalUrl: string;
  };
  redditMetadata: RedditMetadata;
}

/**
 * Transform raw Reddit API response into a simplified, structured format
 * suitable for rendering and storage
 */
export function extractRedditData(rawApiResponse: any): RedditExtractedData {
  try {
    logger.info("Extracting Reddit data from API response");

    const { post, subreddit, comments, stats, rawData } = rawApiResponse;

    if (!post) {
      throw new Error("No post data found in API response");
    }

    // Transform post data to ensure consistent structure
    const mainPost: RedditPostData = {
      id: post.id,
      title: post.title || "",
      author: post.author || "[deleted]",
      subreddit: post.subreddit || "",
      selftext: post.selftext || "",
      selftext_html: post.selftext_html || "",
      url: post.url || "",
      is_self: Boolean(post.is_self),
      score: typeof post.score === "number" ? post.score : 0,
      upvote_ratio:
        typeof post.upvote_ratio === "number" ? post.upvote_ratio : 0.5,
      num_comments:
        typeof post.num_comments === "number" ? post.num_comments : 0,
      created_utc: typeof post.created_utc === "number" ? post.created_utc : 0,
      permalink: post.permalink || "",
      domain: post.domain || "",
      media: post.media || { type: "none" },
    };

    // Transform comments to ensure consistent structure
    const transformedComments: RedditCommentData[] = transformComments(
      comments || [],
    );

    // Transform subreddit info if available
    const transformedSubreddit: RedditSubredditInfo | null = subreddit
      ? {
          display_name: subreddit.display_name || "",
          display_name_prefixed: subreddit.display_name_prefixed || "",
          title: subreddit.title || "",
          public_description: subreddit.public_description || "",
          icon_img: subreddit.icon_img || null,
          header_img: subreddit.header_img || null,
          subscribers:
            typeof subreddit.subscribers === "number"
              ? subreddit.subscribers
              : 0,
          created_utc:
            typeof subreddit.created_utc === "number"
              ? subreddit.created_utc
              : 0,
        }
      : null;

    // Extract Reddit-specific metadata
    const redditMetadata = extractRedditMetadata(post, subreddit);

    const extractedData: RedditExtractedData = {
      mainPost,
      subreddit: transformedSubreddit,
      comments: transformedComments,
      stats: {
        totalComments:
          typeof stats?.totalComments === "number"
            ? stats.totalComments
            : transformedComments.length,
        apiCallsUsed:
          typeof stats?.apiCallsUsed === "number" ? stats.apiCallsUsed : 1,
      },
      metadata: {
        fetchTimestamp: rawData?.fetchTimestamp || Date.now(),
        originalUrl: rawData?.url || "",
      },
      redditMetadata,
    };

    logger.info(
      {
        postId: mainPost.id,
        commentCount: extractedData.stats.totalComments,
        subreddit: mainPost.subreddit,
      },
      "Reddit data extraction complete",
    );

    return extractedData;
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to extract Reddit data");
    throw new Error(`Reddit data extraction failed: ${error.message}`);
  }
}

/**
 * Recursively transform comment tree to ensure consistent structure
 */
function transformComments(comments: any[]): RedditCommentData[] {
  if (!Array.isArray(comments)) {
    return [];
  }

  return comments
    .map((comment) => {
      if (!comment || typeof comment !== "object") {
        return null;
      }

      const transformedComment: RedditCommentData = {
        id: comment.id || "",
        author: comment.author || "[deleted]",
        body: comment.body || "",
        body_html: comment.body_html || "",
        score: typeof comment.score === "number" ? comment.score : 0,
        created_utc:
          typeof comment.created_utc === "number" ? comment.created_utc : 0,
        depth: typeof comment.depth === "number" ? comment.depth : 0,
        replies: transformComments(comment.replies || []),
      };

      return transformedComment;
    })
    .filter((comment) => comment !== null) as RedditCommentData[];
}

/**
 * Count total comments in a comment tree recursively
 */
export function countComments(comments: RedditCommentData[]): number {
  let count = 0;
  for (const comment of comments) {
    count += 1 + countComments(comment.replies || []);
  }
  return count;
}

/**
 * Extract text content from post and comments for search/AI processing
 */
export function extractTextContent(data: RedditExtractedData): string {
  const textParts: string[] = [];

  // Add post title and content
  if (data.mainPost.title) {
    textParts.push(`Title: ${data.mainPost.title}`);
  }

  if (data.mainPost.selftext) {
    textParts.push(`Post: ${data.mainPost.selftext}`);
  }

  // Add comments
  const commentTexts = extractCommentTexts(data.comments);
  if (commentTexts.length > 0) {
    textParts.push("Comments:");
    textParts.push(...commentTexts);
  }

  return textParts.join("\n\n");
}

/**
 * Recursively extract text from comment tree
 */
function extractCommentTexts(comments: RedditCommentData[]): string[] {
  const texts: string[] = [];

  for (const comment of comments) {
    if (comment.body && comment.body.trim()) {
      texts.push(`${comment.author}: ${comment.body}`);
    }

    // Add reply texts
    const replyTexts = extractCommentTexts(comment.replies || []);
    texts.push(...replyTexts);
  }

  return texts;
}

/**
 * Get a summary description of the Reddit post
 */
export function getPostSummary(data: RedditExtractedData): string {
  const post = data.mainPost;
  let summary = "";

  if (post.selftext) {
    // For text posts, use the beginning of the selftext
    summary = post.selftext.substring(0, 200);
    if (post.selftext.length > 200) {
      summary += "...";
    }
  } else if (post.media && post.media.type !== "none") {
    // For media posts, describe the media type
    switch (post.media.type) {
      case "image":
        summary = "Image post";
        break;
      case "reddit_video":
        summary = "Video post";
        break;
      case "gallery":
        summary = `Gallery post with ${post.media.items?.length || 0} images`;
        break;
      case "link":
        summary = `Link to ${post.media.domain}`;
        break;
      case "embed":
        summary = `Embedded content from ${post.media.provider}`;
        break;
      default:
        summary = "Media post";
    }
  } else if (post.url && post.url !== post.permalink) {
    // For link posts
    summary = `Link to ${post.domain}`;
  } else {
    // Fallback to title
    summary = post.title.substring(0, 200);
    if (post.title.length > 200) {
      summary += "...";
    }
  }

  return summary;
}

/**
 * Generate a formatted title for the Reddit post
 */
export function getFormattedTitle(data: RedditExtractedData): string {
  const post = data.mainPost;
  return `${post.title} - r/${post.subreddit}`;
}

/**
 * Extract Reddit-specific metadata from raw post and subreddit data
 */
export function extractRedditMetadata(
  postData: any,
  subredditData?: any,
): RedditMetadata {
  // Determine post type based on media
  let postType: "text" | "image" | "video" | "gallery" | "link" = "text";
  if (postData.media?.type) {
    switch (postData.media.type) {
      case "image":
        postType = "image";
        break;
      case "reddit_video":
        postType = "video";
        break;
      case "gallery":
        postType = "gallery";
        break;
      case "link":
        postType = "link";
        break;
      default:
        postType = postData.is_self ? "text" : "link";
    }
  } else if (!postData.is_self && postData.url) {
    postType = "link";
  }

  // Calculate age category
  const postAge = Date.now() / 1000 - postData.created_utc;
  let ageCategory: "fresh" | "recent" | "older" = "older";
  if (postAge < 3600) {
    // < 1 hour
    ageCategory = "fresh";
  } else if (postAge < 86400) {
    // < 24 hours
    ageCategory = "recent";
  }

  // Extract external domain for link posts
  let externalDomain: string | undefined;
  if (
    postType === "link" &&
    postData.domain &&
    postData.domain !== "self." + postData.subreddit
  ) {
    externalDomain = postData.domain;
  }

  // Calculate text length
  const textLength = (postData.selftext || "").length;

  // Check if post has media
  const hasMedia = postData.media && postData.media.type !== "none";

  return {
    // Post Engagement & Stats
    score: typeof postData.score === "number" ? postData.score : 0,
    upvote_ratio:
      typeof postData.upvote_ratio === "number" ? postData.upvote_ratio : 0.5,
    num_comments:
      typeof postData.num_comments === "number" ? postData.num_comments : 0,
    view_count: postData.view_count || undefined,

    // Post Type Classification
    post_type: postType,

    // Subreddit Context
    subreddit_name: postData.subreddit || "",
    subreddit_subscribers: subredditData?.subscribers || undefined,
    subreddit_description:
      subredditData?.public_description || subredditData?.title || undefined,

    // Temporal Data
    created_utc:
      typeof postData.created_utc === "number" ? postData.created_utc : 0,
    edited_utc:
      postData.edited && typeof postData.edited === "number"
        ? postData.edited
        : undefined,
    age_category: ageCategory,

    // Content Analysis
    external_domain: externalDomain,
    text_length: textLength,
    has_media: Boolean(hasMedia),
  };
}
