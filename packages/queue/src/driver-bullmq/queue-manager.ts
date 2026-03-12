/**
 * BullMQ queue management
 */

import { getErrorMessage } from "../core/error-utils.js";
import type { QueueLogger } from "../core/types.js";
import { type JobsOptions, Queue } from "bullmq";
import {
  closeRedisConnection,
  createRedisConnection,
} from "../shared/redis-connection.js";

export interface QueueManagerConfig {
  /** Redis URL for BullMQ */
  redisUrl: string;
  /** Logger instance */
  logger: QueueLogger;
  /** Service name for logging */
  serviceName?: string;
  /** Redis key prefix for BullMQ (default: "eclaire") */
  prefix?: string;
  /** Optional default job options per queue name */
  defaultJobOptions?: Record<string, JobsOptions>;
}

export interface QueueManager {
  /** Get a queue by name */
  getQueue(name: string): Queue | null;
  /** Close all queues and Redis connection */
  close(): Promise<void>;
  /** Check if manager is connected */
  isConnected(): boolean;
}

/**
 * Creates a BullMQ queue manager with Redis connection
 */
export function createQueueManager(config: QueueManagerConfig): QueueManager {
  const {
    redisUrl,
    logger,
    serviceName = "Queue Service",
    prefix = "eclaire",
    defaultJobOptions: defaultJobOptionsMap,
  } = config;

  // Store queue instances to avoid recreating them
  const queues: Record<string, Queue> = {};

  // Store error handlers for cleanup
  const errorHandlers: Record<string, (error: Error) => void> = {};

  // Create Redis connection
  const connection = createRedisConnection({
    url: redisUrl,
    logger,
    serviceName,
  });

  if (!connection) {
    logger.error(
      {},
      "Failed to create Redis connection - queue manager will return null for all queues",
    );
  }

  return {
    getQueue(name: string): Queue | null {
      // Check if connection is available
      if (!connection) {
        logger.error(
          { queueName: name },
          "Redis connection not available - cannot get queue",
        );
        return null;
      }

      // Get or create queue
      if (!queues[name]) {
        try {
          logger.info({ queueName: name, prefix }, "Initializing queue");
          queues[name] = new Queue(name, {
            connection: connection,
            prefix,
            defaultJobOptions: defaultJobOptionsMap?.[name],
          });
          logger.info({ queueName: name }, "Queue initialized successfully");

          // Create and store error handler for later removal
          const errorHandler = (error: Error) => {
            logger.error(
              {
                queueName: name,
                error: getErrorMessage(error),
                stack: error instanceof Error ? error.stack : undefined,
              },
              "BullMQ Queue Error",
            );
          };
          errorHandlers[name] = errorHandler;
          queues[name]?.on("error", errorHandler);
        } catch (error) {
          logger.error(
            {
              queueName: name,
              error: getErrorMessage(error),
              stack: error instanceof Error ? error.stack : undefined,
            },
            "Failed to initialize queue",
          );
          return null;
        }
      }
      return queues[name] ?? null;
    },

    async close(): Promise<void> {
      if (!connection) {
        logger.info({}, "No Redis connection to close");
        return;
      }

      logger.info({}, "Closing BullMQ queue connections");
      let hadError = false;

      // Close all queues and remove error listeners
      for (const name in queues) {
        try {
          const queue = queues[name];
          if (queue) {
            // Remove error listener before closing
            const handler = errorHandlers[name];
            if (handler) {
              queue.removeListener("error", handler);
              delete errorHandlers[name];
            }
            await queue.close();
          }
          logger.info({ queueName: name }, "Queue closed");
        } catch (error) {
          logger.error(
            {
              queueName: name,
              error: getErrorMessage(error),
              stack: error instanceof Error ? error.stack : undefined,
            },
            "Error closing queue",
          );
          hadError = true;
        }
      }

      // Close Redis connection (uses closeRedisConnection which removes listeners)
      try {
        if (
          connection.status === "ready" ||
          connection.status === "connecting" ||
          connection.status === "reconnecting"
        ) {
          await closeRedisConnection(connection, logger);
          logger.info({}, "Redis connection closed");
        } else {
          logger.info(
            { connectionStatus: connection.status },
            "Redis connection already in non-active state. No need to quit",
          );
        }
      } catch (error) {
        logger.error(
          {
            error: getErrorMessage(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
          "Error quitting Redis connection",
        );
        hadError = true;
      }

      if (!hadError) {
        logger.info({}, "BullMQ queue connections closed successfully");
      } else {
        logger.warn({}, "BullMQ queue connections closed with errors");
      }
    },

    isConnected(): boolean {
      return connection?.status === "ready";
    },
  };
}
