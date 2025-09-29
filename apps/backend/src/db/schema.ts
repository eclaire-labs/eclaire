import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import {
  generateApiKeyId,
  generateAssetProcessingJobId,
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
} from "../lib/id-generator";

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateUserId()),
  userType: text("user_type", {
    enum: ["user", "assistant", "worker"],
  }).notNull(),
  displayName: text("display_name"),
  fullName: text("full_name"),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  avatarStorageId: text("avatar_storage_id"),
  avatarColor: text("avatar_color"),
  bio: text("bio"),
  timezone: text("time_zone"),
  city: text("city"),
  country: text("country"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateSecurityId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }), // Cascade delete
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => ({
    userIdx: index("sessions_user_id_idx").on(table.userId),
  }),
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateSecurityId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }), // Cascade delete
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    idToken: text("id_token"),
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    // Unique constraint for provider + account ID
    providerAccountIdx: unique().on(table.providerId, table.accountId),
    userIdx: index("accounts_user_id_idx").on(table.userId),
  }),
);

export const verifications = pgTable("verifications", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateSecurityId()),
  identifier: text("identifier").notNull(),
  token: text("token").notNull().unique(), // Renamed from 'value' for clarity
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateApiKeyId()),
    keyId: text("key_id").notNull().unique(), // The 15-char ID portion for lookup
    keyHash: text("key_hash").notNull(), // HMAC hash of full key
    hashVersion: integer("hash_version").notNull().default(1), // Version of HMAC key used
    keySuffix: text("key_suffix").notNull(), // Last 4 chars for display
    name: text("name").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }), // Cascade delete
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => ({
    userIdx: index("api_keys_user_id_idx").on(table.userId),
  }),
);

export const tasks = pgTable(
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
    dueDate: timestamp("due_date"),
    assignedToId: text("assigned_to_id").references(() => users.id, {
      onDelete: "set null",
    }),
    enabled: boolean("enabled").notNull().default(true),
    reviewStatus: text("review_status", {
      enum: ["pending", "accepted", "rejected"],
    }),
    flagColor: text("flag_color", {
      enum: ["red", "yellow", "orange", "green", "blue"],
    }),
    isPinned: boolean("is_pinned").notNull().default(false),
    // Recurrence fields
    isRecurring: boolean("is_recurring").notNull().default(false),
    cronExpression: text("cron_expression"),
    recurrenceEndDate: timestamp("recurrence_end_date"),
    recurrenceLimit: integer("recurrence_limit"),
    runImmediately: boolean("run_immediately").notNull().default(false),
    nextRunAt: timestamp("next_run_at"),
    lastRunAt: timestamp("last_run_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("tasks_user_id_idx").on(table.userId),
    statusIdx: index("tasks_status_idx").on(table.status),
    dueDateIdx: index("tasks_due_date_idx").on(table.dueDate),
    isPinnedIdx: index("tasks_is_pinned_idx").on(table.isPinned),
    isRecurringIdx: index("tasks_is_recurring_idx").on(table.isRecurring),
    nextRunAtIdx: index("tasks_next_run_at_idx").on(table.nextRunAt),
    lastRunAtIdx: index("tasks_last_run_at_idx").on(table.lastRunAt),
    completedAtIdx: index("tasks_completed_at_idx").on(table.completedAt),
  }),
);

export const taskComments = pgTable(
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    taskIdx: index("task_comments_task_id_idx").on(table.taskId),
    userIdx: index("task_comments_user_id_idx").on(table.userId),
    createdAtIdx: index("task_comments_created_at_idx").on(table.createdAt),
  }),
);

