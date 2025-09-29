import { Hono } from "hono";
import { stream } from "hono/streaming";
import Redis from "ioredis";
import type { RouteVariables } from "@/types/route-variables";
import { getAuthenticatedUserId } from "../lib/auth-utils";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("processing-events");

export const processingEventsRoutes = new Hono<{ Variables: RouteVariables }>();

// Redis connection for pub/sub
const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

// Map to track active SSE streams by userId
const activeStreams = new Map<
  string,
  Set<{ write: (data: string) => void; closed: boolean }>
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
        write: stream.write.bind(stream),
        closed: stream.closed,
      };
      userStreams.add(streamRef);

      let subscriber: Redis | null = null;
      let keepAliveInterval: NodeJS.Timeout | null = null;

      try {
        // Create Redis subscriber for this user's processing events
        subscriber = new Redis(redisUrl, {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        });

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
              "Error sending SSE message",
            );
          }
        });

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
              "Error during SSE cleanup",
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
  try {
    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    const eventWithTimestamp = {
      ...event,
      timestamp: Date.now(),
    };

    await redis.publish(
      `processing:${userId}`,
      JSON.stringify(eventWithTimestamp),
    );
    await redis.quit();

    logger.debug(
      {
        userId,
        eventType: event.type,
        assetType: event.assetType,
        assetId: event.assetId,
      },
      "Published processing event",
    );
  } catch (error) {
    logger.error(
      {
        userId,
        event,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to publish processing event",
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
        streamRef.write(sseData);
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
