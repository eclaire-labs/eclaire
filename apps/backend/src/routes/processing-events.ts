import {
  createPostgresClient,
  getDatabaseType,
  getDatabaseUrl,
} from "@eclaire/db";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import type postgres from "postgres";
import { config } from "../config/index.js";
import { createChildLogger } from "../lib/logger.js";
import { withAuth } from "../middleware/with-auth.js";
import type { RouteVariables } from "../types/route-variables.js";
import { sanitizeChannelName } from "../workers/lib/postgres-publisher.js";

const logger = createChildLogger("processing-events");

export const processingEventsRoutes = new Hono<{ Variables: RouteVariables }>();

// Database type for Postgres LISTEN (used when workers run in a separate process)
// In "all" mode, workers run in-process and publish via publishDirectSSEEvent() (in-memory).
// Postgres LISTEN is only needed when workers run in a separate process (serviceRole="api" or "worker").
const dbType = getDatabaseType();
const usePostgresListen = dbType === "postgres" && config.serviceRole !== "all";
const postgresUrl = usePostgresListen ? getDatabaseUrl() : null;

// Map to track active SSE streams by userId → clientId → stream ref
type StreamRef = {
  write: (data: string) => Promise<unknown>;
  readonly closed: boolean;
  abort: () => void;
};
const activeStreams = new Map<string, Map<string, StreamRef>>();

// Validate clientId: must be a UUID-like string (alphanumeric + hyphens, max 64 chars)
const CLIENT_ID_RE = /^[a-zA-Z0-9-]{1,64}$/;

/**
 * GET /api/processing-events/stream
 * Server-sent events stream for processing updates
 *
 * @tags Processing Events
 * @summary Real-time processing updates
 * @description Subscribe to real-time processing status updates via Server-Sent Events
 * @returns {EventStream} Server-sent events stream
 */
processingEventsRoutes.get(
  "/stream",
  withAuth(async (c, userId) => {
    // Read clientId from query param (stable per browser tab via sessionStorage)
    const rawClientId = c.req.query("clientId");
    const clientId =
      rawClientId && CLIENT_ID_RE.test(rawClientId)
        ? rawClientId
        : crypto.randomUUID();

    return stream(c, async (stream) => {
      // Set up SSE headers
      c.header("Content-Type", "text/event-stream");
      c.header("Cache-Control", "no-cache");
      c.header("Connection", "keep-alive");
      c.header("Access-Control-Allow-Origin", "*");
      c.header("Access-Control-Allow-Headers", "Cache-Control");

      // Register this stream for direct publishing
      if (!activeStreams.has(userId)) {
        activeStreams.set(userId, new Map());
      }
      // biome-ignore lint/style/noNonNullAssertion: map entry set on preceding line
      const userStreams = activeStreams.get(userId)!;

      // Close previous connection from the same client/tab
      const existingStream = userStreams.get(clientId);
      if (existingStream) {
        logger.info(
          { userId, clientId },
          "Closing previous SSE connection for same client",
        );
        existingStream.abort();
      }

      const streamRef: StreamRef = {
        write: stream.write.bind(stream) as (data: string) => Promise<unknown>,
        get closed() {
          return stream.closed || stream.aborted;
        },
        abort: () => stream.abort(),
      };
      userStreams.set(clientId, streamRef);

      let pgSubscriber: postgres.Sql | null = null;
      let pgListenSubscription: { unlisten: () => Promise<void> } | null = null;
      let keepAliveInterval: NodeJS.Timeout | null = null;

      try {
        if (usePostgresListen && postgresUrl) {
          // Create Postgres LISTEN subscriber for remote database workers
          // Uses a dedicated connection per SSE client for LISTEN
          try {
            pgSubscriber = createPostgresClient(postgresUrl, {
              max: 1, // Single connection for this listener
            });

            const channel = sanitizeChannelName(userId);

            // Subscribe to Postgres notifications
            // listen() returns a subscription object with an unlisten() method
            pgListenSubscription = await pgSubscriber.listen(
              channel,
              (payload) => {
                try {
                  // Send the payload as SSE data (already JSON stringified by publisher)
                  stream.write(`data: ${payload}\n\n`);
                } catch (error) {
                  logger.error(
                    {
                      userId,
                      error:
                        error instanceof Error
                          ? error.message
                          : "Unknown error",
                    },
                    "Error sending SSE message from Postgres NOTIFY",
                  );
                }
              },
            );

            logger.info(
              { userId, channel },
              "Postgres LISTEN subscriber active for processing events",
            );
          } catch (pgError) {
            logger.error(
              {
                userId,
                error:
                  pgError instanceof Error ? pgError.message : "Unknown error",
              },
              "Failed to set up Postgres LISTEN subscriber",
            );
          }
        } else {
          logger.info(
            { userId, dbType },
            "Using in-memory events only (unified mode)",
          );
        }

        // Send initial connection confirmation
        const connectionMessage = JSON.stringify({
          type: "connected",
          timestamp: Date.now(),
          userId,
        });
        stream.write(`data: ${connectionMessage}\n\n`);

        logger.info({ userId }, "Processing events SSE connection established");

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

        // Wait for the stream to be closed or aborted (client disconnect)
        await new Promise<void>((resolve) => {
          stream.onAbort(() => resolve());
          // Also poll in case stream closes without abort signal
          const checkConnection = () => {
            if (stream.closed || stream.aborted) {
              resolve();
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
        const currentStreams = activeStreams.get(userId);
        if (currentStreams) {
          // Only remove if this stream is still the registered one for this clientId
          if (currentStreams.get(clientId) === streamRef) {
            currentStreams.delete(clientId);
          }
          if (currentStreams.size === 0) {
            activeStreams.delete(userId);
          }
        }

        logger.info(
          { userId, clientId },
          "Processing events SSE connection closed",
        );
      }
    });
  }, logger),
);

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
    // biome-ignore lint/suspicious/noExplicitAny: event index signature
    [key: string]: any;
  },
): Promise<void> {
  const eventWithTimestamp = {
    ...event,
    timestamp: Date.now(),
  };

  // Publish to in-memory streams
  await publishDirectSSEEvent(userId, eventWithTimestamp);
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
    // biome-ignore lint/suspicious/noExplicitAny: event index signature
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
    const clientIdsToRemove: string[] = [];
    for (const [clientId, streamRef] of Array.from(userStreams)) {
      try {
        if (streamRef.closed) {
          clientIdsToRemove.push(clientId);
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
        clientIdsToRemove.push(clientId);
      }
    }

    // Clean up closed streams
    for (const clientId of clientIdsToRemove) {
      userStreams.delete(clientId);
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
  // No external connections to close — in-memory streams clean up on disconnect
}
