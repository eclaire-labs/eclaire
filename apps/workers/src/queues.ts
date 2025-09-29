import { Queue, type WorkerOptions } from "bullmq";
import { Redis } from "ioredis";
import { config } from "./config";
import { createChildLogger } from "./lib/logger";

const logger = createChildLogger("queues");

// Job timeout constants (in milliseconds)
const JOB_TIMEOUT_LONG = 15 * 60 * 1000; // 15 minutes
const JOB_TIMEOUT_MEDIUM = 10 * 60 * 1000; // 10 minutes
const JOB_TIMEOUT_SHORT = 5 * 60 * 1000; // 5 minutes

// Create a reusable Redis connection instance
export const redisConnection = new Redis(config.redis.url, {
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

// Define standard worker options
export const defaultWorkerOptions: WorkerOptions = {
  connection: redisConnection,
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

// --- Queue Definitions ---

// Bookmark Processing Queue
export const bookmarkProcessingQueue = new Queue(
  config.queues.bookmarkProcessing,
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  },
);

export const imageProcessingQueue = new Queue(
  config.queues.imageProcessing, // Make sure this key exists in your worker config
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 2, // AI processing might be prone to transient issues
      backoff: { type: "exponential", delay: 10000 }, // Longer delay
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  },
);

// Document Processing Queue (NEW) - for PDF generation
export const documentProcessingQueue = new Queue(
  config.queues.documentProcessing,
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 2, // PDF generation might fail due to unsupported formats or LibreOffice issues
      backoff: { type: "exponential", delay: 10000 }, // Longer delay for resource-intensive operations
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  },
);

// Note Processing Queue (NEW)
export const noteProcessingQueue = new Queue(config.queues.noteProcessing, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2, // AI processing might have transient issues
    backoff: { type: "exponential", delay: 10000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

// Task Processing Queue (NEW)
export const taskProcessingQueue = new Queue(config.queues.taskProcessing, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2, // AI processing might have transient issues
    backoff: { type: "exponential", delay: 10000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

// Task Execution Processing Queue (renamed from AI Assistant)
export const taskExecutionProcessingQueue = new Queue(
  config.queues.taskExecutionProcessing,
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 2, // Task processing might have transient issues
      backoff: { type: "exponential", delay: 10000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  },
);

// Function to get all defined queues (useful for Bull Board)
export const getAllQueues = (): Queue[] => {
  return [
    bookmarkProcessingQueue,
    imageProcessingQueue,
    noteProcessingQueue,
    taskProcessingQueue,
    taskExecutionProcessingQueue,
    documentProcessingQueue,
  ];
};

// Graceful shutdown handler
export const closeQueues = async () => {
  logger.info("Closing BullMQ queues");
  await Promise.all(getAllQueues().map((q) => q.close()));
  logger.info("BullMQ queues closed");
};
