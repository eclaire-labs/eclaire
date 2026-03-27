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
  TaskJobData,
  TaskOccurrenceJobData,
  TaskScheduleTickJobData,
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

    async enqueueTaskOccurrence(data: TaskOccurrenceJobData): Promise<void> {
      const queue: Queue | null = queueManager.getQueue(
        QueueNames.TASK_OCCURRENCE,
      );
      if (!queue) {
        logger.error(
          { queueName: QueueNames.TASK_OCCURRENCE },
          "Queue not available",
        );
        throw new Error("Task occurrence queue not available");
      }

      const requestId = getRequestId();
      const jobId = `task-occurrence:${data.occurrenceId}`;

      const delay = data.scheduledFor
        ? Math.max(0, data.scheduledFor.getTime() - Date.now())
        : 0;

      await queue.add(
        "process-task-occurrence",
        {
          ...data,
          requestId,
          __metadata: {
            assetType: "task_occurrence",
            assetId: data.occurrenceId,
            userId: data.userId,
          },
        },
        { jobId, delay },
      );

      logger.info(
        {
          occurrenceId: data.occurrenceId,
          taskId: data.taskId,
          userId: data.userId,
          queue: QueueNames.TASK_OCCURRENCE,
          jobId,
          delay,
        },
        "Task occurrence enqueued to Redis",
      );
    },

    async enqueueTaskScheduleTick(
      data: TaskScheduleTickJobData,
    ): Promise<void> {
      const queue: Queue | null = queueManager.getQueue(
        QueueNames.TASK_SCHEDULE_TICK,
      );
      if (!queue) {
        logger.error(
          { queueName: QueueNames.TASK_SCHEDULE_TICK },
          "Queue not available",
        );
        throw new Error("Task schedule tick queue not available");
      }

      const requestId = getRequestId();
      const jobId = `task-schedule-tick:${data.taskId}:${Date.now()}`;

      await queue.add(
        "process-task-schedule-tick",
        { ...data, requestId },
        { jobId },
      );

      logger.info(
        {
          taskId: data.taskId,
          userId: data.userId,
          queue: QueueNames.TASK_SCHEDULE_TICK,
          jobId,
        },
        "Task schedule tick enqueued to Redis",
      );
    },

    async close(): Promise<void> {
      logger.info({}, "BullMQ adapter close requested");
      await queueManager.close();
    },
  };
}
