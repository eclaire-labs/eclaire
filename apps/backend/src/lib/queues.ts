// backend/src/lib/queues.ts
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { createChildLogger } from "./logger";

const logger = createChildLogger("queues");

// --- Configuration ---
const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  // More prominent error/warning during startup if URL is missing
  logger.error(
    {},
    "FATAL: REDIS_URL environment variable is not set in the backend service. Queue functionality will likely fail",
  );
  // Depending on your setup, you might want to throw an error here if Redis is essential
  // throw new Error("REDIS_URL environment variable is not set.");
}

export const QueueNames = {
  BOOKMARK_PROCESSING: "bookmark-processing",
  IMAGE_PROCESSING: "image-processing",
  DOCUMENT_PROCESSING: "document-processing",
  NOTE_PROCESSING: "note-processing",
  TASK_PROCESSING: "task-processing",
  TASK_EXECUTION_PROCESSING: "task-execution-processing",
} as const;

// --- Shared Connection ---
// Use recommended BullMQ options
const connection = new Redis(redisUrl || "redis://127.0.0.1:6379", {
  // Provide a default for safety
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

// --- Queue Cache ---
// Store queue instances to avoid recreating them
const queues: Record<string, Queue> = {};

// --- Get Queue Function ---
/**
 * Gets a BullMQ Queue instance for the given name.
 * Initializes the queue if it doesn't exist in the cache.
 * @param name The name of the queue (use constants from QueueNames).
 * @returns The Queue instance, or null if initialization fails.
 */
// Use a mapped type for better type safety on the 'name' parameter
export function getQueue(
  name: (typeof QueueNames)[keyof typeof QueueNames],
): Queue | null {
  // Optional: Validate if the name is one of the known queue names
  // This check is somewhat redundant now due to the stricter type on 'name', but can be kept for JS consumers
  if (!Object.values(QueueNames).includes(name)) {
    logger.warn(
      {
        queueName: name,
        knownNames: Object.values(QueueNames),
      },
      "Attempted to get queue with unknown name",
    );
    // Decide whether to proceed or return null/throw error for unknown names
  }

  if (!queues[name]) {
    try {
      // BullMQ's Queue constructor handles connection state internally, especially with enableReadyCheck: false.
      // The previous connection status check might have been too restrictive.
      logger.info({ queueName: name }, "Initializing queue");
      queues[name] = new Queue(name, {
        connection: connection,
        // Optional: Define default job options specific to jobs added from Next.js
        // defaultJobOptions: {
        //     removeOnComplete: true, // e.g., maybe jobs added here are less critical to track after completion
        //     attempts: 1
        // }
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
        // Consider removing the queue from cache on persistent errors?
        // delete queues[name];
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
      return null; // Return null on initialization failure
    }
  }
  return queues[name];
}

// --- Graceful Shutdown ---
export async function closeQueues() {
  logger.info({}, "Closing backend service BullMQ queue connections");
  let hadError = false;
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
  try {
    // Only quit the connection if it's not already closed or ended
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

// Optional: Add more connection listeners if needed for monitoring
// connection.on('ready', () => logger.info({}, 'Backend Service Redis Connection Ready'));
