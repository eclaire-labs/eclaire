// Shared schemas and inferred types for the Eclaire API

export {
  reviewStatusSchema,
  flagColorSchema,
  taskStatusSchema,
  paginatedResponseSchema,
  type ReviewStatus,
  type FlagColor,
  type TaskStatus as TaskStatusType,
} from "./common.js";

export {
  NoteResponseSchema,
  NotesListResponseSchema,
  type Note,
  type NotesListResponse,
} from "./notes.js";

export {
  BookmarkResponseSchema,
  BookmarksListResponseSchema,
  type Bookmark,
  type BookmarksListResponse,
} from "./bookmarks.js";

export {
  DocumentResponseSchema,
  DocumentsListResponseSchema,
  type Document,
  type DocumentsListResponse,
} from "./documents.js";

export {
  PhotoResponseSchema,
  PhotosListResponseSchema,
  type Photo,
  type PhotosListResponse,
} from "./photos.js";

export {
  TaskResponseSchema,
  TaskCommentSchema,
  CommentUserSchema,
  TasksListResponseSchema,
  type Task,
  type TaskComment,
  type TaskStatus,
  type TasksListResponse,
} from "./tasks.js";

export {
  PLATFORM_METADATA,
  type PlatformMetadata,
} from "./channels.js";
