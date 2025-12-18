/**
 * Shared Redis connection setup for BullMQ
 */

import { Redis } from "ioredis";
import type { QueueLogger } from "../core/types.js";

export interface RedisConnectionOptions {
  url: string;
  logger: QueueLogger;
  serviceName: string; // e.g., "Backend Service" or "Workers"
}

/**
 * Stored event handlers for cleanup
 */
const connectionHandlers = new WeakMap<
  Redis,
  {
    error: (err: Error) => void;
    connect: () => void;
    close: () => void;
    reconnecting: () => void;
  }
>();

/**
 * Creates a Redis connection configured for BullMQ with proper event handlers
 * @param options Configuration options including URL, logger, and service name
 * @returns Redis connection instance or null if URL is not provided
 */
export function createRedisConnection(
  options: RedisConnectionOptions,
): Redis | null {
  const { url, logger, serviceName } = options;

  if (!url) {
    logger.error(
      {},
      `FATAL: REDIS_URL not provided but needed for ${serviceName}`,
    );
    return null;
  }

  // Use recommended BullMQ options
  const connection = new Redis(url, {
    maxRetriesPerRequest: null, // Recommended for BullMQ
    enableReadyCheck: false, // BullMQ handles readiness checks (recommended for BullMQ >= 4)
  });

  // Create named handlers for later removal
  const handlers = {
    error: (err: Error) =>
      logger.error(
        {
          error: err instanceof Error ? err.message : "Unknown error",
          stack: err instanceof Error ? err.stack : undefined,
        },
        `${serviceName} Redis Connection Error`,
      ),
    connect: () => logger.info({}, `${serviceName} Redis Connected`),
    close: () => logger.info({}, `${serviceName} Redis Connection Closed`),
    reconnecting: () => logger.info({}, `${serviceName} Redis Reconnecting`),
  };

  // Store handlers for cleanup
  connectionHandlers.set(connection, handlers);

  // Set up event handlers
  connection.on("error", handlers.error);
  connection.on("connect", handlers.connect);
  connection.on("close", handlers.close);
  connection.on("reconnecting", handlers.reconnecting);

  logger.info({}, `Redis connection initialized for ${serviceName}`);

  return connection;
}

/**
 * Close a Redis connection and remove event listeners
 * @param connection Redis connection to close
 * @param logger Logger instance
 */
export async function closeRedisConnection(
  connection: Redis,
  logger: QueueLogger,
): Promise<void> {
  // Remove event listeners to prevent memory leaks
  const handlers = connectionHandlers.get(connection);
  if (handlers) {
    connection.removeListener("error", handlers.error);
    connection.removeListener("connect", handlers.connect);
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
