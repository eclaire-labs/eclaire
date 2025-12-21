/**
 * Database Queue Adapter
 *
 * Database-backed queue implementation for zero-Redis deployments.
 * Uses the queue_jobs table (via driver-db) for job storage.
 */

import { type Logger, getRequestId } from "@eclaire/logger";
import type { DbInstance } from "@eclaire/db";
import type { QueueClient } from "../../core/types.js";
import { createDbQueueClient } from "../../driver-db/client.js";
import { getQueueSchema } from "../../driver-db/schema.js";
import { QueueNames } from "../queue-names.js";
import type {
  QueueAdapter,
  BookmarkJobData,
  ImageJobData,
  DocumentJobData,
  NoteJobData,
  TaskJobData,
  AssetType,
  JobWaitlistInterface,
} from "../types.js";

export interface DatabaseAdapterConfig {
  /** Drizzle database instance */
  db: DbInstance;
  /** Database type: 'postgres' or 'sqlite' */
  dbType: "postgres" | "sqlite";
  /** Logger instance */
  logger: Logger;
  /** Optional job waitlist for push notifications */
  waitlist?: JobWaitlistInterface;
}

/**
 * Map asset type to queue name
 */
function getQueueName(assetType: AssetType, jobType?: string): string {
  if (assetType === "tasks" && jobType === "execution") {
    return QueueNames.TASK_EXECUTION_PROCESSING;
  }

  const mapping: Record<AssetType, string> = {
    bookmarks: QueueNames.BOOKMARK_PROCESSING,
    photos: QueueNames.IMAGE_PROCESSING,
    documents: QueueNames.DOCUMENT_PROCESSING,
    notes: QueueNames.NOTE_PROCESSING,
    tasks: QueueNames.TASK_PROCESSING,
  };

  return mapping[assetType];
}

/**
 * Creates a database-backed queue adapter
 */
export function createDatabaseAdapter(config: DatabaseAdapterConfig): QueueAdapter {
  const { db, dbType, logger, waitlist } = config;

  // Get the appropriate schema for the database type
  const schema = getQueueSchema(dbType);

  // Create the underlying queue client
  const queueClient: QueueClient = createDbQueueClient({
    db,
    schema,
    capabilities: {
      skipLocked: dbType === "postgres",
      notify: false, // Will be handled via waitlist instead
      jsonb: dbType === "postgres",
      type: dbType,
    },
    logger,
  });

  /**
   * Enqueue a job with metadata for SSE notifications
   */
  async function enqueueJob(
    assetType: AssetType,
    assetId: string,
    userId: string,
    data: Record<string, unknown>,
    options: {
      scheduledFor?: Date;
      priority?: number;
      jobType?: string;
    } = {},
  ): Promise<void> {
    const queueName = getQueueName(assetType, options.jobType);

    // Use assetType:assetId as the idempotency key
    // This replaces the old (assetType, assetId, jobType) unique constraint
    const key = `${assetType}:${assetId}`;

    // Get requestId from AsyncLocalStorage (set by HTTP middleware)
    const requestId = getRequestId();

    try {
      await queueClient.enqueue(queueName, { ...data, requestId }, {
        key,
        priority: options.priority || 0,
        runAt: options.scheduledFor,
        // Store asset info in metadata for SSE event callbacks
        metadata: {
          userId,
          assetType,
          assetId,
        },
      });

      logger.info(
        { queueName, assetType, assetId, userId, key },
        "Job enqueued to queue_jobs",
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
        if (options.scheduledFor && options.scheduledFor > new Date()) {
          await waitlist.scheduleNextWakeup(assetType);
        }
      }
    } catch (error) {
      logger.error(
        {
          queueName,
          assetType,
          assetId,
          userId,
          key,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to enqueue job",
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
      await queueClient.close();
      logger.info({}, "Database queue adapter closed");
    },
  };
}
