import { relations, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Custom tsvector column type for PostgreSQL full-text search.
 * Used with GENERATED ALWAYS AS (...) STORED columns and GIN indexes.
 */
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// Enums
export const taskStatusEnum = pgEnum("task_status", [
  "backlog",
  "not-started",
  "in-progress",
  "completed",
  "cancelled",
]);

export const actorKindEnum = pgEnum("actor_kind", [
  "human",
  "agent",
  "system",
  "service",
]);

import {
  generateActorId,
  generateApiKeyId,
  generateAgentId,
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
  generateAgentStepId,
  generateTaskExecutionId,
  generateTaskId,
  generateUserId,
} from "@eclaire/core/id";

export const users = pgTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateUserId()),
    userType: text("user_type", {
      enum: ["user", "assistant", "worker"],
    }).notNull(),
    displayName: text("display_name"),
    fullName: text("full_name"),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    avatarStorageId: text("avatar_storage_id"),
    avatarColor: text("avatar_color"),
    bio: text("bio"),
    timezone: text("time_zone"),
    city: text("city"),
    country: text("country"),
    isInstanceAdmin: boolean("is_instance_admin").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    emailLowerIdx: uniqueIndex("users_email_lower_idx").on(
      sql`lower(${table.email})`,
    ),
  }),
);

export const actors = pgTable(
  "actors",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateActorId()),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: actorKindEnum("kind").notNull(),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    ownerUserIdx: index("actors_owner_user_id_idx").on(table.ownerUserId),
    ownerUserKindIdx: index("actors_owner_user_id_kind_idx").on(
      table.ownerUserId,
      table.kind,
    ),
  }),
);

export const humanActors = pgTable(
  "human_actors",
  {
    actorId: text("actor_id")
      .primaryKey()
      .references(() => actors.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => ({
    userIdx: uniqueIndex("human_actors_user_id_idx").on(table.userId),
  }),
);

export const sessions = pgTable(
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
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
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    idToken: text("id_token"),
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    providerAccountIdx: unique().on(table.providerId, table.accountId),
    userIdx: index("accounts_user_id_idx").on(table.userId),
  }),
);

export const verifications = pgTable("verifications", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateSecurityId()),
  identifier: text("identifier").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const apiKeys = pgTable(
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
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => ({
    userIdx: index("api_keys_user_id_idx").on(table.userId),
  }),
);

export const actorGrants = pgTable(
  "actor_grants",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateSecurityId()),
    actorId: text("actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    grantedByActorId: text("granted_by_actor_id").references(() => actors.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    actorIdx: index("actor_grants_actor_id_idx").on(table.actorId),
    ownerUserIdx: index("actor_grants_owner_user_id_idx").on(table.ownerUserId),
    grantedByActorIdx: index("actor_grants_granted_by_actor_id_idx").on(
      table.grantedByActorId,
    ),
  }),
);

