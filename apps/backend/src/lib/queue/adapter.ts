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
} from "@eclaire/queue/app";
import { db, dbType } from "../../db/index.js";
import { createChildLogger } from "../logger.js";
import { config } from "../../config/index.js";
import { getQueue, QueueNames } from "./queues.js";

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
let queueAdapterInitPromise: Promise<QueueAdapter> | null = null;

export async function getQueueAdapter(): Promise<QueueAdapter> {
  if (queueAdapterInstance) {
    return queueAdapterInstance;
  }

  // Ensure only one initialization happens even with concurrent calls
  if (!queueAdapterInitPromise) {
    queueAdapterInitPromise = initializeQueueAdapter();
  }

  return queueAdapterInitPromise;
}

async function initializeQueueAdapter(): Promise<QueueAdapter> {
  const queueBackend = config.queueBackend;

  if (queueBackend === "redis") {
    // Use package's Redis/BullMQ adapter
    const redisUrl = config.queue.redisUrl;
    if (!redisUrl) {
      throw new Error("REDIS_URL is required for QUEUE_BACKEND=redis");
    }
    queueAdapterInstance = await createPkgQueueAdapter({
      mode: "redis",
      redis: { url: redisUrl, prefix: config.queue.redisKeyPrefix },
      logger,
    });
    logger.info({}, "Using Redis/BullMQ queue adapter");
  } else {
    // postgres or sqlite backend - use database adapter with waitlist
    const { adapter } = await createQueueAdapterWithWaitlist({
      mode: "database",
      database: { db, dbType: dbType as "postgres" | "sqlite" },
      logger,
    });
    logger.info({ queueBackend }, "Using database-backed queue adapter");
    queueAdapterInstance = adapter;
  }

  return queueAdapterInstance;
}

export async function closeQueueAdapter(): Promise<void> {
  if (queueAdapterInstance) {
    await queueAdapterInstance.close();
    queueAdapterInstance = null;
  }
}
