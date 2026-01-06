/**
 * Queue module barrel export
 *
 * All queue-related functionality for the backend service.
 */

// Redis connection
export {
  createRedisConnection,
  type RedisConnectionOptions,
} from "@eclaire/queue";

// Queue names
export { type QueueName, QueueNames } from "@eclaire/queue/app";
// Queue adapter (main entry point for enqueuing jobs)
export {
  type AssetType,
  type BookmarkJobData,
  closeQueueAdapter,
  type DocumentJobData,
  getQueueAdapter,
  type ImageJobData,
  type JobData,
  type NoteJobData,
  type QueueAdapter,
  type TaskJobData,
} from "./adapter.js";

// Cron utilities
export {
  CronPatterns,
  describeCronExpression,
  getNextExecutionTime,
  isValidCronExpression,
} from "./cron-utils.js";

// Database queue helpers
export {
  type ClaimedJob,
  formatJobResult,
  getCurrentTimestamp,
  getExpirationTime,
  getScheduledTime,
  isJobExpired,
  isJobReady,
} from "./db-helpers.js";

// Job waitlist (for database mode push notifications)
export { jobWaitlist } from "./job-waitlist.js";
// BullMQ queue access (for Redis mode)
export { closeQueues, getQueue } from "./queues.js";

// Scheduler
export {
  getRecurringTaskScheduleKey,
  getScheduler,
  RECURRING_TASK_KEY_PREFIX,
  type ScheduleConfig,
  type Scheduler,
  startScheduler,
  stopScheduler,
} from "./scheduler.js";
