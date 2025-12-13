/**
 * Centralized BullMQ queue and job options
 *
 * This module provides a single source of truth for:
 * - Job options (attempts, backoff, removal policies) per queue
 * - Worker option factories for different task durations
 */

import type { JobsOptions } from "bullmq";
import { QueueNames, type QueueName } from "../queue-names.js";

// --- Job Options Per Queue ---

/**
 * Default job options for bookmark processing
 * Higher retry count (3) with shorter initial delay due to network variability
 */
export const bookmarkJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

/**
 * Default job options for standard processing queues
 * (image, document, note, task, task-execution)
 * 2 attempts with longer backoff for resource-intensive operations
 */
export const standardJobOptions: JobsOptions = {
  attempts: 2,
  backoff: { type: "exponential", delay: 10000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

/**
 * Get default job options for a specific queue
 */
export function getDefaultJobOptions(queueName: QueueName): JobsOptions {
  if (queueName === QueueNames.BOOKMARK_PROCESSING) {
    return bookmarkJobOptions;
  }
  return standardJobOptions;
}

// --- Worker Timeout Constants ---

export const JOB_TIMEOUT = {
  /** 15 minutes - for bookmark/image/document processing */
  LONG: 15 * 60 * 1000,
  /** 10 minutes - for task execution */
  MEDIUM: 10 * 60 * 1000,
  /** 5 minutes - for note/task processing */
  SHORT: 5 * 60 * 1000,
} as const;

// --- Worker Options Types ---

/**
 * Base worker options (without connection - caller must add)
 */
export interface BaseWorkerOptions {
  concurrency: number;
  stalledInterval: number;
  maxStalledCount: number;
}

/**
 * Worker options with lock duration for timed tasks
 */
export interface TimedWorkerOptions extends BaseWorkerOptions {
  lockDuration: number;
}

// --- Worker Options Factories ---

/**
 * Get base worker options
 * Note: Caller must add `connection` property
 */
export function getBaseWorkerOptions(concurrency: number): BaseWorkerOptions {
  return {
    concurrency,
    stalledInterval: 30000, // Check for stalled jobs every 30 seconds
    maxStalledCount: 1, // Mark jobs as failed after being stalled once
  };
}

/**
 * Get worker options for long-running tasks (15 min timeout)
 * Use for: bookmark, image, document processing
 */
export function getLongTaskWorkerOptions(
  concurrency: number,
): TimedWorkerOptions {
  return {
    ...getBaseWorkerOptions(concurrency),
    lockDuration: JOB_TIMEOUT.LONG,
    stalledInterval: 60000, // Check every 60 seconds for long tasks
  };
}

/**
 * Get worker options for medium-running tasks (10 min timeout)
 * Use for: task execution processing
 */
export function getMediumTaskWorkerOptions(
  concurrency: number,
): TimedWorkerOptions {
  return {
    ...getBaseWorkerOptions(concurrency),
    lockDuration: JOB_TIMEOUT.MEDIUM,
    stalledInterval: 60000,
  };
}

/**
 * Get worker options for short-running tasks (5 min timeout)
 * Use for: note, task processing
 */
export function getShortTaskWorkerOptions(
  concurrency: number,
): TimedWorkerOptions {
  return {
    ...getBaseWorkerOptions(concurrency),
    lockDuration: JOB_TIMEOUT.SHORT,
    stalledInterval: 30000,
  };
}

// --- Queue to Worker Category Mapping ---

export type WorkerCategory = "long" | "medium" | "short";

/**
 * Mapping of queue names to their worker timeout category
 * Useful for programmatically selecting worker options
 */
export const queueWorkerCategory: Record<QueueName, WorkerCategory> = {
  [QueueNames.BOOKMARK_PROCESSING]: "long",
  [QueueNames.IMAGE_PROCESSING]: "long",
  [QueueNames.DOCUMENT_PROCESSING]: "long",
  [QueueNames.NOTE_PROCESSING]: "short",
  [QueueNames.TASK_PROCESSING]: "short",
  [QueueNames.TASK_EXECUTION_PROCESSING]: "medium",
};