// -- REWORKED BOOKMARKS TABLE --
export const bookmarks = pgTable(
  "bookmarks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateBookmarkId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // URLs
    originalUrl: text("original_url").notNull(), // The URL the user submitted
    normalizedUrl: text("normalized_url"), // The final, canonical URL after redirects and cleaning

    // Core Content
    title: text("title"),
    description: text("description"),
    author: text("author"),
    lang: text("lang"), // Detected language of the page

    dueDate: timestamp("due_date"),
    pageLastUpdatedAt: timestamp("page_last_updated_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),

    // HTTP Info
    contentType: text("content_type"),
    etag: text("etag"),
    lastModified: text("last_modified"),

    // User-provided metadata (preserved)
    rawMetadata: jsonb("raw_metadata"),
    userAgent: text("user_agent"), // User-agent from the submission request

    // Storage IDs (using asset-instance storage pattern)
    faviconStorageId: text("favicon_storage_id"),
    thumbnailStorageId: text("thumbnail_storage_id"),
    screenshotDesktopStorageId: text("screenshot_desktop_storage_id"),
    screenshotMobileStorageId: text("screenshot_mobile_storage_id"),
    screenshotFullPageStorageId: text("screenshot_full_page_storage_id"),
    pdfStorageId: text("pdf_storage_id"),
    readableHtmlStorageId: text("readable_html_storage_id"),
    extractedMdStorageId: text("extracted_md_storage_id"), // Markdown content extracted from the page
    extractedTxtStorageId: text("extracted_txt_storage_id"), // Plain text content extracted from the page
    rawHtmlStorageId: text("raw_html_storage_id"),
    readmeStorageId: text("readme_storage_id"), // README content for GitHub repositories

    // Content extraction results (regardless of which worker extracted it)
    extractedText: text("extracted_text"), // Text content extracted from the bookmark

    enabled: boolean("enabled").notNull().default(true), // Controls background processing

    // New fields for review, flagging, and pinning
    reviewStatus: text("review_status", {
      enum: ["pending", "accepted", "rejected"],
    }),
    flagColor: text("flag_color", {
      enum: ["red", "yellow", "orange", "green", "blue"],
    }),
    isPinned: boolean("is_pinned").default(false),
  },
  (table) => ({
    userIdx: index("bookmarks_user_id_idx").on(table.userId),
    isPinnedIdx: index("bookmarks_is_pinned_idx").on(table.isPinned),
    // Regular index for query performance (unique constraint removed - no deduplication implemented yet)
    userUrlIdx: index("bookmarks_user_id_normalized_url_idx").on(
      table.userId,
      table.normalizedUrl,
    ),
  }),
);

// Documents table
export const documents = pgTable(
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
    dueDate: timestamp("due_date"),
    storageId: text("storage_id"), // Store the ID for the uploaded file
    mimeType: text("mime_type"),
    fileSize: integer("file_size"),
    thumbnailStorageId: text("thumbnail_storage_id"), // Generated thumbnail artifact
    screenshotStorageId: text("screenshot_storage_id"), // Generated high-res screenshot artifact
    pdfStorageId: text("pdf_storage_id"), // Generated PDF artifact
    rawMetadata: jsonb("raw_metadata"),
    originalMimeType: text("original_mime_type"),
    userAgent: text("user_agent"),
    enabled: boolean("enabled").notNull().default(true), // Controls background processing
    extractedMdStorageId: text("extracted_md_storage_id"), // Markdown content extracted from the page
    extractedTxtStorageId: text("extracted_txt_storage_id"), // Plain text content extracted from the page

    // Content extraction results (regardless of which worker extracted it)
    extractedText: text("extracted_text"), // Text content extracted from the document

    // New fields for review, flagging, and pinning
    reviewStatus: text("review_status", {
      enum: ["pending", "accepted", "rejected"],
    }),
    flagColor: text("flag_color", {
      enum: ["red", "yellow", "orange", "green", "blue"],
    }), // Can be null for no flag
    isPinned: boolean("is_pinned").default(false),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("documents_user_id_idx").on(table.userId),
    isPinnedIdx: index("documents_is_pinned_idx").on(table.isPinned),
  }),
);

// Photos table
export const photos = pgTable(
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
    deviceId: text("device_id"), // Stored as text without foreign key reference
    dueDate: timestamp("due_date"),
    dateTaken: timestamp("date_taken"),
    cameraMake: text("camera_make"),
    cameraModel: text("camera_model"),
    lensModel: text("lens_model"),
    iso: integer("iso"),
    fNumber: numeric("f_number"), // Aperture (e.g., 2.8, 4.0)
    exposureTime: numeric("exposure_time"), // Shutter speed (e.g., 0.0166 => 1/60s)
    orientation: integer("orientation"), // Standard EXIF orientation value (1-8)
    imageWidth: integer("image_width"), // Pixel dimensions from EXIF
    imageHeight: integer("image_height"),

    // --- Location Data ---
    latitude: numeric("latitude"),
    longitude: numeric("longitude"),
    altitude: numeric("altitude"),
    locationCity: text("location_city"), // Reverse geocoded city name
    locationCountryIso2: text("location_country_iso2"), // Reverse geocoded country code (e.g., DE, US)
    locationCountryName: text("location_country_name"), // Reverse geocoded country name

    // --- AI Generated Data ---
    photoType: text("photo_type"), // e.g., 'screenshot', 'document_scan'
    ocrText: text("ocr_text"),
    dominantColors: jsonb("dominant_colors"), // Changed from CSV to JSON

    // --- Generated Files ---
    thumbnailStorageId: text("thumbnail_storage_id"), // Storage ID for the generated thumbnail
    screenshotStorageId: text("screenshot_storage_id"), // Storage ID for the generated high-res screenshot
    convertedJpgStorageId: text("converted_jpg_storage_id"), // Storage ID for HEIC->JPG conversion

    rawMetadata: jsonb("raw_metadata"),
    originalMimeType: text("original_mime_type"),
    userAgent: text("user_agent"),

    enabled: boolean("enabled").notNull().default(true), // Controls background processing

    // New fields for review, flagging, and pinning
    reviewStatus: text("review_status", {
      enum: ["pending", "accepted", "rejected"],
    }),
    flagColor: text("flag_color", {
      enum: ["red", "yellow", "orange", "green", "blue"],
    }), // Can be null for no flag
    isPinned: boolean("is_pinned").default(false),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("photos_user_id_idx").on(table.userId),
    isPinnedIdx: index("photos_is_pinned_idx").on(table.isPinned),
    dateTakenIdx: index("photos_date_taken_idx").on(table.dateTaken),
  }),
);

