import type { Bookmark as ApiBookmark } from "@eclaire/api-types";

// Extend the API Bookmark type with fields used by the frontend
export interface Bookmark extends ApiBookmark {
  rawMetadata?: RawMetadata;
}

// Frontend-only metadata display types

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

export interface GitHubMetadata {
  owner: string;
  repo: string;
  stars: number;
  forks: number;
  watchers: number;
  language: string;
  topics: string[];
  license: string;
  lastCommitDate: string;
  latestRelease?: {
    version: string;
    date: string;
  };
  // biome-ignore lint/suspicious/noExplicitAny: GitHub API response shape varies by endpoint
  repositoryData: any;
}

export interface RedditMetadata {
  score: number;
  upvote_ratio: number;
  num_comments: number;
  view_count?: number;
  post_type: "text" | "image" | "video" | "gallery" | "link";
  subreddit_name: string;
  subreddit_subscribers?: number;
  subreddit_description?: string;
  created_utc: number;
  edited_utc?: number;
  age_category: "fresh" | "recent" | "older";
  external_domain?: string;
  text_length: number;
  has_media: boolean;
}

export interface RawMetadata {
  twitter?: TwitterMetadata;
  github?: GitHubMetadata;
  reddit?: RedditMetadata;
  // biome-ignore lint/suspicious/noExplicitAny: extensible metadata allows arbitrary platform-specific fields
  [key: string]: any;
}
