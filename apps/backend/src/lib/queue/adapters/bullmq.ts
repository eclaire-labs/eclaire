/**
 * Eclaire-specific BullMQ Queue Adapter
 *
 * Redis-backed queue implementation using BullMQ for high-throughput job processing.
 */

import { getRequestId, type Logger } from "@eclaire/logger";
import type { QueueManager } from "@eclaire/queue/driver-bullmq";
import type { Queue } from "bullmq";
import { QueueNames } from "../queue-names.js";
import type {
  BookmarkJobData,
  DocumentJobData,
  ImageJobData,
  JobData,
  MediaJobData,
  NoteJobData,
  QueueAdapter,
  ScheduledActionJobData,
  TaskJobData,
} from "../types.js";

export interface BullMQAdapterConfig {
  /** Queue manager instance */
  queueManager: QueueManager;
  /** Logger instance */
  logger: Logger;
}

/**
 * Creates a BullMQ-based queue adapter
 */
export function createBullMQAdapter(config: BullMQAdapterConfig): QueueAdapter {
  const { queueManager, logger } = config;

  async function enqueueToRedis(
    queueName: string,
    jobName: string,
    assetType: string,
    assetId: string,
    userId: string,
    data: JobData,
  ): Promise<void> {
    const queue: Queue | null = queueManager.getQueue(queueName);
    if (!queue) {
      logger.error({ queueName }, "Queue not available");
      throw new Error("Queue not available");
    }

    const requestId = getRequestId();

    // Use assetType:assetId as jobId for deduplication — BullMQ skips
    // duplicate jobs with the same ID that are still in the queue.
    const jobId = `${assetType}:${assetId}`;

    await queue.add(
      jobName,
      {
        ...data,
        requestId,
        __metadata: {
          assetType,
          assetId,
          userId,
        },
      },
      { jobId },
    );

    logger.info(
      { assetId, userId, queue: queueName, jobId },
      `${jobName} enqueued to Redis`,
    );
  }

  return {
    async enqueueBookmark(data: BookmarkJobData): Promise<void> {
      await enqueueToRedis(
        QueueNames.BOOKMARK_PROCESSING,
        "process-bookmark",
        "bookmark",
        data.bookmarkId,
        data.userId,
        data,
      );
    },

    async enqueueImage(data: ImageJobData): Promise<void> {
      await enqueueToRedis(
        QueueNames.IMAGE_PROCESSING,
        "process-image",
        "image",
        data.imageId,
        data.userId,
        data,
      );
    },

    async enqueueDocument(data: DocumentJobData): Promise<void> {
      await enqueueToRedis(
        QueueNames.DOCUMENT_PROCESSING,
        "process-document",
        "document",
        data.documentId,
        data.userId,
        data,
      );
    },

    async enqueueNote(data: NoteJobData): Promise<void> {
      await enqueueToRedis(
        QueueNames.NOTE_PROCESSING,
        "process-note",
        "note",
        data.noteId,
        data.userId,
        data,
      );
    },

    async enqueueTask(data: TaskJobData): Promise<void> {
      await enqueueToRedis(
        QueueNames.TASK_PROCESSING,
        "process-task",
        "task",
        data.taskId,
        data.userId,
        data,
      );
    },

    async enqueueMedia(data: MediaJobData): Promise<void> {
      await enqueueToRedis(
        QueueNames.MEDIA_PROCESSING,
        "process-media",
        "media",
        data.mediaId,
        data.userId,
        data,
      );
    },

    async enqueueScheduledAction(data: ScheduledActionJobData): Promise<void> {
      const queue: Queue | null = queueManager.getQueue(
        QueueNames.SCHEDULED_ACTION_EXECUTION,
      );
      if (!queue) {
        logger.error(
          { queueName: QueueNames.SCHEDULED_ACTION_EXECUTION },
          "Queue not available",
        );
        throw new Error("Scheduled action queue not available");
      }

      const requestId = getRequestId();
      const jobId = `scheduled-action:${data.scheduledActionId}`;

      // Calculate delay from scheduledFor
      const delay = data.scheduledFor
        ? Math.max(0, data.scheduledFor.getTime() - Date.now())
        : 0;

      await queue.add(
        "process-scheduled-action",
        {
          ...data,
          requestId,
          __metadata: {
            assetType: "scheduled_action",
            assetId: data.scheduledActionId,
            userId: data.userId,
          },
        },
        { jobId, delay },
      );

      logger.info(
        {
          scheduledActionId: data.scheduledActionId,
          userId: data.userId,
          queue: QueueNames.SCHEDULED_ACTION_EXECUTION,
          jobId,
          delay,
        },
        "Scheduled action enqueued to Redis",
      );
    },

    async close(): Promise<void> {
      logger.info({}, "BullMQ adapter close requested");
      await queueManager.close();
    },
  };
}
