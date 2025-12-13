// Queue adapter abstraction layer
// Uses @eclaire/queue package for queue implementations

import {
  createQueueAdapter as createPkgQueueAdapter,
  createQueueAdapterWithWaitlist,
  type QueueAdapter,
  type BookmarkJobData,
  type ImageJobData,
  type DocumentJobData,
  type NoteJobData,
  type TaskJobData,
  type JobData,
  type AssetType,
} from "@eclaire/queue";
import { db, schema } from "@/db";
import { createChildLogger } from "./logger";
import { getQueueMode } from "./env-validation";
import { getQueue, QueueNames } from "./queues";

const logger = createChildLogger("queue-adapter");

// Re-export types for convenience
export type {
  QueueAdapter,
  JobData,
  BookmarkJobData,
  ImageJobData,
  DocumentJobData,
  NoteJobData,
  TaskJobData,
  AssetType,
};

// --- Factory Function ---

let queueAdapterInstance: QueueAdapter | null = null;

export function getQueueAdapter(): QueueAdapter {
  if (!queueAdapterInstance) {
    const queueBackend = getQueueMode();

    if (queueBackend === "database") {
      // Use package's database adapter with waitlist
      const { adapter } = createQueueAdapterWithWaitlist({
        mode: "database",
        database: { db, schema },
        logger,
      });
      logger.info({}, "Using database-backed queue adapter");
      queueAdapterInstance = adapter;
    } else {
      // Use package's Redis/BullMQ adapter
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        throw new Error("REDIS_URL is required for redis queue mode");
      }
      queueAdapterInstance = createPkgQueueAdapter({
        mode: "redis",
        redis: { url: redisUrl },
        logger,
      });
      logger.info({}, "Using Redis/BullMQ queue adapter");
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
