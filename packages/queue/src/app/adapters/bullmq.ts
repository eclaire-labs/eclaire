/**
 * BullMQ Queue Adapter
 *
 * Redis-backed queue implementation using BullMQ for high-throughput job processing.
 */

import { getRequestId, type Logger } from "@eclaire/logger";
import type { QueueName } from "../queue-names.js";
import { QueueNames } from "../queue-names.js";
import type { QueueManager } from "../queues.js";
import type {
  BookmarkJobData,
  DocumentJobData,
  ImageJobData,
  JobData,
  NoteJobData,
  QueueAdapter,
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
    queueName: QueueName,
    jobName: string,
    assetType: string,
    assetId: string,
    userId: string,
    data: JobData,
  ): Promise<void> {
    const queue = queueManager.getQueue(queueName);
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

    async close(): Promise<void> {
      logger.info({}, "BullMQ adapter close requested");
      await queueManager.close();
    },
  };
}
