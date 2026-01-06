/**
 * Backend service queue management
 *
 * Uses @eclaire/queue package for queue management in Redis mode.
 * In database mode, returns null for all queue operations (expected behavior).
 */

import {
  createQueueManager,
  type QueueManager,
  type QueueName,
  QueueNames,
} from "@eclaire/queue/app";
import type { Queue } from "bullmq";
import { config } from "../../config/index.js";
import { createChildLogger } from "../logger.js";

const logger = createChildLogger("queues");

// --- Configuration ---
// Queue backend from QUEUE_BACKEND env var:
// - "redis" → Redis/BullMQ
// - "postgres" → PostgreSQL database queue
// - "sqlite" → SQLite database queue (single process only)
const queueBackend = config.queueBackend;

// Re-export QueueNames for backwards compatibility
export { QueueNames };

// --- Queue Manager ---
let queueManager: QueueManager | null = null;

if (queueBackend === "redis") {
  // Use config.queue.redisUrl - this includes fallback construction from REDIS_HOST+REDIS_PORT
  const redisUrl = config.queue.redisUrl;

  if (!redisUrl || !redisUrl.startsWith("redis://")) {
    logger.error(
      {},
      "FATAL: Redis URL not available but queue mode is 'redis'. Queue functionality will fail",
    );
  } else {
    queueManager = createQueueManager({
      redisUrl,
      logger,
      serviceName: "Backend Service",
    });
  }
} else {
  logger.info(
    { queueBackend },
    "Queue backend is not 'redis' - skipping queue manager initialization",
  );
}

/**
 * Gets a BullMQ Queue instance for the given name.
 * @param name The name of the queue (use constants from QueueNames).
 * @returns The Queue instance, or null if not in redis mode or initialization fails.
 */
export function getQueue(name: QueueName): Queue | null {
  if (queueBackend !== "redis") {
    logger.debug(
      { queueName: name, queueBackend },
      "getQueue called but queue mode is 'database' - returning null (this is expected)",
    );
    return null;
  }

  if (!queueManager) {
    logger.error(
      { queueName: name },
      "Queue manager not available - cannot get queue",
    );
    return null;
  }

  return queueManager.getQueue(name);
}

/**
 * Graceful shutdown - close all queues and Redis connection
 */
export async function closeQueues(): Promise<void> {
  if (queueBackend !== "redis" || !queueManager) {
    logger.info(
      { queueBackend },
      "No Redis queues to close (not in redis mode or no queue manager)",
    );
    return;
  }

  logger.info({}, "Closing backend service BullMQ queue connections");
  await queueManager.close();
  logger.info({}, "Backend service BullMQ queue connections closed");
}
