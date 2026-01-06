import {
  generateApiKeyId,
  generateBookmarkId,
  generateChannelId,
  generateConversationId,
  generateDocumentId,
  generateFeedbackId,
  generateHistoryId,
  generateMessageId,
  generateNoteId,
  generatePhotoId,
  generateSecurityId,
  generateTagId,
  generateTaskCommentId,
  generateTaskId,
  generateUserId,
} from "@eclaire/core/id";
import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Type definitions for JSON fields
type RawMetadata = Record<string, unknown>;
type ErrorDetails = Record<string, unknown>;
type StageInfo = {
  name: string;
  status: string;
  progress?: number;
  startedAt?: number;
  completedAt?: number;
};
type DominantColors = string[];
type JobData = Record<string, unknown>;
type MessageMetadata = Record<string, unknown>;
type ChannelConfig = Record<string, unknown>;
type HistoryBeforeData = Record<string, unknown>;
type HistoryAfterData = Record<string, unknown>;
type HistoryMetadata = Record<string, unknown>;

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateUserId()),
  userType: text("user_type", {
    enum: ["user", "assistant", "worker"],
  }).notNull(),
  displayName: text("display_name"),
  fullName: text("full_name"),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  avatarStorageId: text("avatar_storage_id"),
  avatarColor: text("avatar_color"),
  bio: text("bio"),
  timezone: text("time_zone"),
  city: text("city"),
  country: text("country"),

  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateSecurityId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    userIdx: index("sessions_user_id_idx").on(table.userId),
  }),
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateSecurityId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    idToken: text("id_token"),
    passwordHash: text("password_hash"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
  },
  (table) => ({
    providerAccountIdx: unique().on(table.providerId, table.accountId),
    userIdx: index("accounts_user_id_idx").on(table.userId),
  }),
);

export const verifications = sqliteTable("verifications", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateSecurityId()),
  identifier: text("identifier").notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateApiKeyId()),
    keyId: text("key_id").notNull().unique(),
    keyHash: text("key_hash").notNull(),
    hashVersion: integer("hash_version").notNull().default(1),
    keySuffix: text("key_suffix").notNull(),
    name: text("name").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  },
  (table) => ({
    userIdx: index("api_keys_user_id_idx").on(table.userId),
  }),
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateTaskId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("not-started"),
    dueDate: integer("due_date", { mode: "timestamp_ms" }),
    assignedToId: text("assigned_to_id").references(() => users.id, {
      onDelete: "set null",
    }),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    reviewStatus: text("review_status", {
      enum: ["pending", "accepted", "rejected"],
    }),
    flagColor: text("flag_color", {
      enum: ["red", "yellow", "orange", "green", "blue"],
    }),
    isPinned: integer("is_pinned", { mode: "boolean" })
      .notNull()
      .default(false),
    // Note: Recurrence data (isRecurring, cronExpression, recurrenceEndDate, recurrenceLimit)
    // is now stored in queue_schedules table and fetched via scheduler.get()
    lastExecutedAt: integer("last_executed_at", { mode: "timestamp_ms" }), // When task was last executed (for display)
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
  },
  (table) => ({
    userIdx: index("tasks_user_id_idx").on(table.userId),
    statusIdx: index("tasks_status_idx").on(table.status),
    dueDateIdx: index("tasks_due_date_idx").on(table.dueDate),
    isPinnedIdx: index("tasks_is_pinned_idx").on(table.isPinned),
    completedAtIdx: index("tasks_completed_at_idx").on(table.completedAt),
  }),
);

export const taskComments = sqliteTable(
  "task_comments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateTaskCommentId()),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
  },
  (table) => ({
    taskIdx: index("task_comments_task_id_idx").on(table.taskId),
    userIdx: index("task_comments_user_id_idx").on(table.userId),
    createdAtIdx: index("task_comments_created_at_idx").on(table.createdAt),
  }),
);

