/**
 * Postgres NOTIFY Publisher for Remote Database Workers
 *
 * Creates event callbacks that publish SSE events via Postgres NOTIFY.
 * The backend uses LISTEN to receive these notifications and forward to SSE clients.
 *
 * Used when workers connect to Postgres remotely (without Redis).
 *
 * Channel naming: `processing_{userId}` (underscores because Postgres
 * channel names don't support colons or special characters).
 */

import type { Logger } from "@eclaire/logger";
import {
  createEventCallbacks,
  type ProcessingSSEEvent,
} from "@eclaire/queue/app";
import type { JobEventCallbacks } from "@eclaire/queue/core";
import { sql } from "drizzle-orm";

// Use the exported db type from the backend
type DbInstance = ReturnType<
  // biome-ignore lint/suspicious/noExplicitAny: generic Drizzle instance type, actual schema varies
  typeof import("drizzle-orm/postgres-js").drizzle<any>
>;

/**
 * Sanitize user ID for use as Postgres channel name.
 * Postgres channel names are identifiers and should only contain
 * alphanumeric characters and underscores.
 */
function sanitizeChannelName(userId: string): string {
  return `processing_${userId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

/**
 * Create Postgres NOTIFY publisher for remote database workers.
 *
 * Publishes events to channel: `processing_{userId}`
 * Backend subscribes using LISTEN in processing-events.ts
 *
 * @param db - Drizzle database instance (must be Postgres)
 * @param logger - Logger instance
 * @returns JobEventCallbacks that publish via Postgres NOTIFY
 */
export function createPostgresPublisher(
  db: DbInstance,
  logger: Logger,
): JobEventCallbacks {
  const publisher = async (
    userId: string,
    event: ProcessingSSEEvent,
  ): Promise<void> => {
    try {
      const channel = sanitizeChannelName(userId);
      const payload = JSON.stringify(event);

      // Postgres NOTIFY with payload
      // Note: Payload is limited to 8000 bytes in Postgres
      await db.execute(sql`SELECT pg_notify(${channel}, ${payload})`);

      logger.debug(
        { userId, channel, eventType: event.type, assetType: event.assetType },
        "Published SSE event via Postgres NOTIFY",
      );
    } catch (error) {
      logger.error(
        {
          userId,
          eventType: event.type,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to publish SSE event via Postgres NOTIFY",
      );
    }
  };

  return createEventCallbacks({ publisher, logger });
}

/**
 * Export the channel name sanitizer for use by the LISTEN subscriber
 */
export { sanitizeChannelName };
