import { createChildLogger } from "../../lib/logger.js";

const logger = createChildLogger("twitter-extractor");

// --- Type Definitions ---

export interface TwitterAuthor {
  id: string;
  name: string;
  username: string;
  profileImageUrl: string;
  verifiedType: "blue" | "business" | "government" | null;
}

export interface TwitterStats {
  replies: number;
  retweets: number;
  likes: number;
  bookmarks: number;
  impressions: number;
  quotes: number;
}

export interface TwitterMedia {
  type: "photo" | "video" | "animated_gif";
  url: string;
  altText: string;
  width: number;
  height: number;
  previewImageUrl?: string;
  variants?: Array<{
    bitrate?: number;
    url: string;
    content_type: string;
  }>;
}

export interface TwitterLink {
  url: string;
  expandedUrl: string;
  displayUrl: string;
  start: number;
  end: number;
}

export interface TwitterTweet {
  id: string;
  text: string;
  createdAt: string;
  lang: string;
  conversationId?: string;
  author: TwitterAuthor;
  stats: TwitterStats;
  media: TwitterMedia[];
  links: TwitterLink[];
  referencedTweets?: Array<{ type: string; id: string }>;
}

export interface TwitterMetadata {
  // Engagement stats
  replies: number;
  retweets: number;
  likes: number;
  bookmarks: number;
  impressions: number;
  quotes: number;

  // Author info
  author_id: string;
  author_name: string;
  author_username: string;
  author_verified_type: string | null;
  author_profile_image: string;

  // Content classification
  tweet_type: "tweet" | "reply" | "retweet" | "quote";
  has_media: boolean;
  media_count: number;
  media_types: string[];
  has_links: boolean;
  link_count: number;

  // Temporal
  created_at: string;
  age_category: "fresh" | "recent" | "older";
  lang: string;

  // Content analysis
  text_length: number;
}

export interface TwitterExtractedData {
  mainTweet: TwitterTweet;
  twitterMetadata: TwitterMetadata;
}

// --- Extraction Functions ---

/**
 * Resolve an author_id to a full user object from the includes.users array.
 */
// biome-ignore lint/suspicious/noExplicitAny: X API v2 user object structure
function resolveAuthor(authorId: string, includes: any): TwitterAuthor {
  const users = includes?.users || [];
  const user = users.find(
    // biome-ignore lint/suspicious/noExplicitAny: X API v2 user object
    (u: any) => u.id === authorId,
  );

  if (!user) {
    return {
      id: authorId,
      name: "Unknown",
      username: "unknown",
      profileImageUrl: "",
      verifiedType: null,
    };
  }

  return {
    id: user.id,
    name: user.name || "Unknown",
    username: user.username || "unknown",
    profileImageUrl: (user.profile_image_url || "").replace(
      "_normal",
      "_400x400",
    ),
    verifiedType: user.verified_type || null,
  };
}

/**
 * Resolve media_keys to full media objects from the includes.media array.
 */
// biome-ignore lint/suspicious/noExplicitAny: X API v2 includes structure
function resolveMedia(attachments: any, includes: any): TwitterMedia[] {
  const mediaKeys = attachments?.media_keys || [];
  if (mediaKeys.length === 0) return [];

  const mediaMap = new Map<string, TwitterMedia>();
  for (const m of includes?.media || []) {
    mediaMap.set(m.media_key, {
      type: m.type || "photo",
      url: m.url || m.preview_image_url || "",
      altText: m.alt_text || "",
      width: m.width || 0,
      height: m.height || 0,
      previewImageUrl: m.preview_image_url,
      variants: m.variants,
    });
  }

  return mediaKeys
    .map((key: string) => mediaMap.get(key))
    .filter(Boolean) as TwitterMedia[];
}

/**
 * Extract URL entities from the tweet data.
 */
