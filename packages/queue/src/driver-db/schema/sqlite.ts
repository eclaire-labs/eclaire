/**
 * @eclaire/queue - SQLite schema for the queue system
 *
 * This file contains ONLY SQLite table definitions.
 * Used by drizzle-kit for SQLite migrations.
 */

import {
  index,
  integer as sqliteInteger,
  sqliteTable,
  text as sqliteText,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Main job queue table for SQLite
 */
export const queueJobsSqlite = sqliteTable(
  "queue_jobs",
  {
    id: sqliteText("id").primaryKey(),
    queue: sqliteText("queue").notNull(),
    key: sqliteText("key"),
    data: sqliteText("data", { mode: "json" }).notNull(),
    status: sqliteText("status", {
      enum: ["pending", "processing", "completed", "failed", "retry_pending"],
    })
      .notNull()
      .default("pending"),
    priority: sqliteInteger("priority").notNull().default(0),
    scheduledFor: sqliteInteger("scheduled_for", { mode: "timestamp_ms" }),
    attempts: sqliteInteger("attempts").notNull().default(0),
    maxAttempts: sqliteInteger("max_attempts").notNull().default(3),
    nextRetryAt: sqliteInteger("next_retry_at", { mode: "timestamp_ms" }),
    backoffMs: sqliteInteger("backoff_ms"),
    backoffType: sqliteText("backoff_type"),
    lockedBy: sqliteText("locked_by"),
    lockedAt: sqliteInteger("locked_at", { mode: "timestamp_ms" }),
    expiresAt: sqliteInteger("expires_at", { mode: "timestamp_ms" }),
    lockToken: sqliteText("lock_token"),
    errorMessage: sqliteText("error_message"),
    errorDetails: sqliteText("error_details", { mode: "json" }),
    createdAt: sqliteInteger("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: sqliteInteger("updated_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: sqliteInteger("completed_at", { mode: "timestamp_ms" }),

    // ---- Multi-stage progress tracking (optional) ----

    /** Processing stages for multi-stage jobs (array of JobStage objects) */
    stages: sqliteText("stages", { mode: "json" }),

    /** Name of the stage currently being processed */
    currentStage: sqliteText("current_stage"),

    /** Overall progress across all stages (0-100) */
    overallProgress: sqliteInteger("overall_progress").default(0),

    /** Application-specific metadata (e.g., userId, assetType, assetId) */
    metadata: sqliteText("metadata", { mode: "json" }),
  },
  (table) => ({
    queueKeyIdx: uniqueIndex("queue_jobs_queue_key_idx").on(
      table.queue,
      table.key,
    ),
    queueStatusIdx: index("queue_jobs_queue_status_idx").on(
      table.queue,
      table.status,
    ),
    statusScheduledIdx: index("queue_jobs_status_scheduled_idx").on(
      table.status,
      table.scheduledFor,
    ),
    statusRetryIdx: index("queue_jobs_status_retry_idx").on(
      table.status,
      table.nextRetryAt,
    ),
    statusExpiresIdx: index("queue_jobs_status_expires_idx").on(
      table.status,
      table.expiresAt,
    ),
  }),
);

/**
 * Recurring job schedules table for SQLite
 */
export const queueSchedulesSqlite = sqliteTable(
  "queue_schedules",
  {
    id: sqliteText("id").primaryKey(),
    queue: sqliteText("queue").notNull(),
    key: sqliteText("key").notNull().unique(),
    cron: sqliteText("cron").notNull(),
    data: sqliteText("data", { mode: "json" }).notNull(),
    enabled: sqliteInteger("enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    lastRunAt: sqliteInteger("last_run_at", { mode: "timestamp_ms" }),
    nextRunAt: sqliteInteger("next_run_at", { mode: "timestamp_ms" }),
    runLimit: sqliteInteger("run_limit"),
    runCount: sqliteInteger("run_count").notNull().default(0),
    endDate: sqliteInteger("end_date", { mode: "timestamp_ms" }),
    createdAt: sqliteInteger("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: sqliteInteger("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    enabledNextRunIdx: index("queue_schedules_enabled_next_run_idx").on(
      table.enabled,
      table.nextRunAt,
    ),
  }),
);

// Type exports
export type QueueJobSqlite = typeof queueJobsSqlite.$inferSelect;
export type NewQueueJobSqlite = typeof queueJobsSqlite.$inferInsert;
export type QueueScheduleSqlite = typeof queueSchedulesSqlite.$inferSelect;
export type NewQueueScheduleSqlite = typeof queueSchedulesSqlite.$inferInsert;
