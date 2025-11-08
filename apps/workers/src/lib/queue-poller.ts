// Queue poller for database-backed queue mode
// Workers poll the backend API to fetch and process jobs

import axios from "axios";
import { config } from "../config";
import { createChildLogger } from "./logger";

const logger = createChildLogger("queue-poller");

const WORKER_ID = `worker-${process.pid}-${Date.now()}`;
const WAIT_TIMEOUT = 30000; // 30 seconds - how long to wait for a job
const ERROR_RETRY_DELAY = 2000; // 2 seconds - delay after errors
const HEARTBEAT_INTERVAL = 60000; // 60 seconds

interface Job {
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

interface JobProcessor {
  (job: Job): Promise<void>;
}

/**
 * Start polling for jobs of a specific asset type
 * Uses long-polling (/wait endpoint) for zero-overhead push-based notifications
 * @param assetType - The type of assets to process (bookmarks, photos, documents, notes, tasks)
 * @param processor - The function to process the job
 */
export async function startPolling(
  assetType: string,
  processor: JobProcessor,
): Promise<void> {
  logger.info(
    { assetType, workerId: WORKER_ID },
    `Starting long-poll worker for ${assetType}`,
  );

  while (true) {
    try {
      // Use long-polling wait endpoint for push-based notifications
      // This eliminates continuous polling - the backend will notify us when jobs are available
      const response = await axios.get(`${config.backend.url}/api/jobs/wait`, {
        params: {
          assetType,
          workerId: WORKER_ID,
          timeout: WAIT_TIMEOUT,
        },
        timeout: WAIT_TIMEOUT + 5000, // Slightly longer than server timeout
      });

      const job: Job | null = response.data;

      if (job) {
        logger.info(
          { jobId: job.id, assetType, assetId: job.asset_id },
          "Processing job",
        );

        // Start heartbeat interval to keep job alive
        const heartbeat = setInterval(async () => {
          try {
            await axios.post(
              `${config.backend.url}/api/jobs/${job.id}/heartbeat`,
              {
                workerId: WORKER_ID,
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
        }, HEARTBEAT_INTERVAL);

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
        await sleep(ERROR_RETRY_DELAY);
      }
    }
  }
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get the worker ID for this process
 */
export function getWorkerId(): string {
  return WORKER_ID;
}
