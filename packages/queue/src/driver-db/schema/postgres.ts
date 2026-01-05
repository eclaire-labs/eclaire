/**
 * @eclaire/queue - PostgreSQL schema for the queue system
 *
 * This file contains ONLY PostgreSQL table definitions.
 * Used by drizzle-kit for PostgreSQL migrations.
 */

import {
  pgTable,
  index as pgIndex,
  integer as pgInteger,
  text as pgText,
  timestamp as pgTimestamp,
  jsonb as pgJsonb,
  uniqueIndex as pgUniqueIndex,
  boolean as pgBoolean,
} from "drizzle-orm/pg-core";

/**
 * Main job queue table for PostgreSQL
 *
 * This table handles all queue operations: enqueue, claim, retry, complete, fail.
 * It is optimized for high-throughput queue operations with proper indexes.
 */
export const queueJobsPg = pgTable(
  "queue_jobs",
  {
    /** Unique job identifier */
    id: pgText("id").primaryKey(),

    /** Queue name (e.g., "bookmark-processing") */
    queue: pgText("queue").notNull(),

    /** Idempotency key for deduplication (optional) */
    key: pgText("key"),

    /** Job payload (arbitrary JSON) */
    data: pgJsonb("data").notNull(),

    /** Current job status */
    status: pgText("status", {
      enum: ["pending", "processing", "completed", "failed", "retry_pending"],
    })
      .notNull()
      .default("pending"),

    /** Job priority (higher = processed first) */
    priority: pgInteger("priority").notNull().default(0),

    /** When the job should become available (null = immediately) */
    scheduledFor: pgTimestamp("scheduled_for", { withTimezone: true }),

    /** Number of times this job has been attempted */
    attempts: pgInteger("attempts").notNull().default(0),

    /** Maximum retry attempts before permanent failure */
    maxAttempts: pgInteger("max_attempts").notNull().default(3),

    /** When the next retry should happen (for retry_pending jobs) */
    nextRetryAt: pgTimestamp("next_retry_at", { withTimezone: true }),

    /** Base backoff delay in ms (for calculating retry delays) */
    backoffMs: pgInteger("backoff_ms"),

    /** Backoff type: 'exponential', 'linear', 'fixed' */
    backoffType: pgText("backoff_type"),

    /** Worker ID that currently holds the lock */
    lockedBy: pgText("locked_by"),

    /** When the job was locked */
    lockedAt: pgTimestamp("locked_at", { withTimezone: true }),

    /** When the lock expires (for stale job recovery) */
    expiresAt: pgTimestamp("expires_at", { withTimezone: true }),

    /** Fencing token for preventing stale worker completion */
    lockToken: pgText("lock_token"),

    /** Error message from last failure */
    errorMessage: pgText("error_message"),

    /** Additional error details (stack trace, etc.) */
    errorDetails: pgJsonb("error_details"),

    /** When the job was created */
    createdAt: pgTimestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** When the job was last updated */
    updatedAt: pgTimestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** When the job completed (success or permanent failure) */
    completedAt: pgTimestamp("completed_at", { withTimezone: true }),

    // ---- Multi-stage progress tracking (optional) ----

    /** Processing stages for multi-stage jobs (array of JobStage objects) */
    stages: pgJsonb("stages"),

    /** Name of the stage currently being processed */
    currentStage: pgText("current_stage"),

    /** Overall progress across all stages (0-100) */
    overallProgress: pgInteger("overall_progress").default(0),

    /** Application-specific metadata (e.g., userId, assetType, assetId) */
    metadata: pgJsonb("metadata"),
  },
  (table) => ({
    /** Unique constraint for idempotent enqueue */
    queueKeyIdx: pgUniqueIndex("queue_jobs_queue_key_idx").on(table.queue, table.key),

    /** Index for claim query: find pending/retry_pending jobs by queue */
    queueStatusIdx: pgIndex("queue_jobs_queue_status_idx").on(table.queue, table.status),

    /** Index for scheduled jobs */
    statusScheduledIdx: pgIndex("queue_jobs_status_scheduled_idx").on(
      table.status,
      table.scheduledFor,
    ),

    /** Index for retry jobs */
    statusRetryIdx: pgIndex("queue_jobs_status_retry_idx").on(
      table.status,
      table.nextRetryAt,
    ),

    /** Index for expired locks (stale job recovery) */
    statusExpiresIdx: pgIndex("queue_jobs_status_expires_idx").on(
      table.status,
      table.expiresAt,
    ),
  }),
);

/**
 * Recurring job schedules table for PostgreSQL
 *
 * Stores cron schedules that automatically enqueue jobs.
 */
export const queueSchedulesPg = pgTable(
  "queue_schedules",
  {
    /** Unique schedule identifier */
    id: pgText("id").primaryKey(),

    /** Queue name to enqueue jobs to */
    queue: pgText("queue").notNull(),

    /** Unique schedule key (for upsert) */
    key: pgText("key").notNull().unique(),

    /** Cron expression (e.g., "0 * * * *" for hourly) */
    cron: pgText("cron").notNull(),

    /** Job payload template */
    data: pgJsonb("data").notNull(),

    /** Whether the schedule is active */
    enabled: pgBoolean("enabled").notNull().default(true),

    /** When the schedule last ran */
    lastRunAt: pgTimestamp("last_run_at", { withTimezone: true }),

    /** When the schedule should next run */
    nextRunAt: pgTimestamp("next_run_at", { withTimezone: true }),

    /** Maximum number of runs (null = unlimited) */
    runLimit: pgInteger("run_limit"),

    /** How many times the schedule has run */
    runCount: pgInteger("run_count").notNull().default(0),

    /** When the schedule should stop creating jobs (null = no end date) */
    endDate: pgTimestamp("end_date", { withTimezone: true }),

    /** When the schedule was created */
    createdAt: pgTimestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** When the schedule was last updated */
    updatedAt: pgTimestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    /** Index for finding schedules due to run */
    enabledNextRunIdx: pgIndex("queue_schedules_enabled_next_run_idx").on(
      table.enabled,
      table.nextRunAt,
    ),
  }),
);

// Type exports
export type QueueJobPg = typeof queueJobsPg.$inferSelect;
export type NewQueueJobPg = typeof queueJobsPg.$inferInsert;
export type QueueSchedulePg = typeof queueSchedulesPg.$inferSelect;
export type NewQueueSchedulePg = typeof queueSchedulesPg.$inferInsert;
