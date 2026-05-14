// Shared schemas and inferred types for the Eclaire API

export {
  type ActorKind,
  ActorKindSchema,
  type ActorSummary,
  ActorSummarySchema,
  DEFAULT_AGENT_ACTOR_ID,
} from "./actors.js";
export {
  ADMIN_ACCESS_INFO,
  ADMIN_ACCESS_SCOPES,
  type AdminAccessLevel,
  AdminAccessLevelSchema,
  DATA_ACCESS_INFO,
  DATA_ACCESS_SCOPES,
  type DataAccessLevel,
  DataAccessLevelSchema,
  derivePermissionLevels,
  resolvePermissionScopes,
} from "./api-key-permissions.js";
export {
  type ActorApiKey,
  ActorApiKeySchema,
  type ApiKeyScope,
  type ApiKeyScopeCatalogItem,
  ApiKeyScopeCatalogItemSchema,
  ApiKeyScopeSchema,
  type CreatedActorApiKey,
  CreatedActorApiKeySchema,
} from "./auth.js";
export {
  type Bookmark,
  BookmarkResponseSchema,
  type BookmarksListResponse,
  BookmarksListResponseSchema,
} from "./bookmarks.js";
export {
  PLATFORM_METADATA,
  type PlatformMetadata,
} from "./channels.js";
export {
  type FlagColor,
  flagColorSchema,
  paginatedResponseSchema,
  type ReviewStatus,
  reviewStatusSchema,
  type TaskStatus as TaskStatusType,
  taskStatusSchema,
} from "./common.js";

export {
  type Document,
  DocumentResponseSchema,
  type DocumentsListResponse,
  DocumentsListResponseSchema,
} from "./documents.js";
export {
  type Media,
  type MediaListResponse,
  MediaListResponseSchema,
  MediaResponseSchema,
} from "./media.js";
export {
  type Note,
  NoteResponseSchema,
  type NotesListResponse,
  NotesListResponseSchema,
} from "./notes.js";
export {
  type Photo,
  PhotoResponseSchema,
  type PhotosListResponse,
  PhotosListResponseSchema,
} from "./photos.js";
export {
  CommentUserSchema,
  type InboxResponse,
  InboxResponseSchema,
  type InboxTask,
  InboxTaskSchema,
  type Task,
  type TaskComment,
  TaskCommentSchema,
  type TaskOccurrence,
  TaskOccurrenceSchema,
  TaskResponseSchema,
  type TaskStatus,
  type TasksListResponse,
  TasksListResponseSchema,
} from "./tasks.js";
