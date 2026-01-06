/**
 * @eclaire/queue/driver-bullmq - Types for the BullMQ driver
 */

import type { WorkerOptions as BullMQWorkerOptions } from "bullmq";
import type { Redis, RedisOptions } from "ioredis";
import type {
  BackoffStrategy,
  JobEventCallbacks,
  QueueLogger,
} from "../core/types.js";

/**
 * Redis connection configuration
 */
export interface RedisConfig {
  /** Redis connection URL (e.g., "redis://localhost:6379") */
  url?: string;

  /** Redis connection options (alternative to URL) */
  options?: RedisOptions;

  /** Existing Redis connection (alternative to url/options) */
  connection?: Redis;
}

/**
 * Configuration for the BullMQ queue client
 */
export interface BullMQClientConfig {
  /** Redis configuration */
  redis: RedisConfig;

  /** Logger instance */
  logger: QueueLogger;

  /** Default prefix for queue names (default: 'queue') */
  prefix?: string;

  /** Default backoff strategy for retries */
  defaultBackoff?: BackoffStrategy;

  /** Default max attempts for jobs */
  defaultMaxAttempts?: number;
}

/**
 * Configuration for the BullMQ worker
 */
export interface BullMQWorkerConfig {
  /** Redis configuration */
  redis: RedisConfig;

  /** Logger instance */
  logger: QueueLogger;

  /** Default prefix for queue names (default: 'queue') */
  prefix?: string;

  /**
   * Event callbacks for job lifecycle events (optional)
   *
   * These are called when jobs start/complete stages or finish processing.
   * Typically used to publish real-time updates via SSE or WebSocket.
   */
  eventCallbacks?: JobEventCallbacks;

  /**
   * Additional BullMQ-specific worker options (optional)
   *
   * Pass through options like `limiter` that aren't exposed in the generic WorkerOptions.
   * These are spread into the underlying BullMQ Worker construction.
   */
  bullmqOptions?: Partial<BullMQWorkerOptions>;

  /**
   * Optional wrapper for job execution context (e.g., for request tracing).
   *
   * Receives the requestId from job data (if present) and a function to execute.
   * Use this to wrap job processing in AsyncLocalStorage or similar context.
   *
   * @example
   * ```typescript
   * wrapJobExecution: async (requestId, execute) => {
   *   if (requestId) {
   *     return runWithRequestId(requestId, execute);
   *   }
   *   return execute();
   * }
   * ```
   */
  wrapJobExecution?: <R>(
    requestId: string | undefined,
    execute: () => Promise<R>,
  ) => Promise<R>;
}

/**
 * Configuration for the BullMQ scheduler
 */
export interface BullMQSchedulerConfig {
  /** Redis configuration */
  redis: RedisConfig;

  /** Logger instance */
  logger: QueueLogger;

  /** Default prefix for queue names (default: 'queue') */
  prefix?: string;
}
