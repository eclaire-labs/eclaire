// Queue adapter abstraction layer
// Uses @eclaire/queue package for queue implementations

import { createQueueManager } from "@eclaire/queue/driver-bullmq";
import { config } from "../../config/index.js";
import { db, dbType } from "../../db/index.js";
import { createChildLogger } from "../logger.js";
import { createBullMQAdapter } from "./adapters/bullmq.js";
import { createDatabaseAdapter } from "./adapters/database.js";
import { getNotifyEmitter } from "./notify.js";
import { getDefaultJobOptionsMap } from "./queue-options.js";
import type {
  AssetType,
  BookmarkJobData,
  DocumentJobData,
  ImageJobData,
  JobData,
  NoteJobData,
  QueueAdapter,
  TaskJobData,
} from "./types.js";

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
    // Use Redis/BullMQ adapter
    const redisUrl = config.queue.redisUrl;
    if (!redisUrl) {
      throw new Error("REDIS_URL is required for QUEUE_BACKEND=redis");
    }
    const queueManager = createQueueManager({
      redisUrl,
      logger,
      serviceName: "Queue Service",
      prefix: config.queue.redisKeyPrefix,
      defaultJobOptions: getDefaultJobOptionsMap(),
    });
    queueAdapterInstance = createBullMQAdapter({ queueManager, logger });
    logger.info({}, "Using Redis/BullMQ queue adapter");
  } else {
    // postgres or sqlite backend - use database adapter with in-memory notify
    queueAdapterInstance = createDatabaseAdapter({
      db,
      dbType: dbType as "postgres" | "sqlite",
      logger,
      notifyEmitter: getNotifyEmitter(),
    });
    logger.info(
      { queueBackend },
      "Using database-backed queue adapter with instant notify",
    );
  }

  return queueAdapterInstance;
}

export async function closeQueueAdapter(): Promise<void> {
  if (queueAdapterInstance) {
    await queueAdapterInstance.close();
    queueAdapterInstance = null;
  }
}