// Notes entries table
export const notes = pgTable(
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
    rawMetadata: jsonb("raw_metadata"),
    originalMimeType: text("original_mime_type"),
    userAgent: text("user_agent"),
    enabled: boolean("enabled").notNull().default(true), // Controls background processing
    dueDate: timestamp("due_date"),

    // New fields for review, flagging, and pinning
    reviewStatus: text("review_status", {
      enum: ["pending", "accepted", "rejected"],
    }),
    flagColor: text("flag_color", {
      enum: ["red", "yellow", "orange", "green", "blue"],
    }), // Can be null for no flag
    isPinned: boolean("is_pinned").default(false),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("notes_user_id_idx").on(table.userId),
    isPinnedIdx: index("notes_is_pinned_idx").on(table.isPinned),
  }),
);

// -- UNIFIED ASSET PROCESSING JOBS TABLE --
export const assetProcessingJobs = pgTable(
  "asset_processing_jobs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateAssetProcessingJobId()),

    // Asset identification
    assetType: text("asset_type", {
      enum: ["photos", "documents", "bookmarks", "notes", "tasks"],
    }).notNull(),
    assetId: text("asset_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Overall status
    status: text("status", {
      enum: ["pending", "processing", "completed", "failed", "retry_pending"],
    })
      .notNull()
      .default("pending"),

    // Processing stages (JSON array of stage objects)
    // Example: [{"name": "thumbnail", "status": "completed", "progress": 100, "startedAt": 1234567890, "completedAt": 1234567891}]
    stages: jsonb("stages"),

    // Current stage being processed
    currentStage: text("current_stage"),
    overallProgress: integer("overall_progress").default(0), // 0-100

    // Error handling
    errorMessage: text("error_message"),
    errorDetails: jsonb("error_details"),

    // Retry tracking
    retryCount: integer("retry_count").default(0),
    maxRetries: integer("max_retries").default(3),

    nextRetryAt: timestamp("next_retry_at"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    assetUnique: unique().on(table.assetType, table.assetId),
    // Index for job queue workers to find work
    statusRetryIdx: index("asset_jobs_status_retry_idx").on(
      table.status,
      table.nextRetryAt,
    ),
  }),
);

// Tags table
export const tags = pgTable(
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
    // Ensure tag names are unique per user, not globally
    userTagName: unique().on(t.userId, t.name),
  }),
);

export const tasksTags = pgTable(
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
  }),
);

export const bookmarksTags = pgTable(
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
  }),
);

export const documentsTags = pgTable(
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
  }),
);

export const notesTags = pgTable(
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
  }),
);

export const photosTags = pgTable(
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
  }),
);

// History table for tracking all system events
export const history = pgTable(
  "history",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => generateHistoryId()),
    action: text("action").notNull(), // create, update, delete, api_call, etc.
    itemType: text("item_type").notNull(), // task, note, bookmark, photo, prompt, api_error, etc.
    itemId: text("item_id").notNull(), // ID of the affected item
    itemName: text("item_name"), // Name/description of the affected item
    beforeData: jsonb("before_data"),
    afterData: jsonb("after_data"),
    actor: text("actor").notNull(), // user, assistant, system
    metadata: jsonb("metadata"), // For IP, traceId, onBehalfOfUser, etc.
    timestamp: timestamp("timestamp").notNull().defaultNow(),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }), // Set to null on user deletion to preserve history
  },
  (table) => ({
    itemIdx: index("history_item_idx").on(table.itemType, table.itemId),
    userIdx: index("history_user_id_idx").on(table.userId),
  }),
);

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
  assetProcessingJobs: many(assetProcessingJobs),
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
  processingJob: one(assetProcessingJobs, {
    fields: [tasks.id],
    references: [assetProcessingJobs.assetId],
  }),
  tags: many(tasksTags),
  comments: many(taskComments),
}));

