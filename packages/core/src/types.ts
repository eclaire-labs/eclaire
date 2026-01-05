/**
 * Common schema types and enums shared across all database dialects
 */

export type UserType = "user" | "assistant" | "worker";
export type ReviewStatus = "pending" | "accepted" | "rejected";
export type FlagColor = "red" | "yellow" | "orange" | "green" | "blue";
export type AssetType =
  | "photos"
  | "documents"
  | "bookmarks"
  | "notes"
  | "tasks";
export type JobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "retry_pending";
export type TaskStatus = "not-started" | "in-progress" | "completed";
export type MessageRole = "user" | "assistant";
export type ChannelPlatform = "telegram" | "slack" | "whatsapp" | "email";
export type ChannelCapability = "notification" | "chat" | "bidirectional";
export type FeedbackSentiment = "positive" | "negative";

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
  enabled?: boolean;
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
  status?: string;
  dueDate?: string;
  assignedToId?: string;
  enabled?: boolean;
  reviewStatus?: ReviewStatus;
  flagColor?: FlagColor;
  isPinned?: boolean;
  isRecurring?: boolean;
  cronExpression?: string;
  recurrenceEndDate?: string;
  recurrenceLimit?: number;
  runImmediately?: boolean;
  nextRunAt?: string;
  lastRunAt?: string;
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
  enabled?: boolean;
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
  enabled?: boolean;
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
  enabled?: boolean;
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
  action: string;
  itemType: string;
  itemId: string;
  itemName?: string;
  beforeData?: Record<string, unknown>;
  afterData?: Record<string, unknown>;
  actor: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
  userId?: string;
}
