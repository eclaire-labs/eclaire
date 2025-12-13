// Database queue workers initialization
// Starts polling workers for each asset type

import axios from "axios";
import {
  startPolling,
  generateWorkerId,
  adaptDatabaseJob,
  isRateLimitError,
  getRateLimitDelay,
  type DatabaseJob,
  type AssetType,
} from "@eclaire/queue";
import { config } from "../config.js";
import processBookmarkJob from "../jobs/bookmarkProcessor.js";
import { processDocumentJob } from "../jobs/documentProcessor.js";
import processImageJob from "../jobs/imageProcessor.js";
import processNoteJob from "../jobs/noteProcessor.js";
import processTaskJob from "../jobs/taskProcessor.js";
import processTaskExecution from "../jobs/taskExecutionProcessor.js";
import { createChildLogger } from "../../lib/logger.js";

// Generate worker ID once for this process
const workerId = generateWorkerId();

const logger = createChildLogger("database-queue-workers");

/**
 * Start all database queue polling workers
 */
export async function startDatabaseQueueWorkers(): Promise<void> {
  logger.info({}, "Starting workers in DATABASE queue mode");

  // Start bookmark processing worker
  startPolling({
    assetType: "bookmarks",
    backendUrl: config.backend.url,
    logger,
    workerId,
    processor: async (dbJob: DatabaseJob) => {
      const mockJob = adaptDatabaseJob(dbJob, logger);
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
                workerId,
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
    },
  }).catch((error) => {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Bookmark polling worker crashed",
    );
  });

  // Start image processing worker
  startPolling({
    assetType: "photos",
    backendUrl: config.backend.url,
    logger,
    workerId,
    processor: async (dbJob: DatabaseJob) => {
      const mockJob = adaptDatabaseJob(dbJob, logger);
      await processImageJob(mockJob as any);
    },
  }).catch((error) => {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Image polling worker crashed",
    );
  });

  // Start document processing worker
  startPolling({
    assetType: "documents",
    backendUrl: config.backend.url,
    logger,
    workerId,
    processor: async (dbJob: DatabaseJob) => {
      const mockJob = adaptDatabaseJob(dbJob, logger);
      await processDocumentJob(mockJob as any);
    },
  }).catch((error) => {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Document polling worker crashed",
    );
  });

  // Start note processing worker
  startPolling({
    assetType: "notes",
    backendUrl: config.backend.url,
    logger,
    workerId,
    processor: async (dbJob: DatabaseJob) => {
      const mockJob = adaptDatabaseJob(dbJob, logger);
      await processNoteJob(mockJob as any);
    },
  }).catch((error) => {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Note polling worker crashed",
    );
  });

  // Start task processing worker
  // Routes to either task-tagging (processTaskJob) or task-execution (processTaskExecution)
  // based on the job_type column (preferred) or legacy flags in jobData
  startPolling({
    assetType: "tasks",
    backendUrl: config.backend.url,
    logger,
    workerId,
    processor: async (dbJob: DatabaseJob) => {
      const mockJob = adaptDatabaseJob(dbJob, logger);

      // Route based on job_type column (new approach)
      // Falls back to checking jobData flags for backwards compatibility
      const jobType = dbJob.job_type;
      const jobData = typeof dbJob.job_data === 'string'
        ? JSON.parse(dbJob.job_data)
        : dbJob.job_data;

      // Use job_type if explicitly set, otherwise fall back to legacy flag checking
      const isExecutionJob = jobType === "execution" ||
        (jobType === "processing" && (jobData?.isRecurringExecution || jobData?.isAssignedToAI));

      if (isExecutionJob) {
        logger.debug({ jobId: dbJob.id, taskId: dbJob.asset_id, jobType, isRecurring: !!jobData?.isRecurringExecution, isAI: !!jobData?.isAssignedToAI }, "Routing to task execution processor");
        await processTaskExecution(mockJob as any);
      } else {
        logger.debug({ jobId: dbJob.id, taskId: dbJob.asset_id, jobType }, "Routing to task tagging processor");
        await processTaskJob(mockJob as any);
      }
    },
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
