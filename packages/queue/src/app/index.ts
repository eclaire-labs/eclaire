/**
 * @eclaire/queue/app - Application-specific queue types and adapters
 *
 * This subpath contains Eclaire-specific types and adapters that are
 * not part of the generic queue library. Use this for:
 * - Asset type definitions (bookmarks, photos, documents, notes, tasks)
 * - QueueAdapter interface and implementations
 * - Job waitlist for database mode
 * - Polling utilities for remote workers
 *
 * For the generic queue library, use:
 * - @eclaire/queue (main entry)
 * - @eclaire/queue/core (zero-dependency types)
 * - @eclaire/queue/driver-db (database driver)
 * - @eclaire/queue/driver-bullmq (Redis/BullMQ driver)
 */

// Re-export Redis utilities
export {
  createRedisConnection,
  type RedisConnectionOptions,
} from "../shared/redis-connection.js";
// Re-export adapters
export {
  type BullMQAdapterConfig,
  createBullMQAdapter,
} from "./adapters/bullmq.js";
export {
  createDatabaseAdapter,
  type DatabaseAdapterConfig,
} from "./adapters/database.js";
// Re-export event callbacks
export {
  type ArtifactProcessor,
  createEventCallbacks,
  type EventCallbacksConfig,
  type JobAssetMetadata,
  type ProcessingSSEEvent,
  type SSEPublisher,
} from "./event-callbacks.js";
// Re-export database helpers (now local)
export * from "./helpers.js";
// Re-export job adapters (now local)
export {
  adaptDatabaseJob,
  createRateLimitError,
  getRateLimitDelay,
  isRateLimitError,
  RateLimitError,
} from "./job-adapters.js";
// Re-export poller (now local)
export { generateWorkerId, startPolling } from "./poller.js";
// Re-export queue names
export * from "./queue-names.js";
// Re-export queue options (now local)
export {
  type BaseWorkerOptions,
  bookmarkJobOptions,
  getBaseWorkerOptions,
  getDefaultJobOptions,
  getLongTaskWorkerOptions,
  getMediumTaskWorkerOptions,
  getShortTaskWorkerOptions,
  JOB_TIMEOUT,
  queueWorkerCategory,
  standardJobOptions,
  type TimedWorkerOptions,
  type WorkerCategory,
} from "./queue-options.js";
export {
  createQueueManager,
  type QueueManager,
  type QueueManagerConfig,
} from "./queues.js";
// Re-export all app-specific types
export * from "./types.js";
// Re-export waitlist (now local)
export { createJobWaitlist, type WaitlistConfig } from "./waitlist.js";
// --- Factory Functions ---

import { createBullMQAdapter as _createBullMQAdapter } from "./adapters/bullmq.js";
import { createDatabaseAdapter as _createDatabaseAdapter } from "./adapters/database.js";
// Import functions needed for factory (re-exports don't make them available locally)
import { createQueueManager as _createQueueManager } from "./queues.js";
import type {
  AssetType,
  JobWaitlistInterface,
  QueueAdapter,
  QueueConfig,
} from "./types.js";
import { createJobWaitlist as _createJobWaitlist } from "./waitlist.js";

/**
 * Creates a queue adapter based on the configuration
 *
 * @param config - Queue configuration
 * @returns Queue adapter instance
 *
 * @example
 * ```typescript
 * // Redis mode
 * import { createQueueAdapter } from "@eclaire/queue/app";
 * import { createLogger } from "@eclaire/logger";
 *
 * const logger = createLogger({ service: "backend" });
 * const adapter = createQueueAdapter({
 *   mode: "redis",
 *   redis: { url: "redis://localhost:6379" },
 *   logger,
 * });
 *
 * await adapter.enqueueBookmark({ bookmarkId: "bm_123", url: "...", userId: "user_123" });
 * ```
 *
 * @example
 * ```typescript
 * // Database mode
 * import { createQueueAdapter, createJobWaitlist } from "@eclaire/queue/app";
 * import { initializeDatabase } from "@eclaire/db";
 * import { createLogger } from "@eclaire/logger";
 *
 * const logger = createLogger({ service: "backend" });
 * const { db, schema } = initializeDatabase({ logger });
 * const waitlist = createJobWaitlist({ logger });
 *
 * const adapter = createQueueAdapter({
 *   mode: "database",
 *   database: { db, schema },
 *   logger,
 * });
 * ```
 */
export async function createQueueAdapter(
  config: QueueConfig,
): Promise<QueueAdapter> {
  const { mode, logger } = config;

  if (mode === "redis") {
    if (!config.redis?.url) {
      throw new Error("Redis URL is required for redis mode");
    }

    const queueManager = _createQueueManager({
      redisUrl: config.redis.url,
      logger,
      serviceName: "Queue Service",
      prefix: config.redis.prefix,
    });

    logger.info(
      { prefix: config.redis.prefix || "eclaire" },
      "Using Redis/BullMQ queue adapter",
    );
    return _createBullMQAdapter({ queueManager, logger });
  } else if (mode === "database") {
    if (!config.database?.db || !config.database?.dbType) {
      throw new Error(
        "Database instance and dbType are required for database mode",
      );
    }

    logger.info({}, "Using database-backed queue adapter");
    return _createDatabaseAdapter({
      db: config.database.db,
      dbType: config.database.dbType,
      logger,
    });
  } else {
    throw new Error(`Unknown queue mode: ${mode}`);
  }
}

/**
 * Creates a queue adapter with an integrated job waitlist for database mode
 *
 * This is a convenience function that sets up the database adapter with a waitlist
 * for push-based notifications to waiting workers.
 *
 * @param config - Queue configuration
 * @param findNextScheduledJob - Optional function to find the next scheduled job for wakeup scheduling
 * @returns Object containing the adapter and waitlist
 */
export async function createQueueAdapterWithWaitlist(
  config: QueueConfig & { mode: "database" },
  findNextScheduledJob?: (assetType: AssetType) => Promise<Date | null>,
): Promise<{ adapter: QueueAdapter; waitlist: JobWaitlistInterface }> {
  const { logger, database } = config;

  if (!database?.db || !database?.dbType) {
    throw new Error(
      "Database instance and dbType are required for database mode",
    );
  }

  const waitlist = _createJobWaitlist({
    logger,
    findNextScheduledJob,
  });

  const adapter = _createDatabaseAdapter({
    db: database.db,
    dbType: database.dbType,
    logger,
    waitlist,
  });

  logger.info({}, "Using database-backed queue adapter with waitlist");

  return { adapter, waitlist };
}
