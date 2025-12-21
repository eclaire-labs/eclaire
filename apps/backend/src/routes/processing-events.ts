import { Hono } from "hono";
import { stream } from "hono/streaming";
import type { Redis } from "ioredis";
import postgres from "postgres";
import { createRedisConnection } from "@eclaire/queue";
import { createPostgresClient, getDatabaseUrl, getDatabaseType } from "@eclaire/db";
import type { RouteVariables } from "../types/route-variables.js";
import { getAuthenticatedUserId } from "../lib/auth-utils.js";
import { createChildLogger } from "../lib/logger.js";
import { getQueueBackend } from "../lib/env-validation.js";
import { sanitizeChannelName } from "../workers/lib/postgres-publisher.js";

const logger = createChildLogger("processing-events");

export const processingEventsRoutes = new Hono<{ Variables: RouteVariables }>();

// Queue backend determines how we receive events:
// - "redis" → Redis pub/sub
// - "postgres" → PostgreSQL LISTEN/NOTIFY
// - "sqlite" → In-memory only (single process)
const queueBackend = getQueueBackend();
const useRedisPubSub = queueBackend === "redis";

// Database type for Postgres LISTEN (used when not in Redis mode)
const dbType = getDatabaseType();
const usePostgresListen = !useRedisPubSub && dbType === "postgresql";
const postgresUrl = usePostgresListen ? getDatabaseUrl() : null;

// Redis connection for pub/sub (only used in redis mode)
const redisUrl = process.env.REDIS_URL;

// Warn if redis mode but no URL
if (useRedisPubSub && !redisUrl) {
  logger.warn({}, "REDIS_URL not set but queue mode is 'redis' - pub/sub will not work");
}

// Reusable Redis publisher connection (only created in redis mode)
let publisherConnection: Redis | null = useRedisPubSub && redisUrl
  ? createRedisConnection({
      url: redisUrl,
      logger,
      serviceName: "Processing Events Publisher",
    })
  : null;

if (!publisherConnection) {
  logger.info({ queueBackend }, "Using in-memory events only (no Redis pub/sub)");
}

// Map to track active SSE streams by userId
const activeStreams = new Map<
  string,
  Set<{ write: (data: string) => Promise<unknown>; closed: boolean }>
>();

/**
 * GET /api/processing-events/stream
 * Server-sent events stream for processing updates
 *
 * @tags Processing Events
 * @summary Real-time processing updates
 * @description Subscribe to real-time processing status updates via Server-Sent Events
 * @returns {EventStream} Server-sent events stream
 */