// biome-ignore lint/suspicious/noExplicitAny: X API v2 entities structure
function extractLinks(entities: any): TwitterLink[] {
  const urls = entities?.urls || [];
  return (
    urls
      // biome-ignore lint/suspicious/noExplicitAny: X API v2 URL entity
      .filter((u: any) => !u.expanded_url?.includes("pic.x.com"))
      .map(
        // biome-ignore lint/suspicious/noExplicitAny: X API v2 URL entity
        (u: any) => ({
          url: u.url,
          expandedUrl: u.expanded_url || u.url,
          displayUrl: u.display_url || u.expanded_url || u.url,
          start: u.start || 0,
          end: u.end || 0,
        }),
      )
  );
}

/**
 * Determine tweet type based on referenced_tweets.
 */
function determineTweetType(
  referencedTweets?: Array<{ type: string }>,
): "tweet" | "reply" | "retweet" | "quote" {
  if (!referencedTweets || referencedTweets.length === 0) return "tweet";

  for (const ref of referencedTweets) {
    if (ref.type === "retweeted") return "retweet";
    if (ref.type === "quoted") return "quote";
    if (ref.type === "replied_to") return "reply";
  }

  return "tweet";
}

/**
 * Calculate age category based on tweet creation time.
 */
function getAgeCategory(createdAt: string): "fresh" | "recent" | "older" {
  const tweetAge = Date.now() - new Date(createdAt).getTime();
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * oneHour;

  if (tweetAge < oneHour) return "fresh";
  if (tweetAge < oneDay) return "recent";
  return "older";
}

/**
 * Extract structured Twitter data from a raw X API v2 response.
 *
 * The v2 response has the shape:
 * {
 *   data: { id, text, author_id, public_metrics, entities, attachments, ... },
 *   includes: { users: [...], media: [...] }
 * }
 */
// biome-ignore lint/suspicious/noExplicitAny: raw X API v2 response
export function extractTwitterData(rawResponse: any): TwitterExtractedData {
  const tweetData = rawResponse.data;
  const includes = rawResponse.includes || {};

  if (!tweetData) {
    throw new Error("No tweet data in API response");
  }

  const author = resolveAuthor(tweetData.author_id, includes);
  const media = resolveMedia(tweetData.attachments, includes);
  const links = extractLinks(tweetData.entities);
  const publicMetrics = tweetData.public_metrics || {};
  const referencedTweets = tweetData.referenced_tweets || [];

  const mainTweet: TwitterTweet = {
    id: tweetData.id,
    text: tweetData.text || "",
    createdAt: tweetData.created_at || new Date().toISOString(),
    lang: tweetData.lang || "en",
    conversationId: tweetData.conversation_id,
    author,
    stats: {
      replies: publicMetrics.reply_count || 0,
      retweets: publicMetrics.retweet_count || 0,
      likes: publicMetrics.like_count || 0,
      bookmarks: publicMetrics.bookmark_count || 0,
      impressions: publicMetrics.impression_count || 0,
      quotes: publicMetrics.quote_count || 0,
    },
    media,
    links,
    referencedTweets,
  };

  const tweetType = determineTweetType(referencedTweets);
  const mediaTypes = [...new Set(media.map((m) => m.type))];

  const twitterMetadata: TwitterMetadata = {
    replies: mainTweet.stats.replies,
    retweets: mainTweet.stats.retweets,
    likes: mainTweet.stats.likes,
    bookmarks: mainTweet.stats.bookmarks,
    impressions: mainTweet.stats.impressions,
    quotes: mainTweet.stats.quotes,

    author_id: author.id,
    author_name: author.name,
    author_username: author.username,
    author_verified_type: author.verifiedType,
    author_profile_image: author.profileImageUrl,

    tweet_type: tweetType,
    has_media: media.length > 0,
    media_count: media.length,
    media_types: mediaTypes,
    has_links: links.length > 0,
    link_count: links.length,

    created_at: mainTweet.createdAt,
    age_category: getAgeCategory(mainTweet.createdAt),
    lang: mainTweet.lang,

    text_length: mainTweet.text.length,
  };

  logger.info(
    {
      tweetId: mainTweet.id,
      author: author.username,
      tweetType,
      mediaCount: media.length,
    },
    "Extracted Twitter data from v2 response",
  );

  return { mainTweet, twitterMetadata };
}
