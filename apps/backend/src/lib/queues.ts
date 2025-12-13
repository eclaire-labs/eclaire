/**
 * Backend service queue management
 *
 * Uses @eclaire/queue package for queue management in Redis mode.
 * In database mode, returns null for all queue operations (expected behavior).
 */

import type { Queue } from "bullmq";
import { createChildLogger } from "./logger";
import {
  createQueueManager,
  QueueNames,
  type QueueManager,
  type QueueName,
} from "@eclaire/queue";
import { getQueueMode } from "./env-validation";

const logger = createChildLogger("queues");

// --- Configuration ---
// Queue mode is derived from SERVICE_ROLE:
// - "unified" → database mode (no Redis dependency)
// - "backend"/"worker" → redis mode (requires Redis)
const queueBackend = getQueueMode();

// Re-export QueueNames for backwards compatibility
export { QueueNames };

// --- Queue Manager ---
let queueManager: QueueManager | null = null;

if (queueBackend === "redis") {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    logger.error(
      {},
      "FATAL: REDIS_URL environment variable is not set but queue mode is 'redis'. Queue functionality will fail",
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
