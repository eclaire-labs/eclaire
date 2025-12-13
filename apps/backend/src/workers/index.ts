/**
 * Worker initialization module
 * Exports functions to start BullMQ workers (Redis mode) or database workers
 */

import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { type Job, Worker } from "bullmq";
import fs from "fs";
import { Hono } from "hono";
import { config } from "./config.js";
import processBookmarkJob from "./jobs/bookmarkProcessor.js";
import { processDocumentJob } from "./jobs/documentProcessor.js";
import processImageJob from "./jobs/imageProcessor.js";
import processNoteJob from "./jobs/noteProcessor.js";
import processTaskExecution from "./jobs/taskExecutionProcessor.js";
import processTaskJob from "./jobs/taskProcessor.js";
import { validateAIConfigOnStartup } from "../lib/ai-client.js";
import { startDatabaseQueueWorkers } from "./lib/database-queue-workers.js";
import { createChildLogger } from "../lib/logger.js";
import {
  closeQueues,
  getAllQueues,
  longTaskWorkerOptions,
  mediumTaskWorkerOptions,
  shortTaskWorkerOptions,
} from "./queues.js";

const logger = createChildLogger("workers");

// Worker instances
let bookmarkWorker: Worker | null = null;
let imageWorker: Worker | null = null;
let documentWorker: Worker | null = null;
let noteWorker: Worker | null = null;
let taskWorker: Worker | null = null;
let taskExecutionWorker: Worker | null = null;

// Worker loggers
let bookmarkLogger: ReturnType<typeof createChildLogger> | null = null;
let imageLogger: ReturnType<typeof createChildLogger> | null = null;
let documentLogger: ReturnType<typeof createChildLogger> | null = null;
let noteLogger: ReturnType<typeof createChildLogger> | null = null;
let taskLogger: ReturnType<typeof createChildLogger> | null = null;
let taskExecutionLogger: ReturnType<typeof createChildLogger> | null = null;

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

  // Bookmark Worker
  bookmarkWorker = new Worker(
    config.queues.bookmarkProcessing,
    (job, token): Promise<any> => processBookmarkJob(job, token, bookmarkWorker!),
    {
      ...longTaskWorkerOptions,
      limiter: { max: 1, duration: 1000 },
    },
  );

  // Image Worker
  imageWorker = new Worker(config.queues.imageProcessing, processImageJob, {
    ...longTaskWorkerOptions,
    concurrency: 1,
  });

  // Document Worker
  documentWorker = new Worker(config.queues.documentProcessing, processDocumentJob, {
    ...longTaskWorkerOptions,
  });

  // Note Worker
  noteWorker = new Worker(config.queues.noteProcessing, processNoteJob, {
    ...shortTaskWorkerOptions,
  });

  // Task Worker
  taskWorker = new Worker(config.queues.taskProcessing, processTaskJob, {
    ...shortTaskWorkerOptions,
  });

  // Task Execution Worker
  taskExecutionWorker = new Worker(
    config.queues.taskExecutionProcessing,
    processTaskExecution,
    {
      ...mediumTaskWorkerOptions,
    },
  );

  // Setup worker event listeners
  setupWorkerListeners();

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
      logger.info("All BullMQ workers started and listening for jobs");
      bookmarkLogger?.info("Bookmark worker ready");
      imageLogger?.info("Image worker ready");
      noteLogger?.info("Note worker ready");
      taskLogger?.info("Task worker ready");
      taskExecutionLogger?.info("Task execution worker ready");
      documentLogger?.info("Document worker ready");
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

  // Start database polling workers
  await startDatabaseQueueWorkers();
}

/**
 * Setup event listeners for all BullMQ workers
 */
