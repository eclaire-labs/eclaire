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

// Re-export all app-specific types
export * from "../types.js";

// Re-export queue names
export * from "../queue-names.js";

// Re-export adapters
export { createBullMQAdapter, type BullMQAdapterConfig } from "../adapters/bullmq.js";
export { createDatabaseAdapter, type DatabaseAdapterConfig } from "../adapters/database.js";

// Re-export job adapters
export { adaptDatabaseJob } from "../database/job-adapters.js";

// Re-export waitlist
export { createJobWaitlist, type WaitlistConfig } from "../database/waitlist.js";

// Re-export poller
export { startPolling, generateWorkerId } from "../database/poller.js";

// Re-export database helpers
export * from "../database/helpers.js";

// Re-export BullMQ utilities
export { createRedisConnection, type RedisConnectionOptions } from "../bullmq/redis-connection.js";
export { createQueueManager, type QueueManagerConfig, type QueueManager } from "../bullmq/queues.js";

// Re-export queue options
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
} from "../bullmq/queue-options.js";
