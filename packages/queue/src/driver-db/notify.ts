/**
 * @eclaire/queue/driver-db - PostgreSQL NOTIFY/LISTEN for horizontal scaling
 *
 * This module provides real-time job notifications using PostgreSQL's
 * NOTIFY/LISTEN mechanism. It allows multiple worker instances to be
 * immediately notified when jobs are available, eliminating the need
 * for polling.
 *
 * Usage:
 * - Emitter: Called when jobs are enqueued to notify waiting workers
 * - Listener: Used by workers to wait for job availability
 */

import type { QueueLogger } from "../core/types.js";
import type { NotifyEmitter, NotifyListener } from "./types.js";

/**
 * Default channel name for job notifications
 */
const DEFAULT_CHANNEL = "queue_jobs";

/**
 * Validate channel name is a safe PostgreSQL identifier
 *
 * PostgreSQL identifiers must:
 * - Start with a letter (a-z) or underscore (_)
 * - Contain only letters, digits (0-9), and underscores
 * - Be 63 characters or less (NAMEDATALEN - 1)
 *
 * @throws Error if channel name is invalid
 */
function assertValidChannel(channel: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(channel) || channel.length > 63) {
    throw new Error(
      `Invalid channel name: "${channel}". Must be a valid PostgreSQL identifier ` +
        "(start with letter/underscore, contain only letters/digits/underscores, max 63 chars).",
    );
  }
}

/**
 * Configuration for PG notify
 */
export interface PgNotifyConfig {
  /** Channel name for notifications (default: 'queue_jobs') */
  channel?: string;

  /** Logger instance */
  logger: QueueLogger;
}

/**
 * PostgreSQL client interface (compatible with 'pg' package)
 *
 * We use a minimal interface to avoid depending on the pg package directly.
 * Users provide their own pg.Client instance.
 */
export interface PgClient {
  query(text: string, values?: unknown[]): Promise<unknown>;
  on(event: "notification", handler: (msg: PgNotification) => void): void;
  on(event: "error", handler: (err: Error) => void): void;
  // biome-ignore lint/suspicious/noExplicitAny: Node.js EventEmitter compatibility — handler signature must accept any args
  removeListener(event: string, handler: (...args: any[]) => void): void;
}

export interface PgNotification {
  channel: string;
  payload?: string;
}

// ============================================================================
// Emitter Implementation
// ============================================================================

/**
 * Create a PG NOTIFY emitter
 *
 * The emitter is used to publish notifications when jobs are enqueued.
 * Each queue name gets its own notification with the queue name as payload.
 *
 * @param client - PostgreSQL client instance
 * @param config - Emitter configuration
 * @returns NotifyEmitter instance
 *
 * @example
 * ```typescript
 * import { Client } from 'pg';
 * import { createPgNotifyEmitter } from '@eclaire/queue/driver-db';
 *
 * const pgClient = new Client({ connectionString: process.env.DATABASE_URL });
 * await pgClient.connect();
 *
 * const emitter = createPgNotifyEmitter(pgClient, { logger });
 *
 * // When a job is enqueued:
 * await emitter.emit('bookmark-processing');
 * ```
 */
