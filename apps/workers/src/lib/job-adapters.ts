// Job adapters for database queue mode
// Converts database job format to BullMQ-compatible format

import { createChildLogger } from "./logger";

const logger = createChildLogger("job-adapters");

/**
 * Database job structure from backend API
 */
export interface DatabaseJob {
  id: string;
  asset_type: string;
  asset_id: string;
  user_id: string;
  status: string;
  job_data: any;
  locked_by: string | null;
  locked_at: string | null;
  expires_at: string | null;
  retry_count: number;
  max_retries: number;
  created_at: string;
}

/**
 * Mock BullMQ Job object for processors
 */
export interface MockBullMQJob {
  data: any;
  id: string;
  updateProgress?: (progress: number) => Promise<void>;
  log?: (message: string) => void;
}

/**
 * Adapt database job to BullMQ-like job object
 */
export function adaptDatabaseJob(dbJob: DatabaseJob): MockBullMQJob {
  // Validate that job_data exists
  if (!dbJob.job_data) {
    logger.error(
      { jobId: dbJob.id, assetType: dbJob.asset_type, assetId: dbJob.asset_id },
      "Job data is missing - cannot process job"
    );
    throw new Error(`Job ${dbJob.id} has no job_data`);
  }

  return {
    data: dbJob.job_data,
    id: dbJob.id,
    updateProgress: async (progress: number) => {
      logger.debug({ jobId: dbJob.id, progress }, "Job progress update");
    },
    log: (message: string) => {
      logger.info({ jobId: dbJob.id }, message);
    },
  };
}

/**
 * Check if error is a rate limit error from BullMQ processor
 */
export function isRateLimitError(error: any): boolean {
  return (
    error?.name === "RateLimitError" ||
    error?.message === "bullmq:rateLimitExceeded" ||
    error?.message?.includes("rate limit")
  );
}

/**
 * Extract delay time from rate limit error (if available)
 * This needs to be set before throwing the error in processors
 */
export function getRateLimitDelay(error: any): number {
  // Try to get delay from error object
  // Default to 10 seconds if no delay specified
  return error?.delayMs || error?.delay || 10000;
}

/**
 * Create a rate limit error with delay information
 * This should be used instead of Worker.RateLimitError() in database mode
 */
export function createRateLimitError(delayMs: number): Error {
  const error = new Error("bullmq:rateLimitExceeded") as any;
  error.name = "RateLimitError";
  error.delayMs = delayMs;
  return error;
}
