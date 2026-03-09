/**
 * Common domain types and enums shared across the Eclaire monorepo
 */

export const USER_TYPES = ["user", "assistant", "worker"] as const;
export type UserType = (typeof USER_TYPES)[number];

export const REVIEW_STATUSES = ["pending", "accepted", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const FLAG_COLORS = [
  "red",
  "yellow",
  "orange",
  "green",
  "blue",
] as const;
export type FlagColor = (typeof FLAG_COLORS)[number];

export const ASSET_TYPES = [
  "photos",
  "documents",
  "bookmarks",
  "notes",
  "tasks",
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const JOB_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "retry_pending",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const TASK_STATUSES = [
  "backlog",
  "not-started",
  "in-progress",
  "completed",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = [0, 1, 2, 3, 4] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  0: "None",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

export const MESSAGE_ROLES = ["user", "assistant"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const CHANNEL_PLATFORMS = [
  "telegram",
  "slack",
  "whatsapp",
  "email",
  "discord",
] as const;
export type ChannelPlatform = (typeof CHANNEL_PLATFORMS)[number];

export const CHANNEL_CAPABILITIES = [
  "notification",
  "chat",
  "bidirectional",
] as const;
export type ChannelCapability = (typeof CHANNEL_CAPABILITIES)[number];

export const FEEDBACK_SENTIMENTS = ["positive", "negative"] as const;
export type FeedbackSentiment = (typeof FEEDBACK_SENTIMENTS)[number];

export const HISTORY_ACTIONS = [
  "create",
  "update",
  "delete",
  "api_call",
  "ai_prompt_image_response",
  "ai_prompt_text_response",
  "ai_prompt_error",
  "api_content_upload",
  "api_error_general",
  "user.login",
  "user.logout",
  "conversation_created",
  "conversation_updated",
  "conversation_deleted",
  "ai_prompt_streaming_response",
  "ai_prompt_streaming_error",
  "api_streaming_content_upload",
  "api_error_streaming_general",
] as const;
export type HistoryAction = (typeof HISTORY_ACTIONS)[number];

export const HISTORY_ITEM_TYPES = [
  "task",
  "note",
  "bookmark",
  "document",
  "photo",
  "api",
  "prompt",
  "api_error",
  "content_submission",
  "user_session",
  "conversation",
  "task_comment",
] as const;
export type HistoryItemType = (typeof HISTORY_ITEM_TYPES)[number];

export const HISTORY_ACTORS = ["user", "assistant", "system"] as const;
export type HistoryActor = (typeof HISTORY_ACTORS)[number];

/**
 * Domain model interfaces - these represent the data structures
 * independent of database implementation
 */

export interface UserInsert {
  id: string;
  userType: UserType;
  displayName?: string;
  fullName?: string;
  email: string;
  emailVerified?: boolean;
  avatarStorageId?: string;
  avatarColor?: string;
  bio?: string;
  timezone?: string;
  city?: string;
  country?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BookmarkInsert {
  id: string;
  userId: string;
  originalUrl: string;
  normalizedUrl?: string;
  title?: string;
  description?: string;
  author?: string;
  lang?: string;
  dueDate?: string;
  pageLastUpdatedAt?: string;
  contentType?: string;
  etag?: string;
  lastModified?: string;
  rawMetadata?: Record<string, unknown>;
  userAgent?: string;
  faviconStorageId?: string;
  thumbnailStorageId?: string;
  screenshotDesktopStorageId?: string;
  screenshotMobileStorageId?: string;
  screenshotFullPageStorageId?: string;
  pdfStorageId?: string;
  readableHtmlStorageId?: string;
  extractedMdStorageId?: string;
  extractedTxtStorageId?: string;
  rawHtmlStorageId?: string;
  readmeStorageId?: string;
  extractedText?: string;
  processingEnabled?: boolean;
  reviewStatus?: ReviewStatus;
  flagColor?: FlagColor;
  isPinned?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskInsert {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  dueDate?: string;
  assignedToId?: string;
  priority?: number;
  processingEnabled?: boolean;
  reviewStatus?: ReviewStatus;
  flagColor?: FlagColor;
  isPinned?: boolean;
  sortOrder?: number;
  parentId?: string;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DocumentInsert {
  id: string;
  userId: string;
  title: string;
  description?: string;
  originalFilename?: string;
  dueDate?: string;
  storageId?: string;
  mimeType?: string;
  fileSize?: number;
  thumbnailStorageId?: string;
  screenshotStorageId?: string;
  pdfStorageId?: string;
  rawMetadata?: Record<string, unknown>;
  originalMimeType?: string;
  userAgent?: string;
  processingEnabled?: boolean;
  extractedMdStorageId?: string;
  extractedTxtStorageId?: string;
  extractedText?: string;
  reviewStatus?: ReviewStatus;
  flagColor?: FlagColor;
  isPinned?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PhotoInsert {
  id: string;
  userId: string;
  title: string;
  description?: string;
  originalFilename?: string;
  storageId: string;
  mimeType?: string;
  fileSize?: number;
  deviceId?: string;
  dueDate?: string;
  dateTaken?: string;
  cameraMake?: string;
  cameraModel?: string;
  lensModel?: string;
  iso?: number;
  fNumber?: string;
  exposureTime?: string;
  orientation?: number;
  imageWidth?: number;
  imageHeight?: number;
  latitude?: string;
  longitude?: string;
  altitude?: string;
  locationCity?: string;
  locationCountryIso2?: string;
  locationCountryName?: string;
  photoType?: string;
  ocrText?: string;
  dominantColors?: Record<string, unknown>;
  thumbnailStorageId?: string;
  screenshotStorageId?: string;
  convertedJpgStorageId?: string;
  rawMetadata?: Record<string, unknown>;
  originalMimeType?: string;
  userAgent?: string;
  processingEnabled?: boolean;
  reviewStatus?: ReviewStatus;
  flagColor?: FlagColor;
  isPinned?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface NoteInsert {
  id: string;
  userId: string;
  title: string;
  content?: string;
  description?: string;
  rawMetadata?: Record<string, unknown>;
  originalMimeType?: string;
  userAgent?: string;
  processingEnabled?: boolean;
  dueDate?: string;
  reviewStatus?: ReviewStatus;
  flagColor?: FlagColor;
  isPinned?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AssetProcessingJobInsert {
  id: string;
  assetType: AssetType;
  assetId: string;
  userId: string;
  status?: JobStatus;
  stages?: Record<string, unknown>;
  currentStage?: string;
  overallProgress?: number;
  errorMessage?: string;
  errorDetails?: Record<string, unknown>;
  retryCount?: number;
  maxRetries?: number;
  nextRetryAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  jobData?: Record<string, unknown>;
  lockedBy?: string;
  lockedAt?: string;
  expiresAt?: string;
  scheduledFor?: string;
  priority?: number;
}

export interface TagInsert {
  id: string;
  name: string;
  userId: string;
}

export interface HistoryInsert {
  id: string;
  action: HistoryAction;
  itemType: HistoryItemType;
  itemId: string;
  itemName?: string;
  beforeData?: Record<string, unknown>;
  afterData?: Record<string, unknown>;
  actor: HistoryActor;
  metadata?: Record<string, unknown>;
  timestamp?: string;
  userId?: string;
}
