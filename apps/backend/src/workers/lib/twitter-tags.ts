import { createChildLogger } from "../../lib/logger.js";
import type { TwitterMetadata } from "./twitter-extractor.js";

const logger = createChildLogger("twitter-tags");

/**
 * Get engagement level based on likes, retweets, and impressions.
 */
function getEngagementLevel(
  metadata: TwitterMetadata,
): "low" | "moderate" | "high" | "viral" {
  const { likes, retweets, impressions } = metadata;

  if (likes >= 10_000 || retweets >= 1_000 || impressions >= 1_000_000)
    return "viral";
  if (likes >= 1_000 || retweets >= 100 || impressions >= 100_000)
    return "high";
  if (likes >= 50 || retweets >= 10 || impressions >= 10_000) return "moderate";
  return "low";
}

/**
 * Generate Twitter/X-specific tags based on tweet metadata.
 */
export function generateTwitterTags(metadata: TwitterMetadata): string[] {
  const tags: string[] = [];

  // Author tag
  tags.push(`@${metadata.author_username}`);

  // Verification status
  if (metadata.author_verified_type) {
    tags.push("verified-author");
    tags.push(`${metadata.author_verified_type}-verified`);
  }

  // Tweet type tags
  switch (metadata.tweet_type) {
    case "reply":
      tags.push("reply");
      break;
    case "quote":
      tags.push("quote-tweet");
      break;
    case "retweet":
      tags.push("retweet");
      break;
    default:
      tags.push("tweet");
      break;
  }

  // Media tags
  if (metadata.has_media) {
    tags.push("has-media");
    for (const type of metadata.media_types) {
      if (type === "photo") tags.push("image-tweet");
      else if (type === "video") tags.push("video-tweet");
      else if (type === "animated_gif") tags.push("gif-tweet");
    }
    if (metadata.media_count > 1) {
      tags.push("multiple-media");
    }
  }

  // Link tags
  if (metadata.has_links) {
    tags.push("has-links");
    if (metadata.link_count > 1) {
      tags.push("multiple-links");
    }
  }

  // Engagement level
  const engagementLevel = getEngagementLevel(metadata);
  switch (engagementLevel) {
    case "viral":
      tags.push("viral-tweet");
      tags.push("high-engagement");
      break;
    case "high":
      tags.push("high-engagement");
      break;
    case "moderate":
      tags.push("moderate-engagement");
      break;
  }

  // Engagement milestones
  if (metadata.likes >= 100_000) tags.push("100k-likes");
  else if (metadata.likes >= 10_000) tags.push("10k-likes");
  else if (metadata.likes >= 1_000) tags.push("1k-likes");

  if (metadata.retweets >= 10_000) tags.push("10k-retweets");
  else if (metadata.retweets >= 1_000) tags.push("1k-retweets");
  else if (metadata.retweets >= 100) tags.push("100-retweets");

  if (metadata.impressions >= 1_000_000) tags.push("1m-impressions");
  else if (metadata.impressions >= 100_000) tags.push("100k-impressions");

  // Age-based tags
  switch (metadata.age_category) {
    case "fresh":
      tags.push("fresh");
      break;
    case "recent":
      tags.push("recent");
      break;
  }

  // Content length
  if (metadata.text_length >= 240) {
    tags.push("long-tweet");
  } else if (metadata.text_length <= 50 && metadata.text_length > 0) {
    tags.push("short-tweet");
  }

  // Deduplicate
  const uniqueTags = [...new Set(tags)];

  logger.debug(
    {
      author: metadata.author_username,
      tweetType: metadata.tweet_type,
      likes: metadata.likes,
      tagCount: uniqueTags.length,
    },
    "Generated Twitter tags",
  );

  return uniqueTags;
}
