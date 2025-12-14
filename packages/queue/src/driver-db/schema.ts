/**
 * @eclaire/queue/driver-db - Database schema for the queue system
 *
 * This schema is database-agnostic and works with both PostgreSQL and SQLite.
 * It defines two tables:
 * - queue_jobs: Main job queue table
 * - queue_schedules: Recurring job schedules
 */

import {
  index,
  integer,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
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
import { sqliteTable, integer as sqliteInteger, text as sqliteText } from "drizzle-orm/sqlite-core";

// ============================================================================
// PostgreSQL Schema
// ============================================================================

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

    /** Queue/job type name (e.g., "bookmark-processing") */
    name: pgText("name").notNull(),

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
    scheduledFor: pgTimestamp("scheduled_for"),

    /** Number of times this job has been attempted */
    attempts: pgInteger("attempts").notNull().default(0),

    /** Maximum retry attempts before permanent failure */
    maxAttempts: pgInteger("max_attempts").notNull().default(3),

    /** When the next retry should happen (for retry_pending jobs) */
    nextRetryAt: pgTimestamp("next_retry_at"),

    /** Base backoff delay in ms (for calculating retry delays) */
    backoffMs: pgInteger("backoff_ms"),

    /** Backoff type: 'exponential', 'linear', 'fixed' */
    backoffType: pgText("backoff_type"),

    /** Worker ID that currently holds the lock */
    lockedBy: pgText("locked_by"),

    /** When the job was locked */
    lockedAt: pgTimestamp("locked_at"),

    /** When the lock expires (for stale job recovery) */
    expiresAt: pgTimestamp("expires_at"),

    /** Fencing token for preventing stale worker completion */
    lockToken: pgText("lock_token"),

    /** Error message from last failure */
    errorMessage: pgText("error_message"),

    /** Additional error details (stack trace, etc.) */
    errorDetails: pgJsonb("error_details"),

    /** When the job was created */
    createdAt: pgTimestamp("created_at").notNull().defaultNow(),

    /** When the job was last updated */
    updatedAt: pgTimestamp("updated_at").notNull().defaultNow(),

    /** When the job completed (success or permanent failure) */
    completedAt: pgTimestamp("completed_at"),
  },
  (table) => ({
    /** Unique constraint for idempotent enqueue */
    nameKeyIdx: pgUniqueIndex("queue_jobs_name_key_idx").on(table.name, table.key),

    /** Index for claim query: find pending/retry_pending jobs by name */
    nameStatusIdx: pgIndex("queue_jobs_name_status_idx").on(table.name, table.status),

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
    name: pgText("name").notNull(),

    /** Unique schedule key (for upsert) */
    key: pgText("key").notNull().unique(),

    /** Cron expression (e.g., "0 * * * *" for hourly) */
    cron: pgText("cron").notNull(),

    /** Job payload template */
    data: pgJsonb("data").notNull(),

    /** Whether the schedule is active */
    enabled: pgBoolean("enabled").notNull().default(true),

    /** When the schedule last ran */
    lastRunAt: pgTimestamp("last_run_at"),

    /** When the schedule should next run */
    nextRunAt: pgTimestamp("next_run_at"),

    /** Maximum number of runs (null = unlimited) */
    runLimit: pgInteger("run_limit"),

    /** How many times the schedule has run */
    runCount: pgInteger("run_count").notNull().default(0),

    /** When the schedule should stop creating jobs (null = no end date) */
    endDate: pgTimestamp("end_date"),

    /** When the schedule was created */
    createdAt: pgTimestamp("created_at").notNull().defaultNow(),

    /** When the schedule was last updated */
    updatedAt: pgTimestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    /** Index for finding schedules due to run */
    enabledNextRunIdx: pgIndex("queue_schedules_enabled_next_run_idx").on(
      table.enabled,
      table.nextRunAt,
    ),
  }),
);

// ============================================================================
// SQLite Schema
// ============================================================================

/**
 * Main job queue table for SQLite
 */
export const queueJobsSqlite = sqliteTable(
  "queue_jobs",
  {
    id: sqliteText("id").primaryKey(),
    name: sqliteText("name").notNull(),
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
  },
  (table) => ({
    nameKeyIdx: uniqueIndex("queue_jobs_name_key_idx").on(table.name, table.key),
    nameStatusIdx: index("queue_jobs_name_status_idx").on(table.name, table.status),
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
    name: sqliteText("name").notNull(),
    key: sqliteText("key").notNull().unique(),
    cron: sqliteText("cron").notNull(),
    data: sqliteText("data", { mode: "json" }).notNull(),
    enabled: sqliteInteger("enabled", { mode: "boolean" }).notNull().default(true),
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

// ============================================================================
// Type Exports
// ============================================================================

/** PostgreSQL queue job row type */
export type QueueJobPg = typeof queueJobsPg.$inferSelect;
export type NewQueueJobPg = typeof queueJobsPg.$inferInsert;

/** PostgreSQL queue schedule row type */
export type QueueSchedulePg = typeof queueSchedulesPg.$inferSelect;
export type NewQueueSchedulePg = typeof queueSchedulesPg.$inferInsert;

/** SQLite queue job row type */
export type QueueJobSqlite = typeof queueJobsSqlite.$inferSelect;
export type NewQueueJobSqlite = typeof queueJobsSqlite.$inferInsert;

/** SQLite queue schedule row type */
export type QueueScheduleSqlite = typeof queueSchedulesSqlite.$inferSelect;
export type NewQueueScheduleSqlite = typeof queueSchedulesSqlite.$inferInsert;

// ============================================================================
// Schema Factory
// ============================================================================

/**
 * Get the appropriate schema based on database type
 */
export function getQueueSchema(dbType: "postgres" | "sqlite") {
  if (dbType === "postgres") {
    return {
      queueJobs: queueJobsPg,
      queueSchedules: queueSchedulesPg,
    };
  }
  return {
    queueJobs: queueJobsSqlite,
    queueSchedules: queueSchedulesSqlite,
  };
}

// Export a union type for the job table
export type QueueJobsTable = typeof queueJobsPg | typeof queueJobsSqlite;
export type QueueSchedulesTable = typeof queueSchedulesPg | typeof queueSchedulesSqlite;
