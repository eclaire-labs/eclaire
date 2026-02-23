/**
 * @eclaire/queue/transport-http - HTTP client for remote workers
 */

import axios, { type AxiosInstance } from "axios";
import type { QueueStats } from "../core/types.js";
import type { HttpClientConfig, HttpJobResponse } from "./types.js";

/**
 * Default configuration values
 */
const DEFAULTS = {
  requestTimeout: 35000, // Slightly longer than typical wait timeout
};

/**
 * HTTP client for communicating with the queue backend
 *
 * This client is used by remote workers to interact with the queue
 * via HTTP instead of direct database access.
 */
export interface HttpQueueClient {
  /**
   * Wait for a job to become available (long-polling)
   */
  wait(
    name: string,
    workerId: string,
    timeout: number,
  ): Promise<HttpJobResponse | null>;

  /**
   * Claim a job (non-blocking)
   */
  claim(name: string, workerId: string): Promise<HttpJobResponse | null>;

  /**
   * Send heartbeat for a job
   */
  heartbeat(jobId: string, workerId: string): Promise<boolean>;

  /**
   * Mark job as completed
   */
  complete(jobId: string, workerId: string): Promise<boolean>;

  /**
   * Mark job as failed
   */
  fail(
    jobId: string,
    workerId: string,
    error: string,
    retryAfter?: number,
  ): Promise<boolean>;

  /**
   * Reschedule a job (for rate limiting)
   */
  reschedule(jobId: string, workerId: string, delay: number): Promise<boolean>;

  /**
   * Get queue statistics
   */
  stats(name?: string): Promise<QueueStats>;
}

/**
 * Create an HTTP client for queue operations
 *
 * @param config - Client configuration
 * @returns HTTP queue client
 */
export function createHttpClient(config: HttpClientConfig): HttpQueueClient {
  const {
    backendUrl,
    logger,
    requestTimeout = DEFAULTS.requestTimeout,
  } = config;

  // Create axios instance with base configuration
  const http: AxiosInstance = axios.create({
    baseURL: `${backendUrl}/api/jobs`,
    timeout: requestTimeout,
    headers: {
      "Content-Type": "application/json",
    },
  });

  return {
    async wait(
      name: string,
      workerId: string,
      timeout: number,
    ): Promise<HttpJobResponse | null> {
      const safeTimeout = Math.max(0, timeout);
      try {
        const response = await http.get("/wait", {
          params: {
            name,
            workerId,
            timeout: safeTimeout,
          },
          timeout: safeTimeout + 5000, // Allow extra time for HTTP overhead
        });

        return response.data || null;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          // Timeout is expected with long-polling
          if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
            logger.debug({ name }, "Wait timeout (expected)");
            return null;
          }

          logger.error(
            {
              name,
              workerId,
              status: error.response?.status,
              error: error.message,
            },
            "HTTP wait error",
          );
        } else {
          logger.error(
            {
              name,
              workerId,
              error: error instanceof Error ? error.message : "Unknown",
            },
            "Wait error",
          );
        }
        throw error;
      }
    },

    async claim(
      name: string,
      workerId: string,
    ): Promise<HttpJobResponse | null> {
      try {
        const response = await http.get("/fetch", {
          params: {
            name,
            workerId,
          },
        });

        return response.data || null;
      } catch (error) {
        logger.error(
          {
            name,
            workerId,
            error: error instanceof Error ? error.message : "Unknown",
          },
          "Claim error",
        );
        throw error;
      }
    },

    async heartbeat(jobId: string, workerId: string): Promise<boolean> {
      try {
        await http.post(`/${jobId}/heartbeat`, { workerId });
        return true;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          logger.warn({ jobId, workerId }, "Heartbeat failed: job not found");
          return false;
        }

        logger.error(
          {
            jobId,
            workerId,
            error: error instanceof Error ? error.message : "Unknown",
          },
          "Heartbeat error",
        );
        return false;
      }
    },

    async complete(jobId: string, workerId: string): Promise<boolean> {
      try {
        await http.post(`/${jobId}/complete`, { workerId });
        return true;
      } catch (error) {
        logger.error(
          {
            jobId,
            workerId,
            error: error instanceof Error ? error.message : "Unknown",
          },
          "Complete error",
        );
        return false;
      }
    },

    async fail(
      jobId: string,
      workerId: string,
      errorMessage: string,
      retryAfter?: number,
    ): Promise<boolean> {
      try {
        await http.post(`/${jobId}/fail`, {
          workerId,
          error: errorMessage,
          retryAfter,
        });
        return true;
      } catch (error) {
        logger.error(
          {
            jobId,
            workerId,
            error: error instanceof Error ? error.message : "Unknown",
          },
          "Fail error",
        );
        return false;
      }
    },

    async reschedule(
      jobId: string,
      workerId: string,
      delay: number,
    ): Promise<boolean> {
      try {
        await http.post(`/${jobId}/reschedule`, {
          workerId,
          delay,
        });
        return true;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          logger.warn({ jobId, workerId }, "Reschedule failed: job not found");
          return false;
        }

        logger.error(
          {
            jobId,
            workerId,
            delay,
            error: error instanceof Error ? error.message : "Unknown",
          },
          "Reschedule error",
        );
        return false;
      }
    },

    async stats(name?: string): Promise<QueueStats> {
      try {
        const response = await http.get("/stats", {
          params: name ? { name } : undefined,
        });

        // Convert response format to QueueStats
        const data = response.data;
        if (name && data[name]) {
          const s = data[name];
          return {
            pending: s.pending || 0,
            processing: s.processing || 0,
            completed: s.completed || 0,
            failed: s.failed || 0,
            retryPending: s.retry_pending || 0,
          };
        }

        // Aggregate all queues
        const stats: QueueStats = {
          pending: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          retryPending: 0,
        };

        for (const queueName of Object.keys(data)) {
          const s = data[queueName];
          stats.pending += s.pending || 0;
          stats.processing += s.processing || 0;
          stats.completed += s.completed || 0;
          stats.failed += s.failed || 0;
          stats.retryPending += s.retry_pending || 0;
        }

        return stats;
      } catch (error) {
        logger.error(
          {
            name,
            error: error instanceof Error ? error.message : "Unknown",
          },
          "Stats error",
        );
        throw error;
      }
    },
  };
}