processingEventsRoutes.get("/stream", async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    return stream(c, async (stream) => {
      // Set up SSE headers
      c.header("Content-Type", "text/event-stream");
      c.header("Cache-Control", "no-cache");
      c.header("Connection", "keep-alive");
      c.header("Access-Control-Allow-Origin", "*");
      c.header("Access-Control-Allow-Headers", "Cache-Control");

      // Register this stream for direct publishing
      if (!activeStreams.has(userId)) {
        activeStreams.set(userId, new Set());
      }
      const userStreams = activeStreams.get(userId)!;
      const streamRef = {
        write: stream.write.bind(stream) as (data: string) => Promise<unknown>,
        closed: stream.closed,
      };
      userStreams.add(streamRef);

      let subscriber: Redis | null = null;
      let pgSubscriber: postgres.Sql | null = null;
      let pgListenSubscription: { unlisten: () => Promise<void> } | null = null;
      let keepAliveInterval: NodeJS.Timeout | null = null;

      try {
        // Create Redis subscriber only if in redis mode
        if (useRedisPubSub && redisUrl) {
          subscriber = createRedisConnection({
            url: redisUrl,
            logger,
            serviceName: `Processing Events Subscriber (${userId})`,
          });

          if (subscriber) {
            await subscriber.subscribe(`processing:${userId}`);

            // Handle incoming messages
            subscriber.on("message", (_channel, message) => {
              try {
                // Send the message as SSE data
                stream.write(`data: ${message}\n\n`);
              } catch (error) {
                logger.error(
                  {
                    userId,
                    error: error instanceof Error ? error.message : "Unknown error",
                  },
                  "Error sending SSE message from Redis",
                );
              }
            });

            logger.info({ userId }, "Redis subscriber active for processing events");
          }
        } else if (usePostgresListen && postgresUrl) {
          // Create Postgres LISTEN subscriber for remote database workers
          // Uses a dedicated connection per SSE client for LISTEN
          try {
            pgSubscriber = createPostgresClient(postgresUrl, {
              max: 1, // Single connection for this listener
            });

            const channel = sanitizeChannelName(userId);

            // Subscribe to Postgres notifications
            // listen() returns a subscription object with an unlisten() method
            pgListenSubscription = await pgSubscriber.listen(channel, (payload) => {
              try {
                // Send the payload as SSE data (already JSON stringified by publisher)
                stream.write(`data: ${payload}\n\n`);
              } catch (error) {
                logger.error(
                  {
                    userId,
                    error: error instanceof Error ? error.message : "Unknown error",
                  },
                  "Error sending SSE message from Postgres NOTIFY",
                );
              }
            });

            logger.info({ userId, channel }, "Postgres LISTEN subscriber active for processing events");
          } catch (pgError) {
            logger.error(
              {
                userId,
                error: pgError instanceof Error ? pgError.message : "Unknown error",
              },
              "Failed to set up Postgres LISTEN subscriber",
            );
          }
        } else {
          logger.info({ userId, queueBackend, dbType }, "Using in-memory events only (unified mode)");
        }

        // Send initial connection confirmation
        const connectionMessage = JSON.stringify({
          type: "connected",
          timestamp: Date.now(),
          userId,
        });
        stream.write(`data: ${connectionMessage}\n\n`);

        logger.info(
          {
            userId,
            useRedisPubSub,
          },
          "Processing events SSE connection established",
        );

        // Keep connection alive with periodic pings
        keepAliveInterval = setInterval(() => {
          try {
            const pingMessage = JSON.stringify({
              type: "ping",
              timestamp: Date.now(),
            });
            stream.write(`data: ${pingMessage}\n\n`);
          } catch (error) {
            logger.debug(
              {
                userId,
                error: error instanceof Error ? error.message : "Unknown error",
              },
              "Error sending ping, connection likely closed",
            );
          }
        }, 30000);

        // Wait for the stream to be closed
        await new Promise((resolve) => {
          const checkConnection = () => {
            if (stream.closed) {
              resolve(undefined);
            } else {
              setTimeout(checkConnection, 1000);
            }
          };
          checkConnection();
        });
      } catch (error) {
        logger.error(
          {
            userId,
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
          },
          "Error in processing events stream",
        );
      } finally {
        // Cleanup
        if (keepAliveInterval) {
          clearInterval(keepAliveInterval);
        }

        if (subscriber) {
          try {
            await subscriber.unsubscribe(`processing:${userId}`);
            await subscriber.quit();
          } catch (cleanupError) {
            logger.warn(
              {
                userId,
                error:
                  cleanupError instanceof Error
                    ? cleanupError.message
                    : "Unknown error",
              },
              "Error during Redis SSE cleanup",
            );
          }
        }

        // Cleanup Postgres LISTEN subscriber
        if (pgListenSubscription) {
          try {
            await pgListenSubscription.unlisten();
          } catch (cleanupError) {
            logger.warn(
              {
                userId,
                error:
                  cleanupError instanceof Error
                    ? cleanupError.message
                    : "Unknown error",
              },
              "Error during Postgres LISTEN cleanup",
            );
          }
        }
        if (pgSubscriber) {
          try {
            await pgSubscriber.end();
          } catch (cleanupError) {
            logger.warn(
              {
                userId,
                error:
                  cleanupError instanceof Error
                    ? cleanupError.message
                    : "Unknown error",
              },
              "Error closing Postgres connection",
            );
          }
        }

        // Unregister this stream from direct publishing
        const userStreams = activeStreams.get(userId);
        if (userStreams) {
          userStreams.delete(streamRef);
          if (userStreams.size === 0) {
            activeStreams.delete(userId);
          }
        }

        logger.info(
          {
            userId,
          },
          "Processing events SSE connection closed",
        );
      }
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error setting up processing events stream",
    );
    return c.json({ error: "Internal server error" }, 500);
  }
});

