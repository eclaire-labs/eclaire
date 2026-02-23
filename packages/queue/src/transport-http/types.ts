/**
 * @eclaire/queue/transport-http - Types for the HTTP transport layer
 */

import type { QueueLogger } from "../core/types.js";

/**
 * Configuration for the HTTP server
 */
export interface HttpServerConfig {
  /** Logger instance */
  logger: QueueLogger;
}

/**
 * HTTP routes handler interface
 *
 * This interface defines the routes that the HTTP server exposes.
 * It can be integrated with any HTTP framework (Express, Hono, Fastify, etc.)
 */
export interface HttpRoutesHandler {
  /**
   * Wait for a job to become available (long-polling)
   *
   * @param name - Queue name
   * @param workerId - Worker ID
   * @param timeout - How long to wait for a job (milliseconds)
   * @returns Claimed job or null if timeout
   */
  wait(
    name: string,
    workerId: string,
    timeout: number,
  ): Promise<HttpJobResponse | null>;

  /**
   * Claim a job (non-blocking)
   *
   * @param name - Queue name
   * @param workerId - Worker ID
   * @returns Claimed job or null if none available
   */
  claim(name: string, workerId: string): Promise<HttpJobResponse | null>;

  /**
   * Send heartbeat for a job
   *
   * @param jobId - Job ID
   * @param workerId - Worker ID
   * @returns Success status
   */
  heartbeat(jobId: string, workerId: string): Promise<boolean>;

  /**
   * Mark job as completed
   *
   * @param jobId - Job ID
   * @param workerId - Worker ID
   * @returns Success status
   */
  complete(jobId: string, workerId: string): Promise<boolean>;

  /**
   * Mark job as failed
   *
   * @param jobId - Job ID
   * @param workerId - Worker ID
   * @param error - Error message
   * @param retryAfter - If set, reschedule job for rate limit (milliseconds)
   * @returns Success status
   */
  fail(
    jobId: string,
    workerId: string,
    error: string,
    retryAfter?: number,
  ): Promise<boolean>;

  /**
   * Get queue statistics
   *
   * @param name - Optional queue name filter
   * @returns Queue statistics
   */
  stats(name?: string): Promise<HttpStatsResponse>;
}

/**
 * Job response from HTTP API
 */
export interface HttpJobResponse {
  id: string;
  queue: string;
  key?: string;
  data: unknown;
  priority: number;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  scheduledFor?: string;
}

/**
 * Stats response from HTTP API
 */
export interface HttpStatsResponse {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  retryPending: number;
}

/**
 * Configuration for the HTTP client (worker side)
 */
export interface HttpClientConfig {
  /** Backend URL (e.g., "http://localhost:3000") */
  backendUrl: string;

  /** Logger instance */
  logger: QueueLogger;

  /** Request timeout in milliseconds (default: 35000) */
  requestTimeout?: number;
}

/**
 * Configuration for the HTTP poller
 */
export interface HttpPollerConfig extends HttpClientConfig {
  /** Worker ID (auto-generated if not provided) */
  workerId?: string;

  /** Wait timeout for long-polling (default: 30000) */
  waitTimeout?: number;

  /** Heartbeat interval (default: 60000) */
  heartbeatInterval?: number;

  /** Error retry delay (default: 2000) */
  errorRetryDelay?: number;

  /**
   * Timeout for graceful shutdown in milliseconds (default: 30000)
   *
   * After calling stop(), the worker will wait up to this long for active jobs
   * to complete before returning. If the timeout is reached, stop() returns
   * even if jobs are still active.
   */
  gracefulShutdownTimeout?: number;
}
