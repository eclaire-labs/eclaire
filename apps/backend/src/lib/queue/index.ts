/**
 * Queue module barrel export
 *
 * All queue-related functionality for the backend service.
 */

// Queue adapter (main entry point for enqueuing jobs)
export {
  getQueueAdapter,
  closeQueueAdapter,
  type QueueAdapter,
  type JobData,
  type BookmarkJobData,
  type ImageJobData,
  type DocumentJobData,
  type NoteJobData,
  type TaskJobData,
  type AssetType,
} from "./adapter.js";

// Queue names
export { QueueNames, type QueueName } from "@eclaire/queue/app";

// BullMQ queue access (for Redis mode)
export { getQueue, closeQueues } from "./queues.js";

// Cron utilities
export {
  isValidCronExpression,
  getNextExecutionTime,
  CronPatterns,
  describeCronExpression,
} from "./cron-utils.js";

// Database queue helpers
export {
  getCurrentTimestamp,
  getScheduledTime,
  isJobExpired,
  isJobReady,
  formatJobResult,
  getExpirationTime,
  type ClaimedJob,
} from "./db-helpers.js";

// Job waitlist (for database mode push notifications)
export { jobWaitlist } from "./job-waitlist.js";

// Redis connection
export { createRedisConnection, type RedisConnectionOptions } from "@eclaire/queue";

// Scheduler
export {
  getScheduler,
  startScheduler,
  stopScheduler,
  getRecurringTaskScheduleKey,
  RECURRING_TASK_KEY_PREFIX,
  type Scheduler,
  type ScheduleConfig,
} from "./scheduler.js";
