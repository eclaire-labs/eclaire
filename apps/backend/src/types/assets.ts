// Singular - for individual asset references, metadata, labels
export const ASSET_TYPE = {
  BOOKMARK: "bookmark",
  NOTE: "note",
  PHOTO: "photo",
  DOCUMENT: "document",
  TASK: "task",
} as const;

// Plural - for collections, routes, processing, database operations
export const ASSET_COLLECTION_TYPE = {
  BOOKMARKS: "bookmarks",
  NOTES: "notes",
  PHOTOS: "photos",
  DOCUMENTS: "documents",
  TASKS: "tasks",
} as const;

export type AssetType =
  (typeof ASSET_COLLECTION_TYPE)[keyof typeof ASSET_COLLECTION_TYPE]; // "bookmarks" | "notes" | etc
export type SingleAssetType = (typeof ASSET_TYPE)[keyof typeof ASSET_TYPE]; // "bookmark" | "note" | etc

export const ASSET_TYPE_LABELS = {
  [ASSET_TYPE.BOOKMARK]: "Bookmark",
  [ASSET_TYPE.DOCUMENT]: "Document",
  [ASSET_TYPE.NOTE]: "Note",
  [ASSET_TYPE.PHOTO]: "Photo",
  [ASSET_TYPE.TASK]: "Task",
} as const;

export const ASSET_COLLECTION_LABELS = {
  [ASSET_COLLECTION_TYPE.BOOKMARKS]: "Bookmarks",
  [ASSET_COLLECTION_TYPE.DOCUMENTS]: "Documents",
  [ASSET_COLLECTION_TYPE.NOTES]: "Notes",
  [ASSET_COLLECTION_TYPE.PHOTOS]: "Photos",
  [ASSET_COLLECTION_TYPE.TASKS]: "Tasks",
} as const;

export type ProcessingStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "retry_pending";

export const PROCESSING_STATUS_VALUES = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  RETRY_PENDING: "retry_pending",
} as const;

export const PROCESSING_STATUS_LABELS = {
  [PROCESSING_STATUS_VALUES.PENDING]: "Pending",
  [PROCESSING_STATUS_VALUES.PROCESSING]: "Processing",
  [PROCESSING_STATUS_VALUES.COMPLETED]: "Completed",
  [PROCESSING_STATUS_VALUES.FAILED]: "Failed",
  [PROCESSING_STATUS_VALUES.RETRY_PENDING]: "Retry Pending",
} as const;