export function createPgNotifyEmitter(
  client: PgClient,
  config: PgNotifyConfig,
): NotifyEmitter {
  const { channel = DEFAULT_CHANNEL, logger } = config;

  // Validate channel to prevent SQL injection (channel is interpolated in NOTIFY)
  assertValidChannel(channel);

  return {
    async emit(name: string): Promise<void> {
      try {
        // Use NOTIFY with queue name as payload
        // The payload allows listeners to filter by queue
        await client.query(`NOTIFY ${channel}, $1`, [name]);
        logger.debug({ channel, name }, "Job notification sent");
      } catch (error) {
        logger.error(
          {
            channel,
            name,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          "Failed to send job notification",
        );
        // Don't throw - notification failure shouldn't fail the enqueue
      }
    },

    async close(): Promise<void> {
      // No cleanup needed for emitter
      logger.debug({ channel }, "PG notify emitter closed");
    },
  };
}

// ============================================================================
// Listener Implementation
// ============================================================================

/**
 * Create a PG LISTEN listener
 *
 * The listener subscribes to PostgreSQL notifications and invokes
 * callbacks when jobs become available for specific queues.
 *
 * @param client - PostgreSQL client instance (should be a dedicated connection)
 * @param config - Listener configuration
 * @returns NotifyListener instance
 *
 * @example
 * ```typescript
 * import { Client } from 'pg';
 * import { createPgNotifyListener } from '@eclaire/queue/driver-db';
 *
 * // IMPORTANT: Use a dedicated connection for LISTEN
 * // Do NOT share this connection with queries
 * const listenClient = new Client({ connectionString: process.env.DATABASE_URL });
 * await listenClient.connect();
 *
 * const listener = createPgNotifyListener(listenClient, { logger });
 *
 * // Subscribe to notifications for a queue
 * listener.subscribe('bookmark-processing', () => {
 *   console.log('Jobs available!');
 *   // Try to claim a job...
 * });
 * ```
 */
export function createPgNotifyListener(
  client: PgClient,
  config: PgNotifyConfig,
): NotifyListener {
  const { channel = DEFAULT_CHANNEL, logger } = config;

  // Validate channel to prevent SQL injection (channel is interpolated in LISTEN/UNLISTEN)
  assertValidChannel(channel);

  // Map of queue names to their callbacks
  const subscriptions = new Map<string, Set<() => void>>();

  // Track if we're listening
  let listening = false;

  // Notification handler
  const notificationHandler = (msg: PgNotification) => {
    if (msg.channel !== channel) {
      return;
    }

    const queueName = msg.payload;
    if (!queueName) {
      // No payload - notify all subscribers
      for (const callbacks of subscriptions.values()) {
        for (const callback of callbacks) {
          try {
            callback();
          } catch (err) {
            logger.error(
              { error: err instanceof Error ? err.message : "Unknown" },
              "Error in notification callback",
            );
          }
        }
      }
      return;
    }

    // Notify subscribers for this specific queue
    const callbacks = subscriptions.get(queueName);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback();
        } catch (err) {
          logger.error(
            {
              queueName,
              error: err instanceof Error ? err.message : "Unknown",
            },
            "Error in notification callback",
          );
        }
      }
    }
  };

  // Error handler
  const errorHandler = (err: Error) => {
    logger.error({ channel, error: err.message }, "PG notification error");
  };

  return {
    subscribe(name: string, callback: () => void): () => void {
      // Get or create callback set for this queue
      let callbacks = subscriptions.get(name);
      if (!callbacks) {
        callbacks = new Set();
        subscriptions.set(name, callbacks);
      }
      callbacks.add(callback);

      // Start listening if not already
      if (!listening) {
        client.on("notification", notificationHandler);
        client.on("error", errorHandler);

        // Issue LISTEN command
        client
          .query(`LISTEN ${channel}`)
          .then(() => {
            logger.info({ channel }, "Listening for job notifications");
            return undefined;
          })
          .catch((err) => {
            logger.error(
              {
                channel,
                error: err instanceof Error ? err.message : "Unknown",
              },
              "Failed to start listening",
            );
          });

        listening = true;
      }

      logger.debug({ channel, name }, "Subscribed to job notifications");

      // Return unsubscribe function for THIS specific callback
      return () => {
        const cbs = subscriptions.get(name);
        if (cbs) {
          cbs.delete(callback);
          if (cbs.size === 0) {
            subscriptions.delete(name);
          }
        }
        logger.debug({ channel, name }, "Unsubscribed from job notifications");
      };
    },

    async close(): Promise<void> {
      // Remove handlers
      client.removeListener("notification", notificationHandler);
      client.removeListener("error", errorHandler);

      // Issue UNLISTEN command
      if (listening) {
        try {
          await client.query(`UNLISTEN ${channel}`);
        } catch (err) {
          logger.error(
            { channel, error: err instanceof Error ? err.message : "Unknown" },
            "Failed to unlisten",
          );
        }
        listening = false;
      }

      // Clear subscriptions
      subscriptions.clear();

      logger.debug({ channel }, "PG notify listener closed");
    },
  };
}

// ============================================================================
// In-Memory Fallback (for SQLite or testing)
// ============================================================================

/**
 * Create an in-memory notify emitter/listener pair
 *
 * This is used for:
 * - SQLite (which doesn't support NOTIFY)
 * - Testing without a real database
 * - Single-process deployments
 *
 * Note: This only works within a single process. For horizontal scaling
 * with SQLite, you'll need to use polling or an external pub/sub system.
 *
 * @param config - Configuration
 * @returns Object containing both emitter and listener
 */
