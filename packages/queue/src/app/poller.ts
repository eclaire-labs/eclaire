/**
 * Queue poller for database-backed queue mode
 * Workers poll the backend API to fetch and process jobs
 */

import axios from "axios";
import type { Logger } from "@eclaire/logger";
import type { DatabaseJob, PollingConfig, AssetType } from "./types.js";

const DEFAULT_WAIT_TIMEOUT = 30000; // 30 seconds - how long to wait for a job
const DEFAULT_ERROR_RETRY_DELAY = 2000; // 2 seconds - delay after errors
const DEFAULT_HEARTBEAT_INTERVAL = 60000; // 60 seconds

/**
 * Generate a unique worker ID for this process
 */
export function generateWorkerId(): string {
  return `worker-${process.pid}-${Date.now()}`;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Start polling for jobs of a specific asset type
 * Uses long-polling (/wait endpoint) for zero-overhead push-based notifications
 */
export async function startPolling(config: PollingConfig): Promise<void> {
  const {
    assetType,
    backendUrl,
    processor,
    logger,
    workerId = generateWorkerId(),
    waitTimeout = DEFAULT_WAIT_TIMEOUT,
    errorRetryDelay = DEFAULT_ERROR_RETRY_DELAY,
    heartbeatInterval = DEFAULT_HEARTBEAT_INTERVAL,
  } = config;

  logger.info(
    { assetType, workerId },
    `Starting long-poll worker for ${assetType}`,
  );

  while (true) {
    try {
      // Use long-polling wait endpoint for push-based notifications
      // This eliminates continuous polling - the backend will notify us when jobs are available
      const response = await axios.get(`${backendUrl}/api/jobs/wait`, {
        params: {
          assetType,
          workerId,
          timeout: waitTimeout,
        },
        timeout: waitTimeout + 5000, // Slightly longer than server timeout
      });

      const job: DatabaseJob | null = response.data;

      if (job) {
        logger.info(
          { jobId: job.id, assetType, assetId: job.asset_id },
          "Processing job",
        );

        // Start heartbeat interval to keep job alive
        const heartbeat = setInterval(async () => {
          try {
            await axios.post(
              `${backendUrl}/api/jobs/${job.id}/heartbeat`,
              {
                workerId,
              },
              {
                timeout: 5000,
              },
            );
            logger.debug({ jobId: job.id }, "Job heartbeat sent");
          } catch (err) {
            logger.error(
              {
                jobId: job.id,
                error: err instanceof Error ? err.message : "Unknown error",
              },
              "Failed to send heartbeat",
            );
          }
        }, heartbeatInterval);

        try {
          // Process the job
          await processor(job);

          logger.info(
            { jobId: job.id, assetType, assetId: job.asset_id },
            "Job completed successfully",
          );
        } catch (error) {
          logger.error(
            {
              jobId: job.id,
              assetType,
              assetId: job.asset_id,
              error: error instanceof Error ? error.message : "Unknown error",
              stack: error instanceof Error ? error.stack : undefined,
            },
            "Job processing failed",
          );
        } finally {
          // Stop heartbeat
          clearInterval(heartbeat);
        }

        // Immediately reconnect for next job (no delay when jobs are available)
      } else {
        // Timeout or no jobs available - immediately reconnect
        // The wait endpoint handles the delay for us
        logger.debug({ assetType }, "No job available, reconnecting");
      }
    } catch (error) {
      // Handle errors (network issues, etc.)
      if (axios.isAxiosError(error)) {
        if (error.code === "ECONNREFUSED") {
          logger.error(
            { assetType },
            "Backend API not available - connection refused. Retrying...",
          );
        } else if (error.code === "ETIMEDOUT" || error.code === "ECONNABORTED") {
          // Timeout is expected with long-polling, just reconnect
          logger.debug({ assetType }, "Wait timeout, reconnecting");
        } else if (error.response) {
          logger.error(
            {
              assetType,
              status: error.response.status,
              data: error.response.data,
            },
            "API error while waiting for job",
          );
        } else {
          logger.error(
            {
              assetType,
              error: error.message,
            },
            "Network error while waiting for job",
          );
        }
      } else {
        logger.error(
          {
            assetType,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          "Polling error",
        );
      }

      // Wait before retrying on errors (but not on normal timeout)
      if (axios.isAxiosError(error) &&
          error.code !== "ETIMEDOUT" &&
          error.code !== "ECONNABORTED") {
        await sleep(errorRetryDelay);
      }
    }
  }
}
