/**
 * Eclaire-specific Database Queue Adapter
 *
 * Database-backed queue implementation for zero-Redis deployments.
 * Uses the queue_jobs table (via driver-db) for job storage.
 */

import { getErrorMessage } from "@eclaire/queue";
import type { QueueClient } from "@eclaire/queue/core";
import { createDbQueueClient, getQueueSchema } from "@eclaire/queue/driver-db";
import type { NotifyEmitter } from "@eclaire/queue/driver-db";
import { getRequestId, type Logger } from "@eclaire/logger";
import type { DbInstance } from "@eclaire/db";
import { QueueNames } from "../queue-names.js";
import type {
  AssetType,
  BookmarkJobData,
  DocumentJobData,
  ImageJobData,
  MediaJobData,
  NoteJobData,
  QueueAdapter,
  TaskJobData,
  TaskOccurrenceJobData,
  TaskScheduleTickJobData,
} from "../types.js";

export interface DatabaseAdapterConfig {
  /** Drizzle database instance */
  db: DbInstance;
  /** Database type: 'postgres' or 'sqlite' */
  dbType: "postgres" | "sqlite";
  /** Logger instance */
  logger: Logger;
  /** Optional notify emitter for instant worker wakeup */
  notifyEmitter?: NotifyEmitter;
}

/**
 * Map asset type to queue name
 */
function getQueueName(assetType: AssetType, _jobType?: string): string {
  const mapping: Record<AssetType, string> = {
    bookmarks: QueueNames.BOOKMARK_PROCESSING,
    photos: QueueNames.IMAGE_PROCESSING,
    documents: QueueNames.DOCUMENT_PROCESSING,
    notes: QueueNames.NOTE_PROCESSING,
    tasks: QueueNames.TASK_PROCESSING,
    media: QueueNames.MEDIA_PROCESSING,
  };

  return mapping[assetType];
}

/**
 * Creates a database-backed queue adapter
 */
export function createDatabaseAdapter(
  config: DatabaseAdapterConfig,
): QueueAdapter {
  const { db, dbType, logger, notifyEmitter } = config;

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
    const key = `${assetType}:${assetId}`;

    // Get requestId from AsyncLocalStorage (set by HTTP middleware)
    const requestId = getRequestId();

    try {
      await queueClient.enqueue(
        queueName,
        { ...data, requestId },
        {
          key,
          priority: options.priority || 0,
          runAt: options.scheduledFor,
          // Store asset info in metadata for SSE event callbacks
          metadata: {
            userId,
            assetType,
            assetId,
          },
        },
      );

      logger.info(
        { queueName, assetType, assetId, userId, key },
        "Job enqueued to queue_jobs",
      );

      // Notify waiting workers immediately (push-based notification)
      if (notifyEmitter) {
        await notifyEmitter.emit(queueName);
        logger.debug({ queueName }, "Emitted job notification");
      }
    } catch (error) {
      logger.error(
        {
          queueName,
          assetType,
          assetId,
          userId,
          key,
          error: getErrorMessage(error),
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

    async enqueueMedia(data: MediaJobData): Promise<void> {
      await enqueueJob("media", data.mediaId, data.userId, data);
    },

    async enqueueTaskOccurrence(data: TaskOccurrenceJobData): Promise<void> {
      const queueName = QueueNames.TASK_OCCURRENCE;
      const key = `task-occurrence:${data.occurrenceId}`;
      const requestId = getRequestId();

      try {
        await queueClient.enqueue(
          queueName,
          { ...data, requestId },
          {
            key,
            priority: 0,
            runAt: data.scheduledFor,
            metadata: {
              userId: data.userId,
              assetType: "task_occurrence",
              assetId: data.occurrenceId,
            },
          },
        );

        logger.info(
          {
            queueName,
            occurrenceId: data.occurrenceId,
            taskId: data.taskId,
            userId: data.userId,
          },
          "Task occurrence job enqueued",
        );

        if (notifyEmitter) {
          await notifyEmitter.emit(queueName);
        }
      } catch (error) {
        logger.error(
          {
            queueName,
            occurrenceId: data.occurrenceId,
            error: getErrorMessage(error),
          },
          "Failed to enqueue task occurrence job",
        );
        throw error;
      }
    },

    async enqueueTaskScheduleTick(
      data: TaskScheduleTickJobData,
    ): Promise<void> {
      const queueName = QueueNames.TASK_SCHEDULE_TICK;
      const key = `task-schedule-tick:${data.taskId}:${Date.now()}`;
      const requestId = getRequestId();

      try {
        await queueClient.enqueue(
          queueName,
          { ...data, requestId },
          {
            key,
            priority: 0,
            metadata: {
              userId: data.userId,
              assetType: "task_schedule_tick",
              assetId: data.taskId,
            },
          },
        );

        logger.info(
          {
            queueName,
            taskId: data.taskId,
            userId: data.userId,
          },
          "Task schedule tick job enqueued",
        );

        if (notifyEmitter) {
          await notifyEmitter.emit(queueName);
        }
      } catch (error) {
        logger.error(
          {
            queueName,
            taskId: data.taskId,
            error: getErrorMessage(error),
          },
          "Failed to enqueue task schedule tick job",
        );
        throw error;
      }
    },

    async close(): Promise<void> {
      await queueClient.close();
      logger.info({}, "Database queue adapter closed");
    },
  };
}
