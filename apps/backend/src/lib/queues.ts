// backend/src/lib/queues.ts
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { createChildLogger } from "./logger";

const logger = createChildLogger("queues");

// --- Configuration ---
const queueBackend = process.env.QUEUE_BACKEND || "redis";

export const QueueNames = {
  BOOKMARK_PROCESSING: "bookmark-processing",
  IMAGE_PROCESSING: "image-processing",
  DOCUMENT_PROCESSING: "document-processing",
  NOTE_PROCESSING: "note-processing",
  TASK_PROCESSING: "task-processing",
  TASK_EXECUTION_PROCESSING: "task-execution-processing",
} as const;

// --- Conditional Redis Connection ---
let connection: Redis | null = null;

if (queueBackend === "redis") {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    logger.error(
      {},
      "FATAL: REDIS_URL environment variable is not set but QUEUE_BACKEND=redis. Queue functionality will fail",
    );
  } else {
    // Use recommended BullMQ options
    connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false, // Recommended for BullMQ >= 4. BullMQ handles readiness checks.
    });

    connection.on("error", (err) =>
      logger.error(
        {
          error: err instanceof Error ? err.message : "Unknown error",
          stack: err instanceof Error ? err.stack : undefined,
        },
        "Backend Service Redis Connection Error",
      ),
    );

    connection.on("connect", () =>
      logger.info({}, "Backend Service Redis Connected"),
    );

    connection.on("close", () =>
      logger.info({}, "Backend Service Redis Connection Closed"),
    );

    connection.on("reconnecting", () =>
      logger.info({}, "Backend Service Redis Reconnecting"),
    );

    logger.info({}, "Redis connection initialized for BullMQ queues");
  }
} else {
  logger.info(
    { queueBackend },
    "Queue backend is not 'redis' - skipping Redis connection initialization",
  );
}

// --- Queue Cache ---
// Store queue instances to avoid recreating them
const queues: Record<string, Queue> = {};

// --- Get Queue Function ---
/**
 * Gets a BullMQ Queue instance for the given name.
 * Initializes the queue if it doesn't exist in the cache.
 * @param name The name of the queue (use constants from QueueNames).
 * @returns The Queue instance, or null if initialization fails or not in redis mode.
 */
export function getQueue(
  name: (typeof QueueNames)[keyof typeof QueueNames],
): Queue | null {
  // Check if we're in redis mode
  if (queueBackend !== "redis") {
    logger.warn(
      { queueName: name, queueBackend },
      "getQueue called but QUEUE_BACKEND is not 'redis' - returning null",
    );
    return null;
  }

  // Check if connection is available
  if (!connection) {
    logger.error(
      { queueName: name },
      "Redis connection not available - cannot get queue",
    );
    return null;
  }

  // Validate queue name
  if (!Object.values(QueueNames).includes(name)) {
    logger.warn(
      {
        queueName: name,
        knownNames: Object.values(QueueNames),
      },
      "Attempted to get queue with unknown name",
    );
  }

  // Get or create queue
  if (!queues[name]) {
    try {
      logger.info({ queueName: name }, "Initializing queue");
      queues[name] = new Queue(name, {
        connection: connection,
      });
      logger.info({ queueName: name }, "Queue initialized successfully");

      // Add an error listener specific to this queue instance
      queues[name].on("error", (error) => {
        logger.error(
          {
            queueName: name,
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
          },
          "BullMQ Queue Error",
        );
      });
    } catch (error) {
      logger.error(
        {
          queueName: name,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Failed to initialize queue",
      );
      return null;
    }
  }
  return queues[name];
}

// --- Graceful Shutdown ---
export async function closeQueues() {
  if (queueBackend !== "redis" || !connection) {
    logger.info(
      { queueBackend },
      "No Redis queues to close (not in redis mode or no connection)",
    );
    return;
  }

  logger.info({}, "Closing backend service BullMQ queue connections");
  let hadError = false;

  // Close all queues
  for (const name in queues) {
    try {
      await queues[name]?.close();
      logger.info({ queueName: name }, "Queue closed");
    } catch (error) {
      logger.error(
        {
          queueName: name,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error closing queue",
      );
      hadError = true;
    }
  }

  // Close Redis connection
  try {
    if (
      connection.status === "ready" ||
      connection.status === "connecting" ||
      connection.status === "reconnecting"
    ) {
      await connection.quit();
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
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error quitting Redis connection",
    );
    hadError = true;
  }

  if (!hadError) {
    logger.info(
      {},
      "Backend service BullMQ queue connections closed successfully",
    );
  } else {
    logger.warn(
      {},
      "Backend service BullMQ queue connections closed with errors",
    );
  }
}
