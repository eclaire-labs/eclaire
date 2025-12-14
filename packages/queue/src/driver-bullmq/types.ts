/**
 * @eclaire/queue/driver-bullmq - Types for the BullMQ driver
 */

import type { QueueLogger, BackoffStrategy } from "../core/types.js";
import type { Redis, RedisOptions } from "ioredis";

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