function setupWorkerListeners(): void {
  // Bookmark worker listeners
  bookmarkLogger = createChildLogger("bookmark-worker");
  bookmarkWorker?.on("completed", (job: Job, result: any) => {
    bookmarkLogger!.info(
      { jobId: job.id, bookmarkId: job.data.bookmarkId },
      "Job completed",
    );
  });
  bookmarkWorker?.on("failed", (job: Job | undefined, err: Error) => {
    bookmarkLogger!.error(
      {
        jobId: job?.id,
        bookmarkId: job?.data?.bookmarkId,
        error: err.message,
        stack: err.stack,
      },
      "Job failed",
    );
  });
  bookmarkWorker?.on("error", (err: Error) => {
    bookmarkLogger!.error({ error: err.message, stack: err.stack }, "Worker error");
  });

  // Image worker listeners
  imageLogger = createChildLogger("image-worker");
  imageWorker?.on("completed", (job, result) => {
    imageLogger!.info({ jobId: job.id, photoId: job.data.photoId }, "Job completed");
  });
  imageWorker?.on("failed", (job, err) => {
    imageLogger!.error(
      {
        jobId: job?.id,
        photoId: job?.data?.photoId,
        error: err.message,
        stack: err.stack,
      },
      "Job failed",
    );
  });
  imageWorker?.on("error", (err) => {
    imageLogger!.error({ error: err.message, stack: err.stack }, "Worker error");
  });

  // Document worker listeners
  documentLogger = createChildLogger("document-worker");
  documentWorker?.on("completed", (job, result) => {
    documentLogger!.info(
      { jobId: job.id, documentId: job.data.documentId },
      "Job completed",
    );
  });
  documentWorker?.on("failed", (job, err) => {
    documentLogger!.error(
      {
        jobId: job?.id,
        documentId: job?.data?.documentId,
        error: err.message,
        stack: err.stack,
      },
      "Job failed",
    );
  });
  documentWorker?.on("error", (err) => {
    documentLogger!.error({ error: err.message, stack: err.stack }, "Worker error");
  });

  // Note worker listeners
  noteLogger = createChildLogger("note-worker");
  noteWorker?.on("completed", (job, result) => {
    noteLogger!.info({ jobId: job.id, noteId: job.data.noteId }, "Job completed");
  });
  noteWorker?.on("failed", (job, err) => {
    noteLogger!.error(
      {
        jobId: job?.id,
        noteId: job?.data?.noteId,
        error: err.message,
        stack: err.stack,
      },
      "Job failed",
    );
  });
  noteWorker?.on("error", (err) => {
    noteLogger!.error({ error: err.message, stack: err.stack }, "Worker error");
  });

  // Task worker listeners
  taskLogger = createChildLogger("task-worker");
  taskWorker?.on("completed", (job, result) => {
    taskLogger!.info({ jobId: job.id, taskId: job.data.taskId }, "Job completed");
  });
  taskWorker?.on("failed", (job, err) => {
    taskLogger!.error(
      {
        jobId: job?.id,
        taskId: job?.data?.taskId,
        error: err.message,
        stack: err.stack,
      },
      "Job failed",
    );
  });
  taskWorker?.on("error", (err) => {
    taskLogger!.error({ error: err.message, stack: err.stack }, "Worker error");
  });

  // Task execution worker listeners
  taskExecutionLogger = createChildLogger("task-execution-worker");
  taskExecutionWorker?.on("completed", (job, result) => {
    taskExecutionLogger!.info(
      { jobId: job.id, taskId: job.data.taskId },
      "Job completed",
    );
  });
  taskExecutionWorker?.on("failed", (job, err) => {
    taskExecutionLogger!.error(
      {
        jobId: job?.id,
        taskId: job?.data?.taskId,
        error: err.message,
        stack: err.stack,
      },
      "Job failed",
    );
  });
  taskExecutionWorker?.on("error", (err) => {
    taskExecutionLogger!.error(
      { error: err.message, stack: err.stack },
      "Worker error",
    );
  });
}

/**
 * Shutdown all workers gracefully
 */
export async function shutdownWorkers(): Promise<void> {
  logger.info("Shutting down workers...");

  const workers = [
    bookmarkWorker,
    imageWorker,
    documentWorker,
    noteWorker,
    taskWorker,
    taskExecutionWorker,
  ];

  await Promise.all(
    workers.filter((w) => w !== null).map((worker) => worker!.close()),
  );

  await closeQueues();

  logger.info("All workers shut down");
}