export const bookmarks = sqliteTable(
  "bookmarks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateBookmarkId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    originalUrl: text("original_url").notNull(),
    normalizedUrl: text("normalized_url"),

    title: text("title"),
    description: text("description"),
    author: text("author"),
    lang: text("lang"),

    dueDate: integer("due_date", { mode: "timestamp_ms" }),
    pageLastUpdatedAt: integer("page_last_updated_at", {
      mode: "timestamp_ms",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),

    contentType: text("content_type"),
    etag: text("etag"),
    lastModified: text("last_modified"),

    rawMetadata: text("raw_metadata", { mode: "json" }).$type<RawMetadata>(),
    userAgent: text("user_agent"),

    faviconStorageId: text("favicon_storage_id"),
    thumbnailStorageId: text("thumbnail_storage_id"),
    screenshotDesktopStorageId: text("screenshot_desktop_storage_id"),
    screenshotMobileStorageId: text("screenshot_mobile_storage_id"),
    screenshotFullPageStorageId: text("screenshot_full_page_storage_id"),
    pdfStorageId: text("pdf_storage_id"),
    readableHtmlStorageId: text("readable_html_storage_id"),
    extractedMdStorageId: text("extracted_md_storage_id"),
    extractedTxtStorageId: text("extracted_txt_storage_id"),
    rawHtmlStorageId: text("raw_html_storage_id"),
    readmeStorageId: text("readme_storage_id"),

    extractedText: text("extracted_text"),

    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),

    reviewStatus: text("review_status", {
      enum: ["pending", "accepted", "rejected"],
    }),
    flagColor: text("flag_color", {
      enum: ["red", "yellow", "orange", "green", "blue"],
    }),
    isPinned: integer("is_pinned", { mode: "boolean" }).default(false),
  },
  (table) => ({
    userIdx: index("bookmarks_user_id_idx").on(table.userId),
    isPinnedIdx: index("bookmarks_is_pinned_idx").on(table.isPinned),
    userUrlIdx: index("bookmarks_user_id_normalized_url_idx").on(
      table.userId,
      table.normalizedUrl,
    ),
  }),
);

export const documents = sqliteTable(
  "documents",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateDocumentId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    originalFilename: text("original_filename"),
    dueDate: integer("due_date", { mode: "timestamp_ms" }),
    storageId: text("storage_id"),
    mimeType: text("mime_type"),
    fileSize: integer("file_size"),
    thumbnailStorageId: text("thumbnail_storage_id"),
    screenshotStorageId: text("screenshot_storage_id"),
    pdfStorageId: text("pdf_storage_id"),
    rawMetadata: text("raw_metadata", { mode: "json" }).$type<RawMetadata>(),
    originalMimeType: text("original_mime_type"),
    userAgent: text("user_agent"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    extractedMdStorageId: text("extracted_md_storage_id"),
    extractedTxtStorageId: text("extracted_txt_storage_id"),

    extractedText: text("extracted_text"),

    reviewStatus: text("review_status", {
      enum: ["pending", "accepted", "rejected"],
    }),
    flagColor: text("flag_color", {
      enum: ["red", "yellow", "orange", "green", "blue"],
    }),
    isPinned: integer("is_pinned", { mode: "boolean" }).default(false),

    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
  },
  (table) => ({
    userIdx: index("documents_user_id_idx").on(table.userId),
    isPinnedIdx: index("documents_is_pinned_idx").on(table.isPinned),
  }),
);

export const photos = sqliteTable(
  "photos",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generatePhotoId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    originalFilename: text("original_filename"),
    storageId: text("storage_id").notNull(),
    mimeType: text("mime_type"),
    fileSize: integer("file_size"),
    deviceId: text("device_id"),
    dueDate: integer("due_date", { mode: "timestamp_ms" }),
    dateTaken: integer("date_taken", { mode: "timestamp_ms" }),
    cameraMake: text("camera_make"),
    cameraModel: text("camera_model"),
    lensModel: text("lens_model"),
    iso: integer("iso"),
    fNumber: real("f_number"),
    exposureTime: real("exposure_time"),
    orientation: integer("orientation"),
    imageWidth: integer("image_width"),
    imageHeight: integer("image_height"),

    latitude: real("latitude"),
    longitude: real("longitude"),
    altitude: real("altitude"),
    locationCity: text("location_city"),
    locationCountryIso2: text("location_country_iso2"),
    locationCountryName: text("location_country_name"),

    photoType: text("photo_type"),
    ocrText: text("ocr_text"),
    dominantColors: text("dominant_colors", {
      mode: "json",
    }).$type<DominantColors>(),

    thumbnailStorageId: text("thumbnail_storage_id"),
    screenshotStorageId: text("screenshot_storage_id"),
    convertedJpgStorageId: text("converted_jpg_storage_id"),

    rawMetadata: text("raw_metadata", { mode: "json" }).$type<RawMetadata>(),
    originalMimeType: text("original_mime_type"),
    userAgent: text("user_agent"),

    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),

    reviewStatus: text("review_status", {
      enum: ["pending", "accepted", "rejected"],
    }),
    flagColor: text("flag_color", {
      enum: ["red", "yellow", "orange", "green", "blue"],
    }),
    isPinned: integer("is_pinned", { mode: "boolean" }).default(false),

    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
  },
  (table) => ({
    userIdx: index("photos_user_id_idx").on(table.userId),
    isPinnedIdx: index("photos_is_pinned_idx").on(table.isPinned),
    dateTakenIdx: index("photos_date_taken_idx").on(table.dateTaken),
  }),
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateNoteId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content"),
    description: text("description"),
    rawMetadata: text("raw_metadata", { mode: "json" }).$type<RawMetadata>(),
    originalMimeType: text("original_mime_type"),
    userAgent: text("user_agent"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    dueDate: integer("due_date", { mode: "timestamp_ms" }),

    reviewStatus: text("review_status", {
      enum: ["pending", "accepted", "rejected"],
    }),
    flagColor: text("flag_color", {
      enum: ["red", "yellow", "orange", "green", "blue"],
    }),
    isPinned: integer("is_pinned", { mode: "boolean" }).default(false),

    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
  },
  (table) => ({
    userIdx: index("notes_user_id_idx").on(table.userId),
    isPinnedIdx: index("notes_is_pinned_idx").on(table.isPinned),
  }),
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateTagId()),
    name: text("name").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => ({
    // Case-insensitive unique constraint per user (COLLATE NOCASE)
    userTagNameIdx: uniqueIndex("tags_user_id_name_idx").on(t.userId, t.name),
  }),
);