export function createInMemoryNotify(config: { logger: QueueLogger }): {
  emitter: NotifyEmitter;
  listener: NotifyListener;
} {
  const { logger } = config;
  const subscriptions = new Map<string, Set<() => void>>();

  const emitter: NotifyEmitter = {
    async emit(name: string): Promise<void> {
      const callbacks = subscriptions.get(name);
      if (callbacks) {
        for (const callback of callbacks) {
          // Use setImmediate to avoid blocking
          setImmediate(() => {
            try {
              callback();
            } catch (err) {
              logger.error(
                { name, error: err instanceof Error ? err.message : "Unknown" },
                "Error in notification callback",
              );
            }
          });
        }
      }
      logger.debug({ name }, "In-memory notification sent");
    },

    async close(): Promise<void> {
      logger.debug({}, "In-memory emitter closed");
    },
  };

  const listener: NotifyListener = {
    subscribe(name: string, callback: () => void): () => void {
      let callbacks = subscriptions.get(name);
      if (!callbacks) {
        callbacks = new Set();
        subscriptions.set(name, callbacks);
      }
      callbacks.add(callback);
      logger.debug({ name }, "In-memory subscription added");

      // Return unsubscribe function for THIS specific callback
      return () => {
        const cbs = subscriptions.get(name);
        if (cbs) {
          cbs.delete(callback);
          if (cbs.size === 0) {
            subscriptions.delete(name);
          }
        }
        logger.debug({ name }, "In-memory subscription removed");
      };
    },

    async close(): Promise<void> {
      subscriptions.clear();
      logger.debug({}, "In-memory listener closed");
    },
  };

  return { emitter, listener };
}

// ============================================================================
// Polling Notifier (for SQLite multi-process or when no NOTIFY available)
// ============================================================================

/**
 * Configuration for the polling notifier
 */
export interface PollingNotifyConfig {
  /** Logger instance */
  logger: QueueLogger;

  /** Poll interval in milliseconds (default: 5000) */
  pollInterval?: number;
}

/**
 * Create a polling-based notify listener
 *
 * This is used when:
 * - SQLite in multi-process mode (no cross-process NOTIFY)
 * - No real notification system is available
 *
 * The polling notifier fires callbacks periodically, allowing workers
 * to use the same "wait for notification" interface regardless of
 * whether real NOTIFY is available.
 *
 * @param config - Configuration
 * @returns NotifyListener that polls on a timer
 *
 * @example
 * ```typescript
 * const listener = createPollingNotifyListener({
 *   logger,
 *   pollInterval: 5000,  // Check every 5 seconds
 * });
 *
 * // Worker can now use the same interface as with real NOTIFY
 * const unsubscribe = listener.subscribe('my-queue', () => {
 *   // Try to claim a job...
 * });
 * ```
 */
export function createPollingNotifyListener(
  config: PollingNotifyConfig,
): NotifyListener {
  const { logger, pollInterval = 5000 } = config;
  const subscriptions = new Map<string, Set<() => void>>();
  let intervalId: ReturnType<typeof setInterval> | null = null;

  /**
   * Fire all registered callbacks
   */
  function fireCallbacks(): void {
    for (const callbacks of subscriptions.values()) {
      for (const callback of callbacks) {
        try {
          callback();
        } catch (err) {
          logger.error(
            { error: err instanceof Error ? err.message : "Unknown" },
            "Error in polling notification callback",
          );
        }
      }
    }
  }

  /**
   * Start the polling interval if not already running
   */
  function startPollingIfNeeded(): void {
    if (!intervalId && subscriptions.size > 0) {
      intervalId = setInterval(fireCallbacks, pollInterval);
      logger.debug({ pollInterval }, "Polling notifier started");
    }
  }

  /**
   * Stop the polling interval if no more subscriptions
   */
  function stopPollingIfEmpty(): void {
    if (intervalId && subscriptions.size === 0) {
      clearInterval(intervalId);
      intervalId = null;
      logger.debug({}, "Polling notifier stopped");
    }
  }

  return {
    subscribe(name: string, callback: () => void): () => void {
      // Get or create callback set for this queue
      let callbacks = subscriptions.get(name);
      if (!callbacks) {
        callbacks = new Set();
        subscriptions.set(name, callbacks);
      }
      callbacks.add(callback);

      // Start polling if this is the first subscription
      startPollingIfNeeded();

      logger.debug({ name, pollInterval }, "Polling subscription added");

      // Return unsubscribe function for THIS specific callback
      return () => {
        const cbs = subscriptions.get(name);
        if (cbs) {
          cbs.delete(callback);
          if (cbs.size === 0) {
            subscriptions.delete(name);
          }
        }

        // Stop polling if no more subscriptions
        stopPollingIfEmpty();

        logger.debug({ name }, "Polling subscription removed");
      };
    },

    async close(): Promise<void> {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      subscriptions.clear();
      logger.debug({}, "Polling notifier closed");
    },
  };
}