/**
 * Utility function to publish processing events
 * This can be called from other parts of the application
 */
export async function publishProcessingEvent(
  userId: string,
  event: {
    type: string;
    assetType?: string;
    assetId?: string;
    status?: string;
    stage?: string;
    progress?: number;
    error?: string;
    [key: string]: any;
  },
): Promise<void> {
  const eventWithTimestamp = {
    ...event,
    timestamp: Date.now(),
  };

  // ALWAYS publish to in-memory streams (works in all modes)
  await publishDirectSSEEvent(userId, eventWithTimestamp);

  // Conditionally publish to Redis pub/sub (only in redis mode)
  if (useRedisPubSub && publisherConnection) {
    try {
      await publisherConnection.publish(
        `processing:${userId}`,
        JSON.stringify(eventWithTimestamp),
      );

      logger.debug(
        {
          userId,
          eventType: event.type,
          assetType: event.assetType,
          assetId: event.assetId,
        },
        "Published processing event to Redis",
      );
    } catch (error) {
      logger.error(
        {
          userId,
          event,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to publish processing event to Redis",
      );
    }
  } else {
    logger.debug(
      {
        userId,
        eventType: event.type,
        queueBackend,
      },
      "Skipped Redis pub/sub (using in-memory only)",
    );
  }
}

/**
 * Publish event directly to active SSE streams without Redis pub/sub
 * This is used by the backend processing reporter for in-process events
 */
export async function publishDirectSSEEvent(
  userId: string,
  event: {
    type: string;
    assetType?: string;
    assetId?: string;
    status?: string;
    stage?: string;
    progress?: number;
    error?: string;
    timestamp?: number;
    [key: string]: any;
  },
): Promise<void> {
  try {
    const userStreams = activeStreams.get(userId);
    if (!userStreams || userStreams.size === 0) {
      logger.debug(
        { userId, eventType: event.type },
        "No active streams for direct SSE publishing",
      );
      return;
    }

    const eventWithTimestamp = {
      ...event,
      timestamp: event.timestamp || Date.now(),
    };

    const sseData = `data: ${JSON.stringify(eventWithTimestamp)}\n\n`;

    // Send to all active streams for this user
    const streamsToRemove: any[] = [];
    for (const streamRef of Array.from(userStreams)) {
      try {
        if (streamRef.closed) {
          streamsToRemove.push(streamRef);
          continue;
        }
        await streamRef.write(sseData);
      } catch (error) {
        logger.warn(
          {
            userId,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          "Error writing to SSE stream, marking for removal",
        );
        streamsToRemove.push(streamRef);
      }
    }

    // Clean up closed streams
    for (const streamRef of streamsToRemove) {
      userStreams.delete(streamRef);
    }
    if (userStreams.size === 0) {
      activeStreams.delete(userId);
    }

    logger.debug(
      {
        userId,
        eventType: event.type,
        assetType: event.assetType,
        assetId: event.assetId,
        activeStreamCount: userStreams.size,
      },
      "Published direct SSE event",
    );
  } catch (error) {
    logger.error(
      {
        userId,
        event,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to publish direct SSE event",
    );
  }
}

/**
 * Close processing events resources (for graceful shutdown)
 */
export async function closeProcessingEvents(): Promise<void> {
  if (publisherConnection) {
    try {
      await publisherConnection.quit();
      publisherConnection = null;
      logger.info({}, "Publisher Redis connection closed");
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Error closing publisher Redis connection",
      );
    }
  }
}
