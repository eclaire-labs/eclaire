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

// Re-export all errors
export {
  ConnectionError,
  createRateLimitError,
  // Helper functions
  getRateLimitDelay,
  isPermanentError,
  isQueueError,
  // Type guards
  isRateLimitError,
  isRetryableError,
  JobNotFoundError,
  JobTimeoutError,
  PermanentError,
  // Error classes
  QueueError,
  RateLimitError,
  RetryableError,
} from "./errors.js";
// Re-export progress utilities
export {
  addStagesToList,
  areAllStagesCompleted,
  // Progress calculation
  calculateOverallProgress,
  completeStageInList,
  failStageInList,
  findStage,
  // Stage queries
  getCurrentStageName,
  hasFailedStage,
  // Stage initialization
  initializeStages,
  startStageInList,
  // Stage operations
  updateStageInList,
  updateStageProgressInList,
} from "./progress.js";
// Re-export all types
export type {
  BackoffStrategy,
  // Config types
  DriverConfig,
  // Job types
  Job,
  JobContext,
  JobEventCallbacks,
  JobHandler,
  JobOptions,
  // Multi-stage progress types
  JobStage,
  JobStageStatus,
  JobStatus,
  NotifyEmitter,
  // Notification types
  NotifyListener,
  // Queue client
  QueueClient,
  // Logger type
  QueueLogger,
  QueueStats,
  ScheduleConfig,
  // Scheduler types
  Scheduler,
  // Worker types
  Worker,
  WorkerFactory,
  WorkerOptions,
} from "./types.js";
// Re-export all utilities
export {
  addJitter,
  calculateBackoff,
  calculateBackoffWithJitter,
  createDeferred,
  createWorkerId,
  // Backoff
  DEFAULT_BACKOFF,
  // ID generation
  generateJobId,
  generateScheduleId,
  // Time utilities
  getFutureDate,
  getMillisecondsUntil,
  isInFuture,
  isInPast,
  // Cron utilities
  isValidCronExpression,
  retry,
  // Misc utilities
  sleep,
  timeout,
  withTimeout,
} from "./utils.js";
