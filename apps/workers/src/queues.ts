import { Queue, type WorkerOptions } from "bullmq";
import { Redis } from "ioredis";
import { config } from "./config";
import { createChildLogger } from "./lib/logger";

const logger = createChildLogger("queues");

// --- Configuration ---
const queueBackend = process.env.QUEUE_BACKEND || "redis";

// Job timeout constants (in milliseconds)
const JOB_TIMEOUT_LONG = 15 * 60 * 1000; // 15 minutes
const JOB_TIMEOUT_MEDIUM = 10 * 60 * 1000; // 10 minutes
const JOB_TIMEOUT_SHORT = 5 * 60 * 1000; // 5 minutes

// --- Conditional Redis Connection ---
export let redisConnection: Redis | null = null;

if (queueBackend === "redis") {
  // Create a reusable Redis connection instance
  redisConnection = new Redis(config.redis.url, {
    maxRetriesPerRequest: null, // Recommended for BullMQ
    enableReadyCheck: false, // Allows commands during initial connection
  });

  redisConnection.on("error", (err) => {
    logger.error(
      { error: err.message, stack: err.stack },
      "Redis Connection Error",
    );
  });

  redisConnection.on("connect", () => {
    logger.info("Redis connected successfully");
  });

  logger.info({}, "Redis connection initialized for workers");
} else {
  logger.info(
    { queueBackend },
    "Queue backend is not 'redis' - skipping Redis connection initialization",
  );
}

// Define standard worker options (only used in redis mode)
export const defaultWorkerOptions: WorkerOptions = {
  connection: redisConnection!,
  concurrency: config.worker.concurrency,
  // Configure stalled job detection to handle timeouts
  stalledInterval: 30000, // Check for stalled jobs every 30 seconds
  maxStalledCount: 1, // Mark jobs as failed after being stalled once
};

// Worker options for long-running tasks (15 minutes timeout)
export const longTaskWorkerOptions: WorkerOptions = {
  ...defaultWorkerOptions,
  lockDuration: JOB_TIMEOUT_LONG, // Max time a job can run before lock expires
  stalledInterval: 60000, // Check every 60 seconds for long tasks
  maxStalledCount: 1, // Fail immediately if the lock expires
};

// Worker options for medium-running tasks (10 minutes timeout)
export const mediumTaskWorkerOptions: WorkerOptions = {
  ...defaultWorkerOptions,
  lockDuration: JOB_TIMEOUT_MEDIUM, // Max time a job can run before lock expires
  stalledInterval: 60000, // Check every 60 seconds
  maxStalledCount: 1, // Fail immediately if the lock expires
};

// Worker options for short-running tasks (5 minutes timeout)
export const shortTaskWorkerOptions: WorkerOptions = {
  ...defaultWorkerOptions,
  lockDuration: JOB_TIMEOUT_SHORT, // Max time a job can run before lock expires
  stalledInterval: 30000, // Check every 30 seconds
  maxStalledCount: 1, // Fail immediately if the lock expires
};

// --- Queue Definitions (only created in redis mode) ---

let bookmarkProcessingQueue: Queue | null = null;
let imageProcessingQueue: Queue | null = null;
let documentProcessingQueue: Queue | null = null;
let noteProcessingQueue: Queue | null = null;
let taskProcessingQueue: Queue | null = null;
let taskExecutionProcessingQueue: Queue | null = null;

if (queueBackend === "redis" && redisConnection) {
  // Bookmark Processing Queue
  bookmarkProcessingQueue = new Queue(config.queues.bookmarkProcessing, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });

  imageProcessingQueue = new Queue(config.queues.imageProcessing, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 10000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });

  documentProcessingQueue = new Queue(config.queues.documentProcessing, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 10000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });

  noteProcessingQueue = new Queue(config.queues.noteProcessing, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 10000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });

  taskProcessingQueue = new Queue(config.queues.taskProcessing, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 10000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });

  taskExecutionProcessingQueue = new Queue(
    config.queues.taskExecutionProcessing,
    {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 10000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    },
  );

  logger.info({}, "All BullMQ queues initialized");
}

// Export queues (will be null in database mode)
export {
  bookmarkProcessingQueue,
  imageProcessingQueue,
  documentProcessingQueue,
  noteProcessingQueue,
  taskProcessingQueue,
  taskExecutionProcessingQueue,
};

// Function to get all defined queues (useful for Bull Board)
export const getAllQueues = (): Queue[] => {
  const queues: Queue[] = [];

  if (bookmarkProcessingQueue) queues.push(bookmarkProcessingQueue);
  if (imageProcessingQueue) queues.push(imageProcessingQueue);
  if (noteProcessingQueue) queues.push(noteProcessingQueue);
  if (taskProcessingQueue) queues.push(taskProcessingQueue);
  if (taskExecutionProcessingQueue) queues.push(taskExecutionProcessingQueue);
  if (documentProcessingQueue) queues.push(documentProcessingQueue);

  return queues;
};

// Graceful shutdown handler
export const closeQueues = async () => {
  if (queueBackend !== "redis") {
    logger.info({ queueBackend }, "No Redis queues to close (not in redis mode)");
    return;
  }

  logger.info("Closing BullMQ queues");
  await Promise.all(getAllQueues().map((q) => q.close()));
  logger.info("BullMQ queues closed");
};
