// Queue adapter abstraction layer
// Allows switching between Redis/BullMQ and database-backed queue implementations

import { Queue } from "bullmq";
import { db } from "@/db";
import { assetProcessingJobs } from "@/db/schema";
import { sql, eq, and, lte } from "drizzle-orm";
import { getQueue, QueueNames } from "./queues";
import { createChildLogger } from "./logger";
import { jobWaitlist, type AssetType } from "./job-waitlist";

const logger = createChildLogger("queue-adapter");

// --- Queue Adapter Interface ---

export interface JobData {
  [key: string]: any;
}

export interface BookmarkJobData extends JobData {
  bookmarkId: string;
  url: string;
  userId: string;
}

export interface ImageJobData extends JobData {
  imageId: string;
  userId: string;
  photoId?: string; // Alias for imageId used by worker
  storageId?: string;
  mimeType?: string;
  originalFilename?: string;
}

export interface DocumentJobData extends JobData {
  documentId: string;
  userId: string;
  storageId?: string;
  mimeType?: string;
  originalFilename?: string;
}

export interface NoteJobData extends JobData {
  noteId: string;
  userId: string;
  title?: string;
  content?: string;
}

export interface TaskJobData extends JobData {
  taskId: string;
  userId: string;
  title?: string;
  description?: string;
}

export interface QueueAdapter {
  enqueueBookmark(data: BookmarkJobData): Promise<void>;
  enqueueImage(data: ImageJobData): Promise<void>;
  enqueueDocument(data: DocumentJobData): Promise<void>;
  enqueueNote(data: NoteJobData): Promise<void>;
  enqueueTask(data: TaskJobData): Promise<void>;
  close(): Promise<void>;
}

// --- BullMQ Adapter (Current Implementation) ---

export class BullMQAdapter implements QueueAdapter {
  async enqueueBookmark(data: BookmarkJobData): Promise<void> {
    const queue = getQueue(QueueNames.BOOKMARK_PROCESSING);
    if (!queue) {
      logger.error({}, "Failed to get bookmark processing queue");
      throw new Error("Queue not available");
    }

    await queue.add("process-bookmark", data, {
      removeOnComplete: {
        age: 3600 * 24, // Keep completed jobs for 24 hours
        count: 1000,
      },
      removeOnFail: false,
    });

    logger.info(
      { bookmarkId: data.bookmarkId, userId: data.userId },
      "Bookmark job enqueued to Redis",
    );
  }

  async enqueueImage(data: ImageJobData): Promise<void> {
    const queue = getQueue(QueueNames.IMAGE_PROCESSING);
    if (!queue) {
      logger.error({}, "Failed to get image processing queue");
      throw new Error("Queue not available");
    }

    await queue.add("process-image", data, {
      removeOnComplete: {
        age: 3600 * 24,
        count: 1000,
      },
      removeOnFail: false,
    });

    logger.info(
      { imageId: data.imageId, userId: data.userId },
      "Image job enqueued to Redis",
    );
  }

  async enqueueDocument(data: DocumentJobData): Promise<void> {
    const queue = getQueue(QueueNames.DOCUMENT_PROCESSING);
    if (!queue) {
      logger.error({}, "Failed to get document processing queue");
      throw new Error("Queue not available");
    }

    await queue.add("process-document", data, {
      removeOnComplete: {
        age: 3600 * 24,
        count: 1000,
      },
      removeOnFail: false,
    });

    logger.info(
      { documentId: data.documentId, userId: data.userId },
      "Document job enqueued to Redis",
    );
  }

  async enqueueNote(data: NoteJobData): Promise<void> {
    const queue = getQueue(QueueNames.NOTE_PROCESSING);
    if (!queue) {
      logger.error({}, "Failed to get note processing queue");
      throw new Error("Queue not available");
    }

    await queue.add("process-note", data, {
      removeOnComplete: {
        age: 3600 * 24,
        count: 1000,
      },
      removeOnFail: false,
    });

    logger.info(
      { noteId: data.noteId, userId: data.userId },
      "Note job enqueued to Redis",
    );
  }

