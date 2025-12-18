/**
 * @eclaire/queue/driver-bullmq - Redis connection management
 */

import { Redis, type RedisOptions } from "ioredis";
import type { QueueLogger } from "../core/types.js";
import type { RedisConfig } from "./types.js";

/**
 * Stored event handlers for cleanup
 */
const connectionHandlers = new WeakMap<
  Redis,
  {
    connect: () => void;
    ready: () => void;
    error: (err: Error) => void;
    close: () => void;
    reconnecting: () => void;
  }
>();

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

  // Create named handlers for later removal
  const handlers = {
    connect: () => {
      logger.info({}, "Redis connected");
    },
    ready: () => {
      logger.debug({}, "Redis ready");
    },
    error: (err: Error) => {
      logger.error({ error: err.message }, "Redis error");
    },
    close: () => {
      logger.debug({}, "Redis connection closed");
    },
    reconnecting: () => {
      logger.debug({}, "Redis reconnecting");
    },
  };

  // Store handlers for cleanup
  connectionHandlers.set(connection, handlers);

  // Setup event handlers
  connection.on("connect", handlers.connect);
  connection.on("ready", handlers.ready);
  connection.on("error", handlers.error);
  connection.on("close", handlers.close);
  connection.on("reconnecting", handlers.reconnecting);

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
  // Remove event listeners to prevent memory leaks
  const handlers = connectionHandlers.get(connection);
  if (handlers) {
    connection.removeListener("connect", handlers.connect);
    connection.removeListener("ready", handlers.ready);
    connection.removeListener("error", handlers.error);
    connection.removeListener("close", handlers.close);
    connection.removeListener("reconnecting", handlers.reconnecting);
    connectionHandlers.delete(connection);
    logger.debug({}, "Removed Redis event listeners");
  }

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