export const actorCredentials = pgTable(
  "actor_credentials",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateApiKeyId()),
    actorId: text("actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    grantId: text("grant_id")
      .notNull()
      .references(() => actorGrants.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["api_key"],
    })
      .notNull()
      .default("api_key"),
    keyId: text("key_id").notNull().unique(),
    keyHash: text("key_hash").notNull(),
    hashVersion: integer("hash_version").notNull().default(1),
    keySuffix: text("key_suffix").notNull(),
    name: text("name").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => ({
    actorIdx: index("actor_credentials_actor_id_idx").on(table.actorId),
    ownerUserIdx: index("actor_credentials_owner_user_id_idx").on(
      table.ownerUserId,
    ),
    grantIdx: index("actor_credentials_grant_id_idx").on(table.grantId),
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
    status: taskStatusEnum("status").notNull().default("not-started"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    assigneeActorId: text("assignee_actor_id").references(() => actors.id, {
      onDelete: "set null",
    }),
    priority: integer("priority").notNull().default(0),
    processingEnabled: boolean("processing_enabled").notNull().default(true),
    processingStatus: text("processing_status", {
      enum: ["pending", "processing", "completed", "failed"],
    }),
    reviewStatus: text("review_status", {
      enum: ["pending", "accepted", "rejected"],
    }),
    flagColor: text("flag_color", {
      enum: ["red", "yellow", "orange", "green", "blue"],
    }),
    isPinned: boolean("is_pinned").notNull().default(false),
    sortOrder: doublePrecision("sort_order"),
    parentId: text("parent_id"),
    // Note: Recurrence data (isRecurring, cronExpression, recurrenceEndDate, recurrenceLimit)
    // is now stored in queue_schedules table and fetched via scheduler.get()
    lastExecutedAt: timestamp("last_executed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): ReturnType<typeof sql> => sql`(
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
      )`,
    ),
  },
  (table) => ({
    userIdx: index("tasks_user_id_idx").on(table.userId),
    statusIdx: index("tasks_status_idx").on(table.status),
    dueDateIdx: index("tasks_due_date_idx").on(table.dueDate),
    assigneeActorIdx: index("tasks_assignee_actor_id_idx").on(
      table.assigneeActorId,
    ),
    isPinnedIdx: index("tasks_is_pinned_idx").on(table.isPinned),
    completedAtIdx: index("tasks_completed_at_idx").on(table.completedAt),
    parentIdx: index("tasks_parent_id_idx").on(table.parentId),
    userProcessingEnabledIdx: index("tasks_user_id_processing_enabled_idx")
      .on(table.userId)
      .where(sql`processing_enabled = true`),
    userCreatedAtIdx: index("tasks_user_id_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
    userDueDateIdx: index("tasks_user_id_due_date_idx").on(
      table.userId,
      table.dueDate,
    ),
    userStatusCreatedAtIdx: index("tasks_user_id_status_created_at_idx").on(
      table.userId,
      table.status,
      table.createdAt,
    ),
    userPriorityCreatedAtIdx: index("tasks_user_id_priority_created_at_idx").on(
      table.userId,
      table.priority,
      table.createdAt,
    ),
    userSortOrderIdx: index("tasks_user_id_sort_order_idx").on(
      table.userId,
      table.sortOrder,
    ),
    titleTrgmIdx: index("tasks_title_trgm_idx").using(
      "gin",
      sql`${table.title} gin_trgm_ops`,
    ),
    searchVectorIdx: index("tasks_search_vector_idx").using(
      "gin",
      table.searchVector,
    ),
    parentFk: foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
    }).onDelete("cascade"),
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
    authorActorId: text("author_actor_id").references(() => actors.id, {
      onDelete: "set null",
    }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    taskIdx: index("task_comments_task_id_idx").on(table.taskId),
    userIdx: index("task_comments_user_id_idx").on(table.userId),
    authorActorIdx: index("task_comments_author_actor_id_idx").on(
      table.authorActorId,
    ),
    createdAtIdx: index("task_comments_created_at_idx").on(table.createdAt),
  }),
);

export const taskExecutions = pgTable(
  "task_executions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateTaskExecutionId()),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scheduleKey: text("schedule_key"),
    jobId: text("job_id"),
    status: text("status", {
      enum: ["running", "completed", "failed", "skipped"],
    }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    error: text("error"),
    resultSummary: text("result_summary"),
    tokenUsage: jsonb("token_usage"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    taskCreatedAtIdx: index("task_executions_task_id_created_at_idx").on(
      table.taskId,
      table.createdAt,
    ),
    userCreatedAtIdx: index("task_executions_user_id_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
    statusIdx: index("task_executions_status_idx").on(table.status),
  }),
);

export const bookmarks = pgTable(
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

    dueDate: timestamp("due_date", { withTimezone: true }),
    pageLastUpdatedAt: timestamp("page_last_updated_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    contentType: text("content_type"),
    etag: text("etag"),
    lastModified: text("last_modified"),

    rawMetadata: jsonb("raw_metadata"),
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

    processingEnabled: boolean("processing_enabled").notNull().default(true),
    processingStatus: text("processing_status", {
      enum: ["pending", "processing", "completed", "failed"],
    }),

    reviewStatus: text("review_status", {
      enum: ["pending", "accepted", "rejected"],
    }),
    flagColor: text("flag_color", {
      enum: ["red", "yellow", "orange", "green", "blue"],
    }),
    isPinned: boolean("is_pinned").default(false),

    // Full-text search vector (auto-populated, never written directly)
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): ReturnType<typeof sql> => sql`(
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(extracted_text, '')), 'C') ||
        setweight(to_tsvector('english', coalesce(original_url, '')), 'D')
      )`,
    ),
  },
  (table) => ({
    userIdx: index("bookmarks_user_id_idx").on(table.userId),
    isPinnedIdx: index("bookmarks_is_pinned_idx").on(table.isPinned),
    userUrlIdx: index("bookmarks_user_id_normalized_url_idx").on(
      table.userId,
      table.normalizedUrl,
    ),
    // Partial index: most queries filter for processing-enabled records
    userProcessingEnabledIdx: index("bookmarks_user_id_processing_enabled_idx")
      .on(table.userId)
      .where(sql`processing_enabled = true`),
    // Composite indexes for cursor pagination
    userCreatedAtIdx: index("bookmarks_user_id_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
    userTitleIdx: index("bookmarks_user_id_title_idx").on(
      table.userId,
      table.title,
    ),
    // Trigram index for LIKE '%text%' search
    titleTrgmIdx: index("bookmarks_title_trgm_idx").using(
      "gin",
      sql`${table.title} gin_trgm_ops`,
    ),
    // GIN index for full-text search
    searchVectorIdx: index("bookmarks_search_vector_idx").using(
      "gin",
      table.searchVector,
    ),
  }),
);

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
    dueDate: timestamp("due_date", { withTimezone: true }),
    storageId: text("storage_id"),
    mimeType: text("mime_type"),
    fileSize: integer("file_size"),
    thumbnailStorageId: text("thumbnail_storage_id"),
    screenshotStorageId: text("screenshot_storage_id"),
    pdfStorageId: text("pdf_storage_id"),
    rawMetadata: jsonb("raw_metadata"),
    originalMimeType: text("original_mime_type"),
    userAgent: text("user_agent"),
    processingEnabled: boolean("processing_enabled").notNull().default(true),
    processingStatus: text("processing_status", {
      enum: ["pending", "processing", "completed", "failed"],
    }),
    extractedMdStorageId: text("extracted_md_storage_id"),
    extractedTxtStorageId: text("extracted_txt_storage_id"),

    extractedText: text("extracted_text"),

    reviewStatus: text("review_status", {
      enum: ["pending", "accepted", "rejected"],
    }),
    flagColor: text("flag_color", {
      enum: ["red", "yellow", "orange", "green", "blue"],
    }),
    isPinned: boolean("is_pinned").default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): ReturnType<typeof sql> => sql`(
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(extracted_text, '')), 'C')
      )`,
    ),
  },
  (table) => ({
    userIdx: index("documents_user_id_idx").on(table.userId),
    isPinnedIdx: index("documents_is_pinned_idx").on(table.isPinned),
    userProcessingEnabledIdx: index("documents_user_id_processing_enabled_idx")
      .on(table.userId)
      .where(sql`processing_enabled = true`),
    userCreatedAtIdx: index("documents_user_id_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
    userTitleIdx: index("documents_user_id_title_idx").on(
      table.userId,
      table.title,
    ),
    titleTrgmIdx: index("documents_title_trgm_idx").using(
      "gin",
      sql`${table.title} gin_trgm_ops`,
    ),
    userUpdatedAtIdx: index("documents_user_id_updated_at_idx").on(
      table.userId,
      table.updatedAt,
    ),
    searchVectorIdx: index("documents_search_vector_idx").using(
      "gin",
      table.searchVector,
    ),
  }),
);

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
    deviceId: text("device_id"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    dateTaken: timestamp("date_taken", { withTimezone: true }),
    cameraMake: text("camera_make"),
    cameraModel: text("camera_model"),
    lensModel: text("lens_model"),
    iso: integer("iso"),
    fNumber: numeric("f_number"),
    exposureTime: numeric("exposure_time"),
    orientation: integer("orientation"),
    imageWidth: integer("image_width"),
    imageHeight: integer("image_height"),

    latitude: numeric("latitude"),
    longitude: numeric("longitude"),
    altitude: numeric("altitude"),
    locationCity: text("location_city"),
    locationCountryIso2: text("location_country_iso2"),
    locationCountryName: text("location_country_name"),

    photoType: text("photo_type"),
    extractedText: text("extracted_text"),
    dominantColors: jsonb("dominant_colors"),

    thumbnailStorageId: text("thumbnail_storage_id"),
    screenshotStorageId: text("screenshot_storage_id"),
    convertedJpgStorageId: text("converted_jpg_storage_id"),
    extractedMdStorageId: text("extracted_md_storage_id"),
    extractedTxtStorageId: text("extracted_txt_storage_id"),

    rawMetadata: jsonb("raw_metadata"),
    originalMimeType: text("original_mime_type"),
    userAgent: text("user_agent"),

    processingEnabled: boolean("processing_enabled").notNull().default(true),
    processingStatus: text("processing_status", {
      enum: ["pending", "processing", "completed", "failed"],
    }),

    reviewStatus: text("review_status", {
      enum: ["pending", "accepted", "rejected"],
    }),
    flagColor: text("flag_color", {
      enum: ["red", "yellow", "orange", "green", "blue"],
    }),
    isPinned: boolean("is_pinned").default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): ReturnType<typeof sql> => sql`(
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(extracted_text, '')), 'C')
      )`,
    ),
  },
  (table) => ({
    userIdx: index("photos_user_id_idx").on(table.userId),
    isPinnedIdx: index("photos_is_pinned_idx").on(table.isPinned),
    dateTakenIdx: index("photos_date_taken_idx").on(table.dateTaken),
    userProcessingEnabledIdx: index("photos_user_id_processing_enabled_idx")
      .on(table.userId)
      .where(sql`processing_enabled = true`),
    userCreatedAtIdx: index("photos_user_id_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
    userDateTakenIdx: index("photos_user_id_date_taken_idx").on(
      table.userId,
      table.dateTaken,
    ),
    userTitleIdx: index("photos_user_id_title_idx").on(
      table.userId,
      table.title,
    ),
    titleTrgmIdx: index("photos_title_trgm_idx").using(
      "gin",
      sql`${table.title} gin_trgm_ops`,
    ),
    searchVectorIdx: index("photos_search_vector_idx").using(
      "gin",
      table.searchVector,
    ),
  }),
);

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
    processingEnabled: boolean("processing_enabled").notNull().default(true),
    processingStatus: text("processing_status", {
      enum: ["pending", "processing", "completed", "failed"],
    }),
    dueDate: timestamp("due_date", { withTimezone: true }),

    reviewStatus: text("review_status", {
      enum: ["pending", "accepted", "rejected"],
    }),
    flagColor: text("flag_color", {
      enum: ["red", "yellow", "orange", "green", "blue"],
    }),
    isPinned: boolean("is_pinned").default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): ReturnType<typeof sql> => sql`(
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(content, '')), 'B')
      )`,
    ),
  },
  (table) => ({
    userIdx: index("notes_user_id_idx").on(table.userId),
    isPinnedIdx: index("notes_is_pinned_idx").on(table.isPinned),
    userProcessingEnabledIdx: index("notes_user_id_processing_enabled_idx")
      .on(table.userId)
      .where(sql`processing_enabled = true`),
    userCreatedAtIdx: index("notes_user_id_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
    userTitleIdx: index("notes_user_id_title_idx").on(
      table.userId,
      table.title,
    ),
    titleTrgmIdx: index("notes_title_trgm_idx").using(
      "gin",
      sql`${table.title} gin_trgm_ops`,
    ),
    searchVectorIdx: index("notes_search_vector_idx").using(
      "gin",
      table.searchVector,
    ),
  }),
);

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
    // Case-insensitive unique constraint per user
    userTagNameLowerIdx: uniqueIndex("tags_user_id_name_lower_idx").on(
      t.userId,
      sql`lower(${t.name})`,
    ),
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
    tagIdx: index("tasks_tags_tag_id_idx").on(t.tagId),
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
    tagIdx: index("bookmarks_tags_tag_id_idx").on(t.tagId),
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
    tagIdx: index("documents_tags_tag_id_idx").on(t.tagId),
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
    tagIdx: index("notes_tags_tag_id_idx").on(t.tagId),
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
    tagIdx: index("photos_tags_tag_id_idx").on(t.tagId),
  }),
);

export const history = pgTable(
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
    beforeData: jsonb("before_data"),
    afterData: jsonb("after_data"),
    actor: text("actor").notNull(),
    actorId: text("actor_id"),
    authorizedByActorId: text("authorized_by_actor_id"),
    grantId: text("grant_id"),
    metadata: jsonb("metadata"),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    conversationId: text("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    messageId: text("message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
  },
  (table) => ({
    itemIdx: index("history_item_idx").on(table.itemType, table.itemId),
    userIdx: index("history_user_id_idx").on(table.userId),
    actorIdx: index("history_actor_id_idx").on(table.actorId),
    authorizedByActorIdx: index("history_authorized_by_actor_id_idx").on(
      table.authorizedByActorId,
    ),
    grantIdx: index("history_grant_id_idx").on(table.grantId),
    conversationIdx: index("history_conversation_id_idx").on(
      table.conversationId,
    ),
  }),
);

export const usersRelations = relations(users, ({ many }) => ({
  actorLinks: many(humanActors),
  ownedActors: many(actors),
  sessions: many(sessions),
  accounts: many(accounts),
  apiKeys: many(apiKeys),
  actorGrants: many(actorGrants),
  actorCredentials: many(actorCredentials),
  tasks: many(tasks, { relationName: "taskOwner" }),
  assignedTasks: many(tasks, { relationName: "taskAssignee" }),
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

export const actorsRelations = relations(actors, ({ one, many }) => ({
  ownerUser: one(users, {
    fields: [actors.ownerUserId],
    references: [users.id],
  }),
  grants: many(actorGrants),
  credentials: many(actorCredentials),
}));

export const actorGrantsRelations = relations(actorGrants, ({ one, many }) => ({
  actor: one(actors, {
    fields: [actorGrants.actorId],
    references: [actors.id],
  }),
  ownerUser: one(users, {
    fields: [actorGrants.ownerUserId],
    references: [users.id],
  }),
  grantedByActor: one(actors, {
    fields: [actorGrants.grantedByActorId],
    references: [actors.id],
    relationName: "actorGrantAuthor",
  }),
  credentials: many(actorCredentials),
}));

export const actorCredentialsRelations = relations(
  actorCredentials,
  ({ one }) => ({
    actor: one(actors, {
      fields: [actorCredentials.actorId],
      references: [actors.id],
    }),
    ownerUser: one(users, {
      fields: [actorCredentials.ownerUserId],
      references: [users.id],
    }),
    grant: one(actorGrants, {
      fields: [actorCredentials.grantId],
      references: [actorGrants.id],
    }),
  }),
);

export const humanActorsRelations = relations(humanActors, ({ one }) => ({
  actor: one(actors, {
    fields: [humanActors.actorId],
    references: [actors.id],
  }),
  user: one(users, {
    fields: [humanActors.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  user: one(users, {
    fields: [tasks.userId],
    references: [users.id],
    relationName: "taskOwner",
  }),
  assigneeActor: one(actors, {
    fields: [tasks.assigneeActorId],
    references: [actors.id],
  }),
  parent: one(tasks, {
    fields: [tasks.parentId],
    references: [tasks.id],
    relationName: "parentChild",
  }),
  children: many(tasks, { relationName: "parentChild" }),
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
  conversation: one(conversations, {
    fields: [history.conversationId],
    references: [conversations.id],
  }),
}));

export const conversations = pgTable(
  "conversations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateConversationId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentActorId: text("agent_actor_id").notNull(),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    messageCount: integer("message_count").notNull().default(0),
    executionStatus: text("execution_status").notNull().default("idle"),
    hasUnreadResponse: boolean("has_unread_response").notNull().default(false),
  },
  (table) => ({
    userIdx: index("conversations_user_id_idx").on(table.userId),
    userAgentIdx: index("conversations_user_id_agent_actor_id_idx").on(
      table.userId,
      table.agentActorId,
    ),
    lastMessageIdx: index("conversations_last_message_at_idx").on(
      table.lastMessageAt,
    ),
  }),
);

export const agents = pgTable(
  "agents",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateAgentId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    systemPrompt: text("system_prompt").notNull(),
    toolNames: jsonb("tool_names")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    skillNames: jsonb("skill_names")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    modelId: text("model_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdx: index("agents_user_id_idx").on(table.userId),
    userUpdatedAtIdx: index("agents_user_id_updated_at_idx").on(
      table.userId,
      table.updatedAt,
    ),
    userNameIdx: uniqueIndex("agents_user_id_name_lower_idx").on(
      table.userId,
      sql`lower(${table.name})`,
    ),
  }),
);

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
    authorActorId: text("author_actor_id"),
    content: text("content").notNull(),
    thinkingContent: text("thinking_content"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    metadata: jsonb("metadata"),
  },
  (table) => ({
    conversationIdx: index("messages_conversation_id_idx").on(
      table.conversationId,
    ),
    authorActorIdx: index("messages_author_actor_id_idx").on(
      table.authorActorId,
    ),
    createdAtIdx: index("messages_created_at_idx").on(table.createdAt),
  }),
);

export const agentSteps = pgTable(
  "agent_steps",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateAgentStepId()),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    stepNumber: integer("step_number").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    thinkingContent: text("thinking_content"),
    textContent: text("text_content"),
    isTerminal: boolean("is_terminal").notNull().default(false),
    stopReason: text("stop_reason"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    toolExecutions: jsonb("tool_executions"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    messageIdx: index("agent_steps_message_id_idx").on(table.messageId),
    conversationIdx: index("agent_steps_conversation_id_idx").on(
      table.conversationId,
    ),
    conversationStepIdx: index(
      "agent_steps_conversation_id_step_number_idx",
    ).on(table.conversationId, table.stepNumber),
  }),
);

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

export const agentsRelations = relations(agents, ({ one }) => ({
  user: one(users, {
    fields: [agents.userId],
    references: [users.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  agentSteps: many(agentSteps),
}));

export const agentStepsRelations = relations(agentSteps, ({ one }) => ({
  message: one(messages, {
    fields: [agentSteps.messageId],
    references: [messages.id],
  }),
  conversation: one(conversations, {
    fields: [agentSteps.conversationId],
    references: [conversations.id],
  }),
}));

export const channels = pgTable(
  "channels",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateChannelId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentActorId: text("agent_actor_id").references(() => actors.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    platform: text("platform", {
      enum: ["telegram", "slack", "whatsapp", "email", "discord"],
    }).notNull(),
    capability: text("capability", {
      enum: ["notification", "chat", "bidirectional"],
    }).notNull(),

    config: jsonb("config").notNull(),

    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdx: index("channels_user_id_idx").on(table.userId),
    agentActorIdx: index("channels_agent_actor_id_idx").on(table.agentActorId),
    platformIdx: index("channels_platform_idx").on(table.platform),
    activeIdx: index("channels_is_active_idx").on(table.isActive),
    configIdx: index("channels_config_idx").using("gin", table.config),
  }),
);

export const channelsRelations = relations(channels, ({ one }) => ({
  user: one(users, { fields: [channels.userId], references: [users.id] }),
  agentActor: one(actors, {
    fields: [channels.agentActorId],
    references: [actors.id],
  }),
}));

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
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdx: index("feedback_user_id_idx").on(table.userId),
    createdAtIdx: index("feedback_created_at_idx").on(table.createdAt),
  }),
);

export const feedbackRelations = relations(feedback, ({ one }) => ({
  user: one(users, { fields: [feedback.userId], references: [users.id] }),
}));

// =============================================================================
// AI Configuration (system-wide, admin-managed)
// =============================================================================

export const aiProviders = pgTable("ai_providers", {
  id: text("id").primaryKey(),
  dialect: text("dialect", {
    enum: [
      "openai_compatible",
      "anthropic_messages",
      "cli_jsonl",
      "mlx_native",
    ],
  }).notNull(),
  baseUrl: text("base_url"),
  auth: jsonb("auth").notNull().default(sql`'{"type":"none"}'::jsonb`),
  headers: jsonb("headers"),
  engine: jsonb("engine"),
  overrides: jsonb("overrides"),
  cli: jsonb("cli"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedBy: text("updated_by").references(() => users.id, {
    onDelete: "set null",
  }),
});

export const aiModels = pgTable(
  "ai_models",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    providerId: text("provider_id")
      .notNull()
      .references(() => aiProviders.id, { onDelete: "cascade" }),
    providerModel: text("provider_model").notNull(),
    capabilities: jsonb("capabilities").notNull().default(sql`'{}'::jsonb`),
    tokenizer: jsonb("tokenizer"),
    source: jsonb("source"),
    pricing: jsonb("pricing"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: text("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => ({
    providerIdx: index("ai_models_provider_id_idx").on(table.providerId),
  }),
);

export const aiModelSelection = pgTable("ai_model_selection", {
  context: text("context").primaryKey(),
  modelId: text("model_id")
    .notNull()
    .references(() => aiModels.id, { onDelete: "cascade" }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedBy: text("updated_by").references(() => users.id, {
    onDelete: "set null",
  }),
});

export const mcpServers = pgTable("mcp_servers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  transport: text("transport", {
    enum: ["stdio", "sse", "http"],
  }).notNull(),
  command: text("command"),
  args: jsonb("args"),
  connectTimeout: integer("connect_timeout"),
  enabled: boolean("enabled").notNull().default(true),
  toolMode: text("tool_mode").default("managed"),
  availability: jsonb("availability"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedBy: text("updated_by").references(() => users.id, {
    onDelete: "set null",
  }),
});

// =============================================================================
// Instance Settings (system-wide key-value config, admin-managed)
// =============================================================================

export const instanceSettings = pgTable("instance_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedBy: text("updated_by").references(() => users.id, {
    onDelete: "set null",
  }),
});

// =============================================================================
// App Metadata (for upgrade system)
// =============================================================================

export const appMeta = pgTable("_app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