export const tasksTags = sqliteTable(
  "tasks_tags",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.taskId, t.tagId] }),
    tagIdx: index("tasks_tags_tag_id_idx").on(t.tagId),
  }),
);

export const bookmarksTags = sqliteTable(
  "bookmarks_tags",
  {
    bookmarkId: text("bookmark_id")
      .notNull()
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.bookmarkId, t.tagId] }),
    tagIdx: index("bookmarks_tags_tag_id_idx").on(t.tagId),
  }),
);

export const documentsTags = sqliteTable(
  "documents_tags",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.documentId, t.tagId] }),
    tagIdx: index("documents_tags_tag_id_idx").on(t.tagId),
  }),
);

export const notesTags = sqliteTable(
  "notes_tags",
  {
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.noteId, t.tagId] }),
    tagIdx: index("notes_tags_tag_id_idx").on(t.tagId),
  }),
);

export const photosTags = sqliteTable(
  "photos_tags",
  {
    photoId: text("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.photoId, t.tagId] }),
    tagIdx: index("photos_tags_tag_id_idx").on(t.tagId),
  }),
);

export const history = sqliteTable(
  "history",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => generateHistoryId()),
    action: text("action").notNull(),
    itemType: text("item_type").notNull(),
    itemId: text("item_id").notNull(),
    itemName: text("item_name"),
    beforeData: text("before_data", {
      mode: "json",
    }).$type<HistoryBeforeData>(),
    afterData: text("after_data", { mode: "json" }).$type<HistoryAfterData>(),
    actor: text("actor").notNull(),
    metadata: text("metadata", { mode: "json" }).$type<HistoryMetadata>(),
    timestamp: integer("timestamp", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => ({
    itemIdx: index("history_item_idx").on(table.itemType, table.itemId),
    userIdx: index("history_user_id_idx").on(table.userId),
  }),
);

export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateConversationId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
    lastMessageAt: integer("last_message_at", { mode: "timestamp_ms" }),
    messageCount: integer("message_count").notNull().default(0),
  },
  (table) => ({
    userIdx: index("conversations_user_id_idx").on(table.userId),
    lastMessageIdx: index("conversations_last_message_at_idx").on(
      table.lastMessageAt,
    ),
  }),
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateMessageId()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    thinkingContent: text("thinking_content"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
    metadata: text("metadata", { mode: "json" }).$type<MessageMetadata>(),
  },
  (table) => ({
    conversationIdx: index("messages_conversation_id_idx").on(
      table.conversationId,
    ),
    createdAtIdx: index("messages_created_at_idx").on(table.createdAt),
  }),
);

export const channels = sqliteTable(
  "channels",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateChannelId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name", { length: 255 }).notNull(),
    platform: text("platform", {
      enum: ["telegram", "slack", "whatsapp", "email"],
    }).notNull(),
    capability: text("capability", {
      enum: ["notification", "chat", "bidirectional"],
    }).notNull(),

    config: text("config", { mode: "json" }).$type<ChannelConfig>().notNull(),

    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
  },
  (table) => ({
    userIdx: index("channels_user_id_idx").on(table.userId),
    platformIdx: index("channels_platform_idx").on(table.platform),
    activeIdx: index("channels_is_active_idx").on(table.isActive),
  }),
);

