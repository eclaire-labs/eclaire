import { createChildLogger } from "../../lib/logger.js";
import type { RedditMetadata } from "./reddit-extractor.js";

const logger = createChildLogger("reddit-tags");

/**
 * Generate Reddit-specific tags based on post metadata
 */
export function generateRedditTags(metadata: RedditMetadata): string[] {
  const tags: string[] = [];

  // Subreddit tag
  if (metadata.subreddit_name) {
    tags.push(`r/${metadata.subreddit_name}`);
  }

  // Post type tags
  switch (metadata.post_type) {
    case "image":
      tags.push("image-post");
      break;
    case "video":
      tags.push("video-post");
      break;
    case "gallery":
      tags.push("gallery-post");
      break;
    case "link":
      tags.push("link-post");
      if (metadata.external_domain) {
        tags.push(`from-${metadata.external_domain}`);
      }
      break;
    case "text":
      tags.push("discussion");
      break;
  }

  // Engagement level tags based on score and comments
  if (metadata.score >= 1000) {
    tags.push("high-engagement");
  } else if (metadata.score >= 100) {
    tags.push("moderate-engagement");
  }

  if (metadata.num_comments >= 100) {
    tags.push("active-discussion");
  } else if (metadata.num_comments >= 20) {
    tags.push("discussion");
  }

  // Upvote ratio tags
  if (metadata.upvote_ratio >= 0.9) {
    tags.push("highly-upvoted");
  } else if (metadata.upvote_ratio <= 0.6) {
    tags.push("controversial");
  }

  // Age-based tags
  switch (metadata.age_category) {
    case "fresh":
      tags.push("fresh");
      break;
    case "recent":
      tags.push("recent");
      break;
    default:
      // Don't tag older posts
      break;
  }

  // Content length tags for text posts
  if (metadata.post_type === "text" && metadata.text_length > 0) {
    if (metadata.text_length >= 1000) {
      tags.push("long-form");
    } else if (metadata.text_length >= 300) {
      tags.push("medium-form");
    } else {
      tags.push("short-form");
    }
  }

  // Media presence
  if (metadata.has_media) {
    tags.push("has-media");
  }

  // Subreddit size-based tags
  if (metadata.subreddit_subscribers) {
    if (metadata.subreddit_subscribers >= 1000000) {
      tags.push("major-subreddit");
    } else if (metadata.subreddit_subscribers >= 100000) {
      tags.push("large-subreddit");
    } else if (metadata.subreddit_subscribers >= 10000) {
      tags.push("medium-subreddit");
    } else {
      tags.push("small-subreddit");
    }
  }

  // Popular external domains
  if (metadata.external_domain) {
    const popularDomains = [
      "youtube.com",
      "youtu.be",
      "github.com",
      "stackoverflow.com",
      "medium.com",
      "twitter.com",
      "x.com",
      "linkedin.com",
      "wikipedia.org",
      "arxiv.org",
      "news.ycombinator.com",
    ];

    if (
      popularDomains.some((domain) =>
        metadata.external_domain?.includes(domain),
      )
    ) {
      tags.push("popular-source");
    }
  }

  // Remove duplicates and return
  const uniqueTags = Array.from(new Set(tags));

  logger.debug(
    {
      subreddit: metadata.subreddit_name,
      postType: metadata.post_type,
      score: metadata.score,
      tags: uniqueTags,
    },
    "Generated Reddit tags",
  );

  return uniqueTags;
}

/**
 * Get engagement level description based on score and comments
 */
export function getEngagementLevel(
  metadata: RedditMetadata,
): "low" | "moderate" | "high" | "viral" {
  const score = metadata.score;
  const comments = metadata.num_comments;

  if (score >= 10000 || comments >= 500) {
    return "viral";
  } else if (score >= 1000 || comments >= 100) {
    return "high";
  } else if (score >= 100 || comments >= 20) {
    return "moderate";
  } else {
    return "low";
  }
}

/**
 * Get content category based on subreddit name and post type
 */
export function getContentCategory(metadata: RedditMetadata): string {
  const subreddit = metadata.subreddit_name.toLowerCase();

  // Tech/Programming subreddits
  const techSubreddits = [
    "programming",
    "javascript",
    "python",
    "webdev",
    "css",
    "html",
    "reactjs",
    "nodejs",
    "typescript",
    "php",
    "java",
    "cpp",
    "rust",
    "golang",
    "machinelearning",
    "datascience",
    "artificial",
    "coding",
  ];

  // News subreddits
  const newsSubreddits = [
    "news",
    "worldnews",
    "politics",
    "technology",
    "science",
    "futurology",
    "economics",
    "business",
  ];

  // Entertainment subreddits
  const entertainmentSubreddits = [
    "movies",
    "television",
    "music",
    "gaming",
    "books",
    "art",
    "pics",
    "videos",
    "funny",
    "memes",
  ];

  // Educational subreddits
  const educationalSubreddits = [
    "explainlikeimfive",
    "todayilearned",
    "askscience",
    "askhistorians",
    "learnprogramming",
    "educationalgifs",
    "documentaries",
  ];

  if (techSubreddits.some((tech) => subreddit.includes(tech))) {
    return "technology";
  } else if (newsSubreddits.some((news) => subreddit.includes(news))) {
    return "news";
  } else if (entertainmentSubreddits.some((ent) => subreddit.includes(ent))) {
    return "entertainment";
  } else if (educationalSubreddits.some((edu) => subreddit.includes(edu))) {
    return "educational";
  } else {
    return "general";
  }
}
