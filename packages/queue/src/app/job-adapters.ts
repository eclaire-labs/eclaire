/**
 * Job adapters for database queue mode
 * Converts database job format to BullMQ-compatible format
 */

import type { Logger } from "@eclaire/logger";
import type { DatabaseJob, MockBullMQJob } from "./types.js";

// Re-export from core for backward compatibility
export {
  createRateLimitError,
  getRateLimitDelay,
  isRateLimitError,
  RateLimitError,
} from "../core/errors.js";

/**
 * Adapt database job to BullMQ-like job object
 */
export function adaptDatabaseJob(
  dbJob: DatabaseJob,
  logger?: Logger,
): MockBullMQJob {
  // Validate that job_data exists
  if (!dbJob.job_data) {
    const errMsg = `Job ${dbJob.id} has no job_data`;
    logger?.error(
      { jobId: dbJob.id, assetType: dbJob.asset_type, assetId: dbJob.asset_id },
      "Job data is missing - cannot process job",
    );
    throw new Error(errMsg);
  }

  return {
    data: dbJob.job_data,
    id: dbJob.id,
    updateProgress: async (progress: number) => {
      logger?.debug({ jobId: dbJob.id, progress }, "Job progress update");
    },
    log: (message: string) => {
      logger?.info({ jobId: dbJob.id }, message);
    },
  };
}