  async enqueueTask(data: TaskJobData): Promise<void> {
    const queue = getQueue(QueueNames.TASK_PROCESSING);
    if (!queue) {
      logger.error({}, "Failed to get task processing queue");
      throw new Error("Queue not available");
    }

    await queue.add("process-task", data, {
      removeOnComplete: {
        age: 3600 * 24,
        count: 1000,
      },
      removeOnFail: false,
    });

    logger.info(
      { taskId: data.taskId, userId: data.userId },
      "Task job enqueued to Redis",
    );
  }

  async close(): Promise<void> {
    // BullMQ queues are closed via the closeQueues function
    logger.info({}, "BullMQ adapter close requested (handled by queues module)");
  }
}

// --- Database Queue Adapter (New Implementation) ---

export class DatabaseQueueAdapter implements QueueAdapter {
  private async enqueueJob(
    assetType: "bookmarks" | "photos" | "documents" | "notes" | "tasks",
    assetId: string,
    userId: string,
    jobData: JobData,
    options: {
      scheduledFor?: Date;
      priority?: number;
    } = {},
  ): Promise<void> {
    const scheduledFor = options.scheduledFor || new Date();
    const priority = options.priority || 0;

    try {
      // Insert or update the job in the database
      // Use upsert pattern: if job exists, update it
      await db
        .insert(assetProcessingJobs)
        .values({
          assetType,
          assetId,
          userId,
          status: "pending",
          jobData,
          scheduledFor,
          priority,
          retryCount: 0,
          maxRetries: 3,
        })
        .onConflictDoUpdate({
          target: [assetProcessingJobs.assetType, assetProcessingJobs.assetId],
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
        { assetType, assetId, userId },
        "Job enqueued to database queue",
      );

      // Notify waiting workers immediately (push-based notification)
      const notifiedCount = jobWaitlist.notifyWaiters(assetType as AssetType, 1);
      if (notifiedCount > 0) {
        logger.debug(
          { assetType, notifiedCount },
          "Notified waiting workers",
        );
      }

      // Schedule wakeup for next scheduled job if applicable
      if (scheduledFor && scheduledFor > new Date()) {
        await jobWaitlist.scheduleNextWakeup(assetType as AssetType);
      }
    } catch (error) {
      logger.error(
        {
          assetType,
          assetId,
          userId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to enqueue job to database",
      );
      throw error;
    }
  }

  async enqueueBookmark(data: BookmarkJobData): Promise<void> {
    await this.enqueueJob("bookmarks", data.bookmarkId, data.userId, data);
  }

  async enqueueImage(data: ImageJobData): Promise<void> {
    await this.enqueueJob("photos", data.imageId, data.userId, data);
  }

  async enqueueDocument(data: DocumentJobData): Promise<void> {
    await this.enqueueJob("documents", data.documentId, data.userId, data);
  }

  async enqueueNote(data: NoteJobData): Promise<void> {
    await this.enqueueJob("notes", data.noteId, data.userId, data);
  }

  async enqueueTask(data: TaskJobData): Promise<void> {
    await this.enqueueJob("tasks", data.taskId, data.userId, data);
  }

  async close(): Promise<void> {
    logger.info({}, "Database queue adapter close requested (no-op)");
  }
}

// --- Factory Function ---

let queueAdapterInstance: QueueAdapter | null = null;

export function getQueueAdapter(): QueueAdapter {
  if (!queueAdapterInstance) {
    const queueBackend = process.env.QUEUE_BACKEND || "redis";

    if (queueBackend === "database") {
      logger.info({}, "Using database-backed queue adapter");
      queueAdapterInstance = new DatabaseQueueAdapter();
    } else {
      logger.info({}, "Using Redis/BullMQ queue adapter");
      queueAdapterInstance = new BullMQAdapter();
    }
  }

  return queueAdapterInstance;
}

export async function closeQueueAdapter(): Promise<void> {
  if (queueAdapterInstance) {
    await queueAdapterInstance.close();
    queueAdapterInstance = null;
  }
}
