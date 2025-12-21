/**
 * Worker queue configuration
 *
 * Uses @eclaire/queue package for:
 * - Redis connection setup
 * - Worker option factories
 * - Queue management (for Bull Board)
 */

import { Queue, type WorkerOptions } from "bullmq";
import type { Redis } from "ioredis";
import { config } from "./config.js";
import { createChildLogger } from "../lib/logger.js";
import { createRedisConnection } from "@eclaire/queue";
import {
  createQueueManager,
  getLongTaskWorkerOptions,
  getMediumTaskWorkerOptions,
  getShortTaskWorkerOptions,
  QueueNames,
  type QueueManager,
  type QueueName,
} from "@eclaire/queue/app";
import { getQueueBackend } from "../lib/env-validation.js";

const logger = createChildLogger("queues");

// --- Configuration ---
// Queue backend from QUEUE_BACKEND env var:
// - "redis" → Redis/BullMQ
// - "postgres" → PostgreSQL database queue
// - "sqlite" → SQLite database queue (single process only)
const queueBackend = getQueueBackend();

// --- Conditional Redis Connection ---
export let redisConnection: Redis | null = null;

if (queueBackend === "redis") {
  redisConnection = createRedisConnection({
    url: config.redis.url,
    logger,
    serviceName: "Workers",
  });
} else {
  logger.info(
    { queueBackend },
    "Queue backend is not 'redis' - skipping Redis connection initialization",
  );
}

// --- Worker Options ---
// Uses factories from @eclaire/queue package with connection added

export const defaultWorkerOptions: WorkerOptions = {
  connection: redisConnection!,
  concurrency: config.worker.concurrency,
  stalledInterval: 30000,
  maxStalledCount: 1,
};

export const longTaskWorkerOptions: WorkerOptions = {
  ...getLongTaskWorkerOptions(config.worker.concurrency),
  connection: redisConnection!,
};

export const mediumTaskWorkerOptions: WorkerOptions = {
  ...getMediumTaskWorkerOptions(config.worker.concurrency),
  connection: redisConnection!,
};

export const shortTaskWorkerOptions: WorkerOptions = {
  ...getShortTaskWorkerOptions(config.worker.concurrency),
  connection: redisConnection!,
};

// --- Queue Manager (for Bull Board) ---
let queueManager: QueueManager | null = null;

if (queueBackend === "redis" && redisConnection) {
  queueManager = createQueueManager({
    redisUrl: config.redis.url,
    logger,
    serviceName: "Workers",
  });
  logger.info({}, "Queue manager initialized for Bull Board");
}

// --- Queue Accessors ---

/**
 * Get a queue by name (useful for job lookup operations)
 */
export function getQueue(name: QueueName): Queue | null {
  return queueManager?.getQueue(name) ?? null;
}

export function getAllQueues(): Queue[] {
  if (!queueManager) return [];

  return Object.values(QueueNames)
    .map((name) => queueManager!.getQueue(name as QueueName))
    .filter((q): q is Queue => q !== null);
}

export async function closeQueues(): Promise<void> {
  if (queueBackend !== "redis") {
    logger.info({ queueBackend }, "No Redis queues to close (not in redis mode)");
    return;
  }

  logger.info({}, "Closing BullMQ queues");

  // Close queue manager (handles queues and its Redis connection)
  if (queueManager) {
    await queueManager.close();
  }

  // Close worker Redis connection
  if (redisConnection) {
    try {
      if (
        redisConnection.status === "ready" ||
        redisConnection.status === "connecting" ||
        redisConnection.status === "reconnecting"
      ) {
        await redisConnection.quit();
        logger.info({}, "Worker Redis connection closed");
      }
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Error closing worker Redis connection",
      );
    }
  }

  logger.info({}, "BullMQ queues closed");
}