export const bookmarksRelations = relations(bookmarks, ({ one, many }) => ({
  user: one(users, { fields: [bookmarks.userId], references: [users.id] }),
  processingJob: one(assetProcessingJobs, {
    fields: [bookmarks.id],
    references: [assetProcessingJobs.assetId],
  }),
  tags: many(bookmarksTags),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  user: one(users, { fields: [documents.userId], references: [users.id] }),
  processingJob: one(assetProcessingJobs, {
    fields: [documents.id],
    references: [assetProcessingJobs.assetId],
  }),
  tags: many(documentsTags),
}));

export const photosRelations = relations(photos, ({ one, many }) => ({
  user: one(users, { fields: [photos.userId], references: [users.id] }),
  processingJob: one(assetProcessingJobs, {
    fields: [photos.id],
    references: [assetProcessingJobs.assetId],
  }),
  tags: many(photosTags),
}));

export const notesRelations = relations(notes, ({ one, many }) => ({
  user: one(users, { fields: [notes.userId], references: [users.id] }),
  processingJob: one(assetProcessingJobs, {
    fields: [notes.id],
    references: [assetProcessingJobs.assetId],
  }),
  tags: many(notesTags),
}));

export const assetProcessingJobsRelations = relations(
  assetProcessingJobs,
  ({ one }) => ({
    user: one(users, {
      fields: [assetProcessingJobs.userId],
      references: [users.id],
    }),
    // Note: A polymorphic relation back to the asset (bookmark, photo, etc.)
    // is not directly definable here but is handled in application logic.
  }),
);

export const tagsRelations = relations(tags, ({ one, many }) => ({
  user: one(users, { fields: [tags.userId], references: [users.id] }),
  taskLinks: many(tasksTags),
  bookmarkLinks: many(bookmarksTags),
  documentLinks: many(documentsTags),
  noteLinks: many(notesTags),
  photoLinks: many(photosTags),
}));

// Many-to-Many relations for join tables
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

// Conversations table
export const conversations = pgTable(
  "conversations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateConversationId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    lastMessageAt: timestamp("last_message_at"),
    messageCount: integer("message_count").notNull().default(0),
  },
  (table) => ({
    userIdx: index("conversations_user_id_idx").on(table.userId),
    lastMessageIdx: index("conversations_last_message_at_idx").on(
      table.lastMessageAt,
    ),
  }),
);

// Messages table
export const messages = pgTable(
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
    thinkingContent: text("thinking_content"), // For storing AI thinking process content
    createdAt: timestamp("created_at").notNull().defaultNow(),
    metadata: jsonb("metadata"), // For storing traces, token usage, etc.
  },
  (table) => ({
    conversationIdx: index("messages_conversation_id_idx").on(
      table.conversationId,
    ),
    createdAtIdx: index("messages_created_at_idx").on(table.createdAt),
  }),
);

// Relations for new tables
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

// Channels system for multi-platform notifications and chat
export const channels = pgTable(
  "channels",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateChannelId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    platform: text("platform", {
      enum: ["telegram", "slack", "whatsapp", "email"],
    }).notNull(),
    capability: text("capability", {
      enum: ["notification", "chat", "bidirectional"],
    }).notNull(),

    // The flexible config column for platform-specific encrypted data
    config: jsonb("config").notNull(),

    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("channels_user_id_idx").on(table.userId),
    platformIdx: index("channels_platform_idx").on(table.platform),
    activeIdx: index("channels_is_active_idx").on(table.isActive),
    // Indexing the JSONB column for faster lookups if needed
    configIdx: index("channels_config_idx").using("gin", table.config),
  }),
);

export const channelsRelations = relations(channels, ({ one }) => ({
  user: one(users, { fields: [channels.userId], references: [users.id] }),
}));

// Feedback table for user feedback collection
export const feedback = pgTable(
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
    }), // nullable - thumbs up/down is optional
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("feedback_user_id_idx").on(table.userId),
    createdAtIdx: index("feedback_created_at_idx").on(table.createdAt),
  }),
);

export const feedbackRelations = relations(feedback, ({ one }) => ({
  user: one(users, { fields: [feedback.userId], references: [users.id] }),
}));
