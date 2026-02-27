/**
 * BullMQ-specific job options
 *
 * These options are typed against BullMQ's `JobsOptions` interface.
 * For generic timeout/concurrency config, see `app/queue-options.ts`.
 */

import type { JobsOptions } from "bullmq";
import { type QueueName, QueueNames } from "../app/queue-names.js";

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
