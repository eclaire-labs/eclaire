/**
 * Database Queue Adapter
 *
 * Database-backed queue implementation for zero-Redis deployments.
 * Uses the assetProcessingJobs table for job storage.
 */

import { sql } from "drizzle-orm";
import type { Logger } from "@eclaire/logger";
import type { DbInstance } from "@eclaire/db";
import type {
  QueueAdapter,
  BookmarkJobData,
  ImageJobData,
  DocumentJobData,
  NoteJobData,
  TaskJobData,
  JobData,
  AssetType,
  JobWaitlistInterface,
} from "../types.js";

export interface DatabaseAdapterConfig {
  /** Drizzle database instance */
  db: DbInstance;
  /** Database schema (postgres or sqlite) */
  schema: any;
  /** Logger instance */
  logger: Logger;
  /** Optional job waitlist for push notifications */
  waitlist?: JobWaitlistInterface;
}

/**
 * Creates a database-backed queue adapter
 */
export function createDatabaseAdapter(config: DatabaseAdapterConfig): QueueAdapter {
  const { db, schema, logger, waitlist } = config;
  const { assetProcessingJobs } = schema;

  async function enqueueJob(
    assetType: AssetType,
    assetId: string,
    userId: string,
    jobData: JobData,
    options: {
      scheduledFor?: Date;
      priority?: number;
      jobType?: string;
    } = {},
  ): Promise<void> {
    const scheduledFor = options.scheduledFor || new Date();
    const priority = options.priority || 0;
    const jobType = options.jobType || "processing";

    try {
      // Insert or update the job in the database
      // Use upsert pattern: if job exists, update it
      // All asset types use (assetType, assetId, jobType) as unique constraint
      await (db as any)
        .insert(assetProcessingJobs)
        .values({
          assetType,
          assetId,
          userId,
          jobType,
          status: "pending",
          jobData,
          scheduledFor,
          priority,
          retryCount: 0,
          maxRetries: 3,
        })
        .onConflictDoUpdate({
          target: [assetProcessingJobs.assetType, assetProcessingJobs.assetId, assetProcessingJobs.jobType],
          set: {
            status: sql`'pending'`,
            jobData: sql`EXCLUDED.job_data`,
            scheduledFor: sql`EXCLUDED.scheduled_for`,
            priority: sql`EXCLUDED.priority`,
            retryCount: 0,
            errorMessage: null,
            errorDetails: null,
            lockedBy: null,
            lockedAt: null,
            expiresAt: null,
            updatedAt: new Date(),
          },
        });

      logger.info(
        { assetType, assetId, userId, jobType },
        "Job enqueued to database queue",
      );

      // Notify waiting workers immediately (push-based notification)
      if (waitlist) {
        const notifiedCount = waitlist.notifyWaiters(assetType, 1);
        if (notifiedCount > 0) {
          logger.debug(
            { assetType, notifiedCount },
            "Notified waiting workers",
          );
        }

        // Schedule wakeup for next scheduled job if applicable
        if (scheduledFor && scheduledFor > new Date()) {
          await waitlist.scheduleNextWakeup(assetType);
        }
      }
    } catch (error) {
      logger.error(
        {
          assetType,
          assetId,
          userId,
          jobType,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to enqueue job to database",
      );
      throw error;
    }
  }

  return {
    async enqueueBookmark(data: BookmarkJobData): Promise<void> {
      await enqueueJob("bookmarks", data.bookmarkId, data.userId, data);
    },

    async enqueueImage(data: ImageJobData): Promise<void> {
      await enqueueJob("photos", data.imageId, data.userId, data);
    },

    async enqueueDocument(data: DocumentJobData): Promise<void> {
      await enqueueJob("documents", data.documentId, data.userId, data);
    },

    async enqueueNote(data: NoteJobData): Promise<void> {
      await enqueueJob("notes", data.noteId, data.userId, data);
    },

    async enqueueTask(data: TaskJobData): Promise<void> {
      await enqueueJob("tasks", data.taskId, data.userId, data, {
        scheduledFor: data.scheduledFor,
        jobType: data.jobType || "tag_generation",
      });
    },

    async close(): Promise<void> {
      logger.info({}, "Database queue adapter close requested (no-op)");
    },
  };
}
