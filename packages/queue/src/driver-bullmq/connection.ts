/**
 * @eclaire/queue/driver-bullmq - Redis connection management
 */

import { Redis, type RedisOptions } from "ioredis";
import type { QueueLogger } from "../core/types.js";
import type { RedisConfig } from "./types.js";

/**
 * Create a Redis connection for BullMQ
 *
 * BullMQ requires specific Redis options to work correctly:
 * - maxRetriesPerRequest: null (allows BullMQ to handle retries)
 * - enableReadyCheck: false (BullMQ manages connection state)
 *
 * @param config - Redis configuration
 * @param logger - Logger instance
 * @returns Redis connection
 */
export function createRedisConnection(
  config: RedisConfig,
  logger: QueueLogger,
): Redis {
  // If an existing connection is provided, use it
  if (config.connection) {
    logger.debug({}, "Using existing Redis connection");
    return config.connection;
  }

  // BullMQ-specific options
  const bullmqOptions: RedisOptions = {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false, // BullMQ handles this
    ...config.options,
  };

  let connection: Redis;

  if (config.url) {
    connection = new Redis(config.url, bullmqOptions);
    logger.debug({ url: config.url.replace(/:[^:@]+@/, ':***@') }, "Creating Redis connection from URL");
  } else {
    connection = new Redis(bullmqOptions);
    logger.debug({}, "Creating Redis connection from options");
  }

  // Setup event handlers
  connection.on("connect", () => {
    logger.info({}, "Redis connected");
  });

  connection.on("ready", () => {
    logger.debug({}, "Redis ready");
  });

  connection.on("error", (err) => {
    logger.error({ error: err.message }, "Redis error");
  });

  connection.on("close", () => {
    logger.debug({}, "Redis connection closed");
  });

  connection.on("reconnecting", () => {
    logger.debug({}, "Redis reconnecting");
  });

  return connection;
}

/**
 * Close a Redis connection
 *
 * @param connection - Redis connection to close
 * @param logger - Logger instance
 */
export async function closeRedisConnection(
  connection: Redis,
  logger: QueueLogger,
): Promise<void> {
  try {
    await connection.quit();
    logger.debug({}, "Redis connection closed gracefully");
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown" },
      "Error closing Redis connection",
    );
    // Force disconnect if quit fails
    connection.disconnect();
  }
}
