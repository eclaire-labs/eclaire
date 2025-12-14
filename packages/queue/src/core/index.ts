/**
 * @eclaire/queue/core - Core types, errors, and utilities
 *
 * This module has ZERO external dependencies and can be used in any project.
 * It defines the contracts that all queue drivers must implement.
 *
 * @example
 * ```typescript
 * import {
 *   // Types
 *   Job,
 *   JobOptions,
 *   QueueClient,
 *   Worker,
 *   JobContext,
 *   JobHandler,
 *
 *   // Errors
 *   RateLimitError,
 *   RetryableError,
 *   PermanentError,
 *
 *   // Utilities
 *   calculateBackoff,
 *   generateJobId,
 * } from '@eclaire/queue/core';
 * ```
 */

// Re-export all types
export type {
  // Job types
  Job,
  JobStatus,
  JobOptions,
  BackoffStrategy,

  // Queue client
  QueueClient,
  QueueStats,

  // Worker types
  Worker,
  WorkerFactory,
  WorkerOptions,
  JobContext,
  JobHandler,

  // Scheduler types
  Scheduler,
  ScheduleConfig,

  // Notification types
  NotifyListener,
  NotifyEmitter,

  // Logger type
  QueueLogger,

  // Config types
  DriverConfig,
} from "./types.js";

// Re-export all errors
export {
  // Error classes
  QueueError,
  RateLimitError,
  RetryableError,
  PermanentError,
  JobTimeoutError,
  JobNotFoundError,
  ConnectionError,

  // Type guards
  isRateLimitError,
  isRetryableError,
  isPermanentError,
  isQueueError,

  // Helper functions
  getRateLimitDelay,
  createRateLimitError,
} from "./errors.js";

// Re-export all utilities
export {
  // Backoff
  DEFAULT_BACKOFF,
  calculateBackoff,
  addJitter,
  calculateBackoffWithJitter,

  // ID generation
  generateJobId,
  generateScheduleId,
  createWorkerId,

  // Time utilities
  getFutureDate,
  isInPast,
  isInFuture,
  getMillisecondsUntil,

  // Cron utilities
  isValidCronExpression,

  // Misc utilities
  sleep,
  createDeferred,
  timeout,
  withTimeout,
  retry,
} from "./utils.js";
