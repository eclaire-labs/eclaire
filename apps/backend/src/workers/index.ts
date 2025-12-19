/**
 * Worker initialization module
 * Exports functions to start BullMQ workers (Redis mode) or database workers
 */

import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import { Hono } from "hono";
import { createBullMQWorker, type BullMQWorkerConfig } from "@eclaire/queue/driver-bullmq";
import { QueueNames } from "@eclaire/queue/app";
import type { Worker } from "@eclaire/queue/core";
import { config } from "./config.js";
import processBookmarkJob from "./jobs/bookmarkProcessor.js";
import { processDocumentJob } from "./jobs/documentProcessor.js";
import processImageJob from "./jobs/imageProcessor.js";
import processNoteJob from "./jobs/noteProcessor.js";
import processTaskExecution from "./jobs/taskExecutionProcessor.js";
import processTaskJob from "./jobs/taskProcessor.js";
import { validateAIConfigOnStartup } from "../lib/ai-client.js";
import { startDirectDbWorkers, stopDirectDbWorkers } from "./lib/direct-db-workers.js";
import { createRedisPublisher } from "./lib/redis-publisher.js";
import { createChildLogger } from "../lib/logger.js";
import {
  closeQueues,
  getAllQueues,
} from "./queues.js";

const logger = createChildLogger("workers");

// Track active BullMQ workers for graceful shutdown
const bullmqWorkers: Worker[] = [];

// Hono app for Bull Board
let app: Hono | null = null;

/**
 * Start BullMQ workers (Redis mode)
 * Used when SERVICE_ROLE=worker
 */
export async function startBullMQWorkers(): Promise<void> {
  logger.info("Starting BullMQ workers (Redis mode)");

  // Ensure browser data directory exists
  const browserDataDir = process.env.BROWSER_DATA_DIR || "./browser-data";
  try {
    fs.mkdirSync(browserDataDir, { recursive: true });
    logger.info({ browserDataDir }, "Browser data directory ensured");
  } catch (error) {
    logger.error(
      {
        browserDataDir,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to create browser data directory",
    );
    throw error;
  }

  // Validate AI configuration
  validateAIConfigOnStartup();

  // Initialize Hono app for Bull Board
  app = new Hono();

  const serverAdapter = new HonoAdapter(serveStatic);
  createBullBoard({
    queues: getAllQueues().map((q) => new BullMQAdapter(q)),
    serverAdapter: serverAdapter,
  });
  serverAdapter.setBasePath(config.server.basePath);

  // Register Bull Board routes
  app.route(config.server.basePath, serverAdapter.registerPlugin());

  // Health endpoint
  app.get("/health", (c) => {
    return c.json({
      status: "ok",
      service: "eclaire-workers",
      mode: "bullmq",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Initialize all BullMQ workers
  logger.info({ concurrency: config.worker.concurrency }, "Initializing BullMQ workers");

  // Create event callbacks for SSE publishing via Redis pub/sub
  const eventCallbacks = createRedisPublisher(config.redis.url, logger);

  // Shared worker configuration
  const workerConfig: BullMQWorkerConfig = {
    redis: { url: config.redis.url },
    logger,
    prefix: "queue",
    eventCallbacks,
  };

  // Long task options (5 min lock, 1 min heartbeat)
  const longTaskOptions = {
    concurrency: config.worker.concurrency,
    lockDuration: 300000,
    stalledInterval: 30000,
  };

  // Medium task options (2 min lock)
  const mediumTaskOptions = {
    concurrency: config.worker.concurrency,
    lockDuration: 120000,
    stalledInterval: 30000,
  };

  // Short task options (30s lock)
  const shortTaskOptions = {
    concurrency: config.worker.concurrency,
    lockDuration: 30000,
    stalledInterval: 10000,
  };

  // Bookmark Worker (with rate limiter)
  const bookmarkWorker = createBullMQWorker(
    QueueNames.BOOKMARK_PROCESSING,
    processBookmarkJob,
    {
      ...workerConfig,
      bullmqOptions: { limiter: { max: 1, duration: 1000 } },
    },
    longTaskOptions,
  );
  bullmqWorkers.push(bookmarkWorker);

  // Image Worker
  const imageWorker = createBullMQWorker(
    QueueNames.IMAGE_PROCESSING,
    processImageJob,
    workerConfig,
    { ...longTaskOptions, concurrency: 1 },
  );
  bullmqWorkers.push(imageWorker);

  // Document Worker
  const documentWorker = createBullMQWorker(
    QueueNames.DOCUMENT_PROCESSING,
    processDocumentJob,
    workerConfig,
    longTaskOptions,
  );
  bullmqWorkers.push(documentWorker);

  // Note Worker
  const noteWorker = createBullMQWorker(
    QueueNames.NOTE_PROCESSING,
    processNoteJob,
    workerConfig,
    shortTaskOptions,
  );
  bullmqWorkers.push(noteWorker);

  // Task Worker
  const taskWorker = createBullMQWorker(
    QueueNames.TASK_PROCESSING,
    processTaskJob,
    workerConfig,
    shortTaskOptions,
  );
  bullmqWorkers.push(taskWorker);

  // Task Execution Worker
  const taskExecutionWorker = createBullMQWorker(
    QueueNames.TASK_EXECUTION_PROCESSING,
    processTaskExecution,
    workerConfig,
    mediumTaskOptions,
  );
  bullmqWorkers.push(taskExecutionWorker);

  // Start all workers
  for (const worker of bullmqWorkers) {
    await worker.start();
  }

  logger.info({ workerCount: bullmqWorkers.length }, "All BullMQ workers initialized");

  // Start Bull Board server
  const port = config.server.port || 3002;
  serve(
    {
      fetch: app.fetch,
      port,
      hostname: "0.0.0.0",
    },
    () => {
      logger.info(
        {
          port,
          bullBoardUrl: `http://localhost:${port}${config.server.basePath}`,
        },
        "Workers service running (Redis/BullMQ mode)",
      );
    },
  );
}

/**
 * Start database queue workers (Database mode)
 * Used when SERVICE_ROLE=unified
 */
export async function startDatabaseWorkers(): Promise<void> {
  logger.info("Starting database queue workers (Database mode)");

  // Ensure browser data directory exists
  const browserDataDir = process.env.BROWSER_DATA_DIR || "./browser-data";
  try {
    fs.mkdirSync(browserDataDir, { recursive: true });
    logger.info({ browserDataDir }, "Browser data directory ensured");
  } catch (error) {
    logger.error(
      {
        browserDataDir,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to create browser data directory",
    );
    throw error;
  }

  // Validate AI configuration
  validateAIConfigOnStartup();

  // Start direct database workers with event callbacks
  await startDirectDbWorkers();
}

/**
 * Shutdown all workers gracefully
 */
export async function shutdownWorkers(): Promise<void> {
  logger.info("Shutting down workers...");

  // Shutdown BullMQ workers
  await Promise.all(bullmqWorkers.map((worker) => worker.stop()));
  bullmqWorkers.length = 0;

  await closeQueues();

  // Shutdown direct DB workers
  await stopDirectDbWorkers();

  logger.info("All workers shut down");
}
