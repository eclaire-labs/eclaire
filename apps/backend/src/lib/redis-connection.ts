// Shared Redis connection setup for BullMQ
import { Redis } from "ioredis";
import type { Logger } from "pino";

export interface RedisConnectionOptions {
  url: string;
  logger: Logger;
  serviceName: string; // e.g., "Backend Service" or "Workers"
}

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

  // Set up event handlers
  connection.on("error", (err) =>
    logger.error(
      {
        error: err instanceof Error ? err.message : "Unknown error",
        stack: err instanceof Error ? err.stack : undefined,
      },
      `${serviceName} Redis Connection Error`,
    ),
  );

  connection.on("connect", () =>
    logger.info({}, `${serviceName} Redis Connected`),
  );

  connection.on("close", () =>
    logger.info({}, `${serviceName} Redis Connection Closed`),
  );

  connection.on("reconnecting", () =>
    logger.info({}, `${serviceName} Redis Reconnecting`),
  );

  logger.info({}, `Redis connection initialized for ${serviceName}`);

  return connection;
}
