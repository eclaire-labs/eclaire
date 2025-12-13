/**
 * @eclaire/queue - Job queue abstraction
 *
 * Provides a unified interface for job queuing that works with both:
 * - Redis/BullMQ mode: Production-scale job processing with Redis
 * - Database mode: Zero-Redis deployment using PostgreSQL or SQLite
 */

import type { Logger } from "@eclaire/logger";
import type { DbInstance } from "@eclaire/db";
import type {
  QueueAdapter,
  QueueConfig,
  AssetType,
  JobWaitlistInterface,
  PollingConfig,
  DatabaseJob,
} from "./types.js";

// Re-export all types
export * from "./types.js";
export * from "./queue-names.js";

// Re-export utilities
export * from "./database/helpers.js";
export * from "./database/job-adapters.js";
export { createJobWaitlist, type WaitlistConfig } from "./database/waitlist.js";
export { startPolling, generateWorkerId } from "./database/poller.js";

// Re-export BullMQ utilities
export { createRedisConnection, type RedisConnectionOptions } from "./bullmq/redis-connection.js";
export { createQueueManager, type QueueManagerConfig, type QueueManager } from "./bullmq/queues.js";

// Re-export queue options (job options & worker options factories)
export {
  getDefaultJobOptions,
  bookmarkJobOptions,
  standardJobOptions,
  JOB_TIMEOUT,
  getBaseWorkerOptions,
  getLongTaskWorkerOptions,
  getMediumTaskWorkerOptions,
  getShortTaskWorkerOptions,
  queueWorkerCategory,
  type WorkerCategory,
  type BaseWorkerOptions,
  type TimedWorkerOptions,
} from "./bullmq/queue-options.js";

// Re-export adapters
export { createBullMQAdapter, type BullMQAdapterConfig } from "./adapters/bullmq.js";
export { createDatabaseAdapter, type DatabaseAdapterConfig } from "./adapters/database.js";

/**
 * Creates a queue adapter based on the configuration
 *
 * @param config - Queue configuration
 * @returns Queue adapter instance
 *
 * @example
 * ```typescript
 * // Redis mode
 * import { createQueueAdapter } from "@eclaire/queue";
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
 * import { createQueueAdapter, createJobWaitlist } from "@eclaire/queue";
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
export async function createQueueAdapter(config: QueueConfig): Promise<QueueAdapter> {
  const { mode, logger } = config;

  if (mode === "redis") {
    if (!config.redis?.url) {
      throw new Error("Redis URL is required for redis mode");
    }

    // Import dynamically to avoid loading BullMQ if not needed
    const { createQueueManager } = await import("./bullmq/queues.js");
    const { createBullMQAdapter } = await import("./adapters/bullmq.js");

    const queueManager = createQueueManager({
      redisUrl: config.redis.url,
      logger,
      serviceName: "Queue Service",
    });

    logger.info({}, "Using Redis/BullMQ queue adapter");
    return createBullMQAdapter({ queueManager, logger });
  } else if (mode === "database") {
    if (!config.database?.db || !config.database?.schema) {
      throw new Error("Database instance and schema are required for database mode");
    }

    const { createDatabaseAdapter } = await import("./adapters/database.js");

    logger.info({}, "Using database-backed queue adapter");
    return createDatabaseAdapter({
      db: config.database.db,
      schema: config.database.schema,
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

  if (!database?.db || !database?.schema) {
    throw new Error("Database instance and schema are required for database mode");
  }

  const { createJobWaitlist } = await import("./database/waitlist.js");
  const { createDatabaseAdapter } = await import("./adapters/database.js");

  const waitlist = createJobWaitlist({
    logger,
    findNextScheduledJob,
  });

  const adapter = createDatabaseAdapter({
    db: database.db,
    schema: database.schema,
    logger,
    waitlist,
  });

  logger.info({}, "Using database-backed queue adapter with waitlist");

  return { adapter, waitlist };
}
