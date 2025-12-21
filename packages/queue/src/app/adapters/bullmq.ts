/**
 * BullMQ Queue Adapter
 *
 * Redis-backed queue implementation using BullMQ for high-throughput job processing.
 */

import { type Logger, getRequestId } from "@eclaire/logger";
import type { QueueManager } from "../queues.js";
import { QueueNames } from "../queue-names.js";
import type {
  QueueAdapter,
  BookmarkJobData,
  ImageJobData,
  DocumentJobData,
  NoteJobData,
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

  return {
    async enqueueBookmark(data: BookmarkJobData): Promise<void> {
      const queue = queueManager.getQueue(QueueNames.BOOKMARK_PROCESSING);
      if (!queue) {
        logger.error({}, "Failed to get bookmark processing queue");
        throw new Error("Queue not available");
      }

      // Get requestId from AsyncLocalStorage (set by HTTP middleware)
      const requestId = getRequestId();

      // Job options inherited from queue's defaultJobOptions
      await queue.add("process-bookmark", {
        ...data,
        requestId,
        __metadata: { assetType: "bookmark", assetId: data.bookmarkId, userId: data.userId },
      });

      logger.info(
        { bookmarkId: data.bookmarkId, userId: data.userId },
        "Bookmark job enqueued to Redis",
      );
    },

    async enqueueImage(data: ImageJobData): Promise<void> {
      const queue = queueManager.getQueue(QueueNames.IMAGE_PROCESSING);
      if (!queue) {
        logger.error({}, "Failed to get image processing queue");
        throw new Error("Queue not available");
      }

      const requestId = getRequestId();

      await queue.add("process-image", {
        ...data,
        requestId,
        __metadata: { assetType: "image", assetId: data.imageId, userId: data.userId },
      });

      logger.info(
        { imageId: data.imageId, userId: data.userId },
        "Image job enqueued to Redis",
      );
    },

    async enqueueDocument(data: DocumentJobData): Promise<void> {
      const queue = queueManager.getQueue(QueueNames.DOCUMENT_PROCESSING);
      if (!queue) {
        logger.error({}, "Failed to get document processing queue");
        throw new Error("Queue not available");
      }

      const requestId = getRequestId();

      await queue.add("process-document", {
        ...data,
        requestId,
        __metadata: { assetType: "document", assetId: data.documentId, userId: data.userId },
      });

      logger.info(
        { documentId: data.documentId, userId: data.userId },
        "Document job enqueued to Redis",
      );
    },

    async enqueueNote(data: NoteJobData): Promise<void> {
      const queue = queueManager.getQueue(QueueNames.NOTE_PROCESSING);
      if (!queue) {
        logger.error({}, "Failed to get note processing queue");
        throw new Error("Queue not available");
      }

      const requestId = getRequestId();

      await queue.add("process-note", {
        ...data,
        requestId,
        __metadata: { assetType: "note", assetId: data.noteId, userId: data.userId },
      });

      logger.info(
        { noteId: data.noteId, userId: data.userId },
        "Note job enqueued to Redis",
      );
    },

    async enqueueTask(data: TaskJobData): Promise<void> {
      const queue = queueManager.getQueue(QueueNames.TASK_PROCESSING);
      if (!queue) {
        logger.error({}, "Failed to get task processing queue");
        throw new Error("Queue not available");
      }

      const requestId = getRequestId();

      await queue.add("process-task", {
        ...data,
        requestId,
        __metadata: { assetType: "task", assetId: data.taskId, userId: data.userId },
      });

      logger.info(
        { taskId: data.taskId, userId: data.userId },
        "Task job enqueued to Redis",
      );
    },

    async close(): Promise<void> {
      logger.info({}, "BullMQ adapter close requested");
      await queueManager.close();
    },
  };
}
