/**
 * Redis Pub/Sub Publisher for Remote BullMQ Workers
 *
 * Creates event callbacks that publish SSE events to Redis pub/sub.
 * The backend subscribes to these channels and forwards to connected SSE clients.
 *
 * Used when SERVICE_ROLE=worker (separate container with Redis access).
 */

import type { Logger } from "@eclaire/logger";
import {
  createRedisConnection,
  type RedisConnectionOptions,
} from "@eclaire/queue";
import {
  createEventCallbacks,
  type ProcessingSSEEvent,
} from "@eclaire/queue/app";
import type { JobEventCallbacks } from "@eclaire/queue/core";
import type { Redis } from "ioredis";

/**
 * Create Redis pub/sub publisher for remote BullMQ workers.
 *
 * Publishes events to channel: `{keyPrefix}:processing:{userId}`
 * Backend subscribes to this channel in processing-events.ts
 *
 * @param redisUrl - Redis connection URL
 * @param logger - Logger instance
 * @param keyPrefix - Redis key prefix (default: "eclaire")
 * @returns JobEventCallbacks that publish to Redis
 */
export function createRedisPublisher(
  redisUrl: string,
  logger: Logger,
  keyPrefix: string = "eclaire",
): JobEventCallbacks {
  let redis: Redis | null = null;

  // Lazy initialization to avoid blocking startup
  const getRedis = (): Redis | null => {
    if (!redis) {
      redis = createRedisConnection({
        url: redisUrl,
        logger,
        serviceName: "Worker SSE Publisher",
      });
    }
    return redis;
  };

  const publisher = async (
    userId: string,
    event: ProcessingSSEEvent,
  ): Promise<void> => {
    const connection = getRedis();
    if (!connection) {
      logger.warn({ userId }, "Redis not available for SSE publishing");
      return;
    }

    try {
      const channel = `${keyPrefix}:processing:${userId}`;
      await connection.publish(channel, JSON.stringify(event));

      logger.debug(
        { userId, eventType: event.type, assetType: event.assetType },
        "Published SSE event to Redis",
      );
    } catch (error) {
      logger.error(
        {
          userId,
          eventType: event.type,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to publish SSE event to Redis",
      );
    }
  };

  return createEventCallbacks({ publisher, logger });
}

/**
 * Close the Redis publisher connection
 *
 * Call this during graceful shutdown to clean up connections.
 */
export async function closeRedisPublisher(
  publisher: JobEventCallbacks,
): Promise<void> {
  // Note: The Redis connection is managed internally by createRedisConnection
  // and will be cleaned up when the process exits or when explicitly closed.
  // This function is a placeholder for future explicit cleanup if needed.
}
