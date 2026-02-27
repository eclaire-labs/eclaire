import type { Bookmark as ApiBookmark } from "@eclaire/api-types";

// Extend the API Bookmark type with fields used by the frontend
export interface Bookmark extends ApiBookmark {
  screenshotUrl: string | null;
  readableUrl: string | null;
  readmeUrl: string | null;
  enabled: boolean;
  rawMetadata?: RawMetadata;
}

// Frontend-only metadata display types

export interface TwitterMetadata {
  replies: number;
  retweets: number;
  likes: number;
  bookmarks: number;
  views: number;
  author_id: string;
  author_name: string;
  author_screen_name: string;
  author_verified: boolean;
  author_profile_image: string;
  tweet_type: "text" | "image" | "video" | "link" | "thread";
  has_media: boolean;
  media_count: number;
  has_links: boolean;
  link_count: number;
  created_at: string;
  age_category: "fresh" | "recent" | "viral";
  is_thread: boolean;
  reply_count_actual: number;
  has_author_replies: boolean;
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
