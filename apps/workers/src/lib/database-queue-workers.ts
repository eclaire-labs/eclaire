// Database queue workers initialization
// Starts polling workers for each asset type

import axios from "axios";
import { config } from "../config";
import processBookmarkJob from "../jobs/bookmarkProcessor";
import { processDocumentJob } from "../jobs/documentProcessor";
import processImageJob from "../jobs/imageProcessor";
import processNoteJob from "../jobs/noteProcessor";
import processTaskJob from "../jobs/taskProcessor";
import { createChildLogger } from "./logger";
import {
  adaptDatabaseJob,
  type DatabaseJob,
  isRateLimitError,
  getRateLimitDelay,
} from "./job-adapters";
import { startPolling, getWorkerId } from "./queue-poller";

const logger = createChildLogger("database-queue-workers");

/**
 * Start all database queue polling workers
 */
export async function startDatabaseQueueWorkers(): Promise<void> {
  logger.info({}, "Starting workers in DATABASE queue mode");

  // Start bookmark processing worker
  startPolling("bookmarks", async (dbJob: DatabaseJob) => {
    const mockJob = adaptDatabaseJob(dbJob);
    try {
      // Note: Pass null for token and worker since we're not using BullMQ
      await processBookmarkJob(mockJob as any, null as any, null as any);
    } catch (error) {
      if (isRateLimitError(error)) {
        // For rate limiting, reschedule the job with proper delay
        const delayMs = getRateLimitDelay(error);
        logger.info(
          { jobId: dbJob.id, assetId: dbJob.asset_id, delayMs },
          "Job rate limited - rescheduling with delay",
        );

        try {
          await axios.post(
            `${config.backend.url}/api/jobs/${dbJob.id}/reschedule`,
            {
              workerId: getWorkerId(),
              delayMs,
            },
            {
              timeout: 5000,
            },
          );
          logger.debug(
            { jobId: dbJob.id, delayMs },
            "Job rescheduled successfully",
          );
          // Don't throw - job was rescheduled successfully
          return;
        } catch (rescheduleError) {
          logger.error(
            {
              jobId: dbJob.id,
              error: rescheduleError instanceof Error ? rescheduleError.message : "Unknown error",
            },
            "Failed to reschedule rate-limited job",
          );
          // Throw original error so job will timeout and be reclaimed
          throw error;
        }
      }
      throw error;
    }
  }).catch((error) => {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Bookmark polling worker crashed",
    );
  });

  // Start image processing worker
  startPolling("photos", async (dbJob: DatabaseJob) => {
    const mockJob = adaptDatabaseJob(dbJob);
    await processImageJob(mockJob as any);
  }).catch((error) => {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Image polling worker crashed",
    );
  });

  // Start document processing worker
  startPolling("documents", async (dbJob: DatabaseJob) => {
    const mockJob = adaptDatabaseJob(dbJob);
    await processDocumentJob(mockJob as any);
  }).catch((error) => {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Document polling worker crashed",
    );
  });

  // Start note processing worker
  startPolling("notes", async (dbJob: DatabaseJob) => {
    const mockJob = adaptDatabaseJob(dbJob);
    await processNoteJob(mockJob as any);
  }).catch((error) => {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Note polling worker crashed",
    );
  });

  // Start task processing worker
  startPolling("tasks", async (dbJob: DatabaseJob) => {
    const mockJob = adaptDatabaseJob(dbJob);
    await processTaskJob(mockJob as any);
  }).catch((error) => {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Task polling worker crashed",
    );
  });

  logger.info({}, "All database queue polling workers started");
  logger.info(
    {},
    "Note: Bull Board UI is not available in database mode. Use GET /api/jobs/stats for queue monitoring.",
  );
}
