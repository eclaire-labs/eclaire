export interface TwitterMetadata {
  // Tweet Engagement & Stats
  replies: number;
  retweets: number;
  likes: number;
  bookmarks: number;
  views: number;

  // Author Information
  author_id: string;
  author_name: string;
  author_screen_name: string;
  author_verified: boolean;
  author_profile_image: string;

  // Tweet Content Classification
  tweet_type: "text" | "image" | "video" | "link" | "thread";
  has_media: boolean;
  media_count: number;
  has_links: boolean;
  link_count: number;

  // Temporal Data
  created_at: string;
  age_category: "fresh" | "recent" | "viral";

  // Thread Context
  is_thread: boolean;
  reply_count_actual: number;
  has_author_replies: boolean;

  // Content Analysis
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

export interface RawMetadata {
  twitter?: TwitterMetadata;
  github?: GitHubMetadata;
  reddit?: RedditMetadata;
  // biome-ignore lint/suspicious/noExplicitAny: extensible metadata allows arbitrary platform-specific fields
  [key: string]: any;
}

export interface Bookmark {
  id: string;
  title: string | null;
  description: string | null;
  url: string;
  normalizedUrl: string | null;
  author: string | null;
  lang: string | null;
  createdAt: string;
  updatedAt: string;
  dueDate: string | null;
  pageLastUpdatedAt: string | null;
  contentType: string | null;
  etag: string | null;
  lastModified: string | null;
  tags: string[];
  processingStatus: "pending" | "processing" | "completed" | "failed" | null;
  reviewStatus: "pending" | "accepted" | "rejected";
  flagColor: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned: boolean;
  enabled: boolean;
  faviconUrl: string | null;
  thumbnailUrl: string | null; // Lower resolution thumbnail 800x600 (85% quality)
  screenshotUrl: string | null; // Higher resolution screenshot 1920x1440 (90% quality)
  screenshotMobileUrl: string | null;
  screenshotFullPageUrl: string | null;
  pdfUrl: string | null;
  contentUrl: string | null;
  readableUrl: string | null;
  readmeUrl: string | null;
  extractedText: string | null;
  rawMetadata?: RawMetadata;
}