export const feedback = sqliteTable(
  "feedback",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateFeedbackId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    sentiment: text("sentiment", {
      enum: ["positive", "negative"],
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast((unixepoch('subsec') * 1000) as integer))`),
  },
  (table) => ({
    userIdx: index("feedback_user_id_idx").on(table.userId),
    createdAtIdx: index("feedback_created_at_idx").on(table.createdAt),
  }),
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  apiKeys: many(apiKeys),
  tasks: many(tasks),
  bookmarks: many(bookmarks),
  documents: many(documents),
  photos: many(photos),
  notes: many(notes),
  tags: many(tags),
  history: many(history),
  conversations: many(conversations),
  channels: many(channels),
  feedback: many(feedback),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  user: one(users, { fields: [tasks.userId], references: [users.id] }),
  assignedTo: one(users, {
    fields: [tasks.assignedToId],
    references: [users.id],
  }),
  tags: many(tasksTags),
  comments: many(taskComments),
}));

export const bookmarksRelations = relations(bookmarks, ({ one, many }) => ({
  user: one(users, { fields: [bookmarks.userId], references: [users.id] }),
  tags: many(bookmarksTags),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  user: one(users, { fields: [documents.userId], references: [users.id] }),
  tags: many(documentsTags),
}));

export const photosRelations = relations(photos, ({ one, many }) => ({
  user: one(users, { fields: [photos.userId], references: [users.id] }),
  tags: many(photosTags),
}));

export const notesRelations = relations(notes, ({ one, many }) => ({
  user: one(users, { fields: [notes.userId], references: [users.id] }),
  tags: many(notesTags),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  user: one(users, { fields: [tags.userId], references: [users.id] }),
  taskLinks: many(tasksTags),
  bookmarkLinks: many(bookmarksTags),
  documentLinks: many(documentsTags),
  noteLinks: many(notesTags),
  photoLinks: many(photosTags),
}));

export const tasksTagsRelations = relations(tasksTags, ({ one }) => ({
  task: one(tasks, { fields: [tasksTags.taskId], references: [tasks.id] }),
  tag: one(tags, { fields: [tasksTags.tagId], references: [tags.id] }),
}));

export const taskCommentsRelations = relations(taskComments, ({ one }) => ({
  task: one(tasks, { fields: [taskComments.taskId], references: [tasks.id] }),
  user: one(users, { fields: [taskComments.userId], references: [users.id] }),
}));

export const bookmarksTagsRelations = relations(bookmarksTags, ({ one }) => ({
  bookmark: one(bookmarks, {
    fields: [bookmarksTags.bookmarkId],
    references: [bookmarks.id],
  }),
  tag: one(tags, { fields: [bookmarksTags.tagId], references: [tags.id] }),
}));

export const documentsTagsRelations = relations(documentsTags, ({ one }) => ({
  document: one(documents, {
    fields: [documentsTags.documentId],
    references: [documents.id],
  }),
  tag: one(tags, { fields: [documentsTags.tagId], references: [tags.id] }),
}));

export const notesTagsRelations = relations(notesTags, ({ one }) => ({
  note: one(notes, { fields: [notesTags.noteId], references: [notes.id] }),
  tag: one(tags, { fields: [notesTags.tagId], references: [tags.id] }),
}));

export const photosTagsRelations = relations(photosTags, ({ one }) => ({
  photo: one(photos, { fields: [photosTags.photoId], references: [photos.id] }),
  tag: one(tags, { fields: [photosTags.tagId], references: [tags.id] }),
}));

export const historyRelations = relations(history, ({ one }) => ({
  user: one(users, { fields: [history.userId], references: [users.id] }),
}));

export const conversationsRelations = relations(
  conversations,
  ({ one, many }) => ({
    user: one(users, {
      fields: [conversations.userId],
      references: [users.id],
    }),
    messages: many(messages),
  }),
);

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const channelsRelations = relations(channels, ({ one }) => ({
  user: one(users, { fields: [channels.userId], references: [users.id] }),
}));

export const feedbackRelations = relations(feedback, ({ one }) => ({
  user: one(users, { fields: [feedback.userId], references: [users.id] }),
}));

// =============================================================================
// App Metadata (for upgrade system)
// =============================================================================

export const appMeta = sqliteTable("_app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
