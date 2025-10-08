// CRITICAL: Load environment variables FIRST, before any other imports
import "./lib/env-loader";
import { validateRequiredEnvVars } from "./lib/env-validation";

// Validate required environment variables before starting
validateRequiredEnvVars();

import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { type Job, Worker } from "bullmq";
import fs from "fs";
import { Hono } from "hono";
import path from "path";
import { config } from "./config";
import processBookmarkJob from "./jobs/bookmarkProcessor";
import { processDocumentJob } from "./jobs/documentProcessor";
import processImageJob from "./jobs/imageProcessor"; // Import the new job processor
import processNoteJob from "./jobs/noteProcessor"; // Import the note processor
import processTaskExecution from "./jobs/taskExecutionProcessor"; // Import the task execution processor
import processTaskJob from "./jobs/taskProcessor"; // Import the task processor
import { validateAIConfigOnStartup } from "./lib/ai-client";
import { domainRateLimiter } from "./lib/domainRateLimiter";
import { createChildLogger } from "./lib/logger";
// Import the new queue and processor
import {
  closeQueues,
  getAllQueues,
  longTaskWorkerOptions,
  mediumTaskWorkerOptions,
  redisConnection,
  shortTaskWorkerOptions,
} from "./queues";

// --- Initialize Logger ---
const logger = createChildLogger("main");

// --- Ensure Browser Data Directory Exists ---
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
  process.exit(1);
}

// --- Initialize Hono App ---
const app = new Hono();

// --- Initialize Bull Board ---
const serverAdapter = new HonoAdapter(serveStatic);
createBullBoard({
  queues: getAllQueues().map((q) => new BullMQAdapter(q)), // Automatically includes the new queue
  serverAdapter: serverAdapter,
});
serverAdapter.setBasePath(config.server.basePath);

// Register the Bull Board routes
app.route(config.server.basePath, serverAdapter.registerPlugin());

// --- Initialize BullMQ Workers ---
logger.info({ concurrency: config.worker.concurrency }, "Initializing workers");

// Bookmark Worker - 15 minute timeout with rate limiting
const bookmarkWorker: Worker = new Worker(
  config.queues.bookmarkProcessing,
  (job, token): Promise<any> => processBookmarkJob(job, token, bookmarkWorker),
  {
    ...longTaskWorkerOptions,
    limiter: {
      max: 1,
      duration: 1000,
    },
  },
);

// Image Conversion Worker (NEW) - 15 minute timeout
const imageWorker = new Worker(config.queues.imageProcessing, processImageJob, {
  ...longTaskWorkerOptions,
  concurrency: 1,
});

// Document Worker (NEW) - 15 minute timeout
const documentWorker = new Worker(
  config.queues.documentProcessing,
  processDocumentJob,
  {
    ...longTaskWorkerOptions,
  },
);

// Note Processing Worker (NEW) - 5 minute timeout
const noteWorker = new Worker(config.queues.noteProcessing, processNoteJob, {
  ...shortTaskWorkerOptions,
});

// Task Processing Worker (NEW) - 5 minute timeout
const taskWorker = new Worker(config.queues.taskProcessing, processTaskJob, {
  ...shortTaskWorkerOptions,
});

// Task Execution Processing Worker (renamed from AI Assistant) - 10 minute timeout
const taskExecutionWorker = new Worker(
  config.queues.taskExecutionProcessing,
  processTaskExecution,
  {
    ...mediumTaskWorkerOptions,
  },
);

// --- Worker Event Listeners ---
const bookmarkLogger = createChildLogger("bookmark-worker");

bookmarkWorker.on("completed", (job: Job, result: any) => {
  bookmarkLogger.info(
    {
      jobId: job.id,
      bookmarkId: job.data.bookmarkId,
    },
    "Job completed",
  );
});
bookmarkWorker.on("failed", (job: Job | undefined, err: Error) => {
  bookmarkLogger.error(
    {
      jobId: job?.id,
      bookmarkId: job?.data?.bookmarkId,
      error: err.message,
      stack: err.stack,
    },
    "Job failed",
  );
});
bookmarkWorker.on("error", (err: Error) => {
  bookmarkLogger.error(
    {
      error: err.message,
      stack: err.stack,
    },
    "Worker error",
  );
});

// Image Worker Listeners (NEW)
const imageLogger = createChildLogger("image-worker");

imageWorker.on("completed", (job, result) => {
  imageLogger.info(
    {
      jobId: job.id,
      photoId: job.data.photoId,
    },
    "Job completed",
  );
});
imageWorker.on("failed", (job, err) => {
  imageLogger.error(
    {
      jobId: job?.id,
      photoId: job?.data?.photoId,
      error: err.message,
      stack: err.stack,
    },
    "Job failed",
  );
});
imageWorker.on("error", (err) => {
  imageLogger.error(
    {
      error: err.message,
      stack: err.stack,
    },
    "Worker error",
  );
});

// Document Worker Listeners (NEW)
const documentLogger = createChildLogger("document-worker");

documentWorker.on("completed", (job, result) => {
  documentLogger.info(
    {
      jobId: job.id,
      documentId: job.data.documentId,
    },
    "Document job completed",
  );
});
documentWorker.on("failed", (job, err) => {
  documentLogger.error(
    {
      jobId: job?.id,
      documentId: job?.data?.documentId,
      error: err.message,
      stack: err.stack,
    },
    "Document thumbnail job failed",
  );
});
documentWorker.on("error", (err) => {
  documentLogger.error(
    {
      error: err.message,
      stack: err.stack,
    },
    "Worker error",
  );
});

// Note Processing Worker Listeners (NEW)
const noteLogger = createChildLogger("note-worker");

noteWorker.on("completed", (job, result) => {
  noteLogger.info(
    {
      jobId: job.id,
      noteId: job.data.noteId,
    },
    "Note processing job completed",
  );
});
noteWorker.on("failed", (job, err) => {
  noteLogger.error(
    {
      jobId: job?.id,
      noteId: job?.data?.noteId,
      error: err.message,
      stack: err.stack,
    },
    "Note processing job failed",
  );
});
noteWorker.on("error", (err) => {
  noteLogger.error(
    {
      error: err.message,
      stack: err.stack,
    },
    "Worker error",
  );
});

// Task Processing Worker Listeners (NEW)
const taskLogger = createChildLogger("task-worker");

taskWorker.on("completed", (job, result) => {
  taskLogger.info(
    {
      jobId: job.id,
      taskId: job.data.taskId,
    },
    "Task processing job completed",
  );
});
taskWorker.on("failed", (job, err) => {
  taskLogger.error(
    {
      jobId: job?.id,
      taskId: job?.data?.taskId,
      error: err.message,
      stack: err.stack,
    },
    "Task processing job failed",
  );
});
taskWorker.on("error", (err) => {
  taskLogger.error(
    {
      error: err.message,
      stack: err.stack,
    },
    "Worker error",
  );
});

// Task Execution Processing Worker Listeners (renamed from AI Assistant)
const taskExecutionLogger = createChildLogger("task-execution-worker");

taskExecutionWorker.on("completed", (job, result) => {
  taskExecutionLogger.info(
    {
      jobId: job.id,
      taskId: job.data.taskId,
    },
    "Task execution processing job completed",
  );
});
taskExecutionWorker.on("failed", (job, err) => {
  taskExecutionLogger.error(
    {
      jobId: job?.id,
      taskId: job?.data?.taskId,
      error: err.message,
      stack: err.stack,
    },
    "Task execution processing job failed",
  );
});
taskExecutionWorker.on("error", (err) => {
  taskExecutionLogger.error(
    {
      error: err.message,
      stack: err.stack,
    },
    "Worker error",
  );
});

// --- Health Check Endpoint ---
app.get("/health", (c) => {
  const buildInfo = {
    version: process.env.APP_VERSION || "N/A",
    fullVersion: process.env.APP_FULL_VERSION || "N/A",
    gitHash: process.env.APP_GIT_HASH || "N/A",
    buildTimestamp: process.env.APP_BUILD_TIMESTAMP || "N/A",
  };

  const isRedisConnected = redisConnection.status === "ready";
  // Check status of all workers
  const areWorkersRunning = {
    bookmark: bookmarkWorker.isRunning(),
    image: imageWorker.isRunning(),
    noteProcessing: noteWorker.isRunning(),
    taskProcessing: taskWorker.isRunning(),
    taskExecutionProcessing: taskExecutionWorker.isRunning(),
    documentProcessing: documentWorker.isRunning(),
  };
  const allRunning = Object.values(areWorkersRunning).every((status) => status);

  if (isRedisConnected && allRunning) {
    return c.json({
      status: "ok",
      service: "eclaire-workers",
      version: buildInfo.version,
      fullVersion: buildInfo.fullVersion,
      gitHash: buildInfo.gitHash,
      buildTimestamp: buildInfo.buildTimestamp,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      redis: redisConnection.status,
      workers: areWorkersRunning,
    });
  } else {
    c.status(503); // Service Unavailable
    return c.json({
      status: "error",
      service: "eclaire-workers",
      version: buildInfo.version,
      fullVersion: buildInfo.fullVersion,
      gitHash: buildInfo.gitHash,
      buildTimestamp: buildInfo.buildTimestamp,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      redis: redisConnection.status,
      workers: areWorkersRunning,
    });
  }
});

// --- Domain Management Endpoints ---
app.get("/admin/domains", async (c) => {
  const stats = domainRateLimiter.getStats();
  const blockedDomains = domainRateLimiter.getBlockedDomains();

  return c.json({
    domains: stats,
    blockedCount: blockedDomains.length,
    blockedDomains,
  });
});

app.post("/admin/domains/:domain/unblock", async (c) => {
  const domain = c.req.param("domain");
  const unblocked = domainRateLimiter.unblockDomain(`https://${domain}`);

  if (unblocked) {
    return c.json({
      success: true,
      message: `Domain ${domain} has been unblocked`,
    });
  } else {
    return c.json(
      {
        success: false,
        message: `Domain ${domain} was not blocked or does not exist`,
      },
      404,
    );
  }
});

// --- Queue Configuration Endpoints ---
app.get("/admin/queues/config", async (c) => {
  try {
    const queueConfigs: Record<string, any> = {};
    const allQueues = getAllQueues();

    // Get configuration for each queue
    for (const queue of allQueues) {
      const queueName = queue.name;

      // Get current queue status
      const [waiting, active, completed, failed, delayed, isPaused] =
        await Promise.all([
          queue.getWaiting(0, 0),
          queue.getActive(0, 0),
          queue.getCompleted(0, 0),
          queue.getFailed(0, 0),
          queue.getDelayed(0, 0),
          queue.isPaused(),
        ]);

      // Get queue options from the queue instance
      const queueOptions = (queue as any).opts;

      queueConfigs[queueName] = {
        name: queueName,
        paused: isPaused,
        counts: {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          delayed: delayed.length,
        },
        defaultJobOptions: queueOptions?.defaultJobOptions || null,
        // Worker configuration from our known setup
        workerConfig: getWorkerConfigForQueue(queueName),
        // Domain configuration if applicable
        domainConfig:
          queueName === "bookmark-processing"
            ? {
                rateLimiting: config.domains,
                interDomainDelay: config.domains.interDomainDelayMs,
              }
            : null,
      };
    }

    return c.json({
      queues: queueConfigs,
      globalConfig: {
        worker: {
          defaultConcurrency: config.worker.concurrency,
          aiTimeout: config.worker.aiTimeout,
        },
        server: {
          port: config.server.port,
          basePath: config.server.basePath,
        },
      },
    });
  } catch (error) {
    console.error("Error getting queue configurations:", error);
    return c.json({ error: "Failed to get queue configurations" }, 500);
  }
});

app.get("/admin/queues/:queueName/config", async (c) => {
  const queueName = c.req.param("queueName");

  try {
    const allQueues = getAllQueues();
    const queue = allQueues.find((q) => q.name === queueName);

    if (!queue) {
      return c.json({ error: `Queue "${queueName}" not found` }, 404);
    }

    // Get current queue status
    const [waiting, active, completed, failed, delayed, isPaused] =
      await Promise.all([
        queue.getWaiting(0, 0),
        queue.getActive(0, 0),
        queue.getCompleted(0, 0),
        queue.getFailed(0, 0),
        queue.getDelayed(0, 0),
        queue.isPaused(),
      ]);

    // Get a recent job to extract actual job options
    const recentJob =
      (await queue.getWaiting(0, 1).then((jobs) => jobs[0])) ||
      (await queue.getCompleted(0, 1).then((jobs) => jobs[0])) ||
      (await queue.getFailed(0, 1).then((jobs) => jobs[0]));

    // Get queue options from the queue instance
    const queueOptions = (queue as any).opts;

    const queueConfig = {
      name: queueName,
      paused: isPaused,
      counts: {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
      },
      defaultJobOptions: queueOptions?.defaultJobOptions || null,
      recentJobOptions: recentJob?.opts || null,
      workerConfig: getWorkerConfigForQueue(queueName),
      domainConfig:
        queueName === "bookmark-processing"
          ? {
              rateLimiting: config.domains,
              interDomainDelay: config.domains.interDomainDelayMs,
            }
          : null,
    };

    return c.json(queueConfig);
  } catch (error) {
    console.error(`Error getting configuration for queue ${queueName}:`, error);
    return c.json(
      { error: `Failed to get configuration for queue "${queueName}"` },
      500,
    );
  }
});

// Helper function to get worker configuration for a specific queue
function getWorkerConfigForQueue(queueName: string) {
  const workerMap: Record<string, any> = {
    "bookmark-processing": {
      concurrency: config.worker.concurrency,
      apiKey: config.apiKey ? "[SET]" : "[NOT SET]",
      processor: "bookmarkProcessor.ts",
      purpose: "Process bookmark URLs and extract content",
      stalledTimeout: 15 * 60 * 1000, // 15 minutes (15 stalls × 60s each)
      stalledInterval: 60000, // Check every 60 seconds
      maxStalledCount: 15,
    },
    "image-processing": {
      concurrency: 1, // Override from worker setup
      apiKey: config.apiKey ? "[SET]" : "[NOT SET]",
      processor: "imageProcessor.ts",
      purpose: "Convert and process HEIC images",
      stalledTimeout: 15 * 60 * 1000, // 15 minutes (15 stalls × 60s each)
      stalledInterval: 60000, // Check every 60 seconds
      maxStalledCount: 15,
    },
    "document-processing": {
      concurrency: config.worker.concurrency,
      apiKey: config.apiKey ? "[SET]" : "[NOT SET]",
      processor: "documentProcessor.ts",
      purpose: "Generate PDF documents and thumbnails",
      stalledTimeout: 15 * 60 * 1000, // 15 minutes (15 stalls × 60s each)
      stalledInterval: 60000, // Check every 60 seconds
      maxStalledCount: 15,
    },
    "note-processing": {
      concurrency: config.worker.concurrency,
      apiKey: config.apiKey ? "[SET]" : "[NOT SET]",
      processor: "noteProcessor.ts",
      purpose: "AI processing of notes",
      stalledTimeout: 5 * 60 * 1000, // 5 minutes (10 stalls × 30s each)
      stalledInterval: 30000, // Check every 30 seconds
      maxStalledCount: 10,
    },
    "task-processing": {
      concurrency: config.worker.concurrency,
      apiKey: config.apiKey ? "[SET]" : "[NOT SET]",
      processor: "taskProcessor.ts",
      purpose: "AI processing of tasks",
      stalledTimeout: 5 * 60 * 1000, // 5 minutes (10 stalls × 30s each)
      stalledInterval: 30000, // Check every 30 seconds
      maxStalledCount: 10,
    },
    "task-execution-processing": {
      concurrency: config.worker.concurrency,
      apiKey: config.apiKey ? "[SET]" : "[NOT SET]",
      processor: "taskExecutionProcessor.ts",
      purpose: "Execute AI assistant tasks (recurring tasks)",
      stalledTimeout: 10 * 60 * 1000, // 10 minutes (10 stalls × 60s each)
      stalledInterval: 60000, // Check every 60 seconds
      maxStalledCount: 10,
    },
  };

  return (
    workerMap[queueName] || {
      concurrency: config.worker.concurrency,
      apiKey: "[UNKNOWN]",
      processor: "unknown",
      purpose: "Unknown queue type",
      stalledTimeout: 5 * 60 * 1000, // Default 5 minute timeout
      stalledInterval: 30000,
      maxStalledCount: 10,
    }
  );
}

// --- Start Server ---
const start = async () => {
  try {
    // Validate AI configuration first - fail fast if not properly configured
    validateAIConfigOnStartup();

    serve(
      {
        fetch: app.fetch,
        port: config.server.port,
        hostname: "0.0.0.0",
      },
      () => {
        logger.info(
          {
            port: config.server.port,
            bullBoardUrl: `http://localhost:${config.server.port}${config.server.basePath}`,
          },
          "Worker service running",
        );

        logger.info("All workers started and listening for jobs");
        bookmarkLogger.info("Bookmark worker ready");
        imageLogger.info("Image worker ready");
        noteLogger.info("Note Processing worker ready");
        taskLogger.info("Task Processing worker ready");
        taskExecutionLogger.info("Task Execution Processing worker ready");
        documentLogger.info("Document worker ready");
      },
    );
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : "Unknown error",
        stack: err instanceof Error ? err.stack : undefined,
      },
      "Failed to start worker service",
    );
    process.exit(1);
  }
};

// --- Graceful Shutdown ---
const shutdown = async (signal: string) => {
  logger.info({ signal }, "Shutdown signal received. Shutting down gracefully");

  logger.info("Closing BullMQ workers");
  await Promise.all([
    bookmarkWorker.close(),
    imageWorker.close(), // Close the image worker
    noteWorker.close(), // Close the note worker
    taskWorker.close(), // Close the task worker
    taskExecutionWorker.close(), // Close the task execution worker
    documentWorker.close(), // Close the document worker
  ]);
  logger.info("BullMQ workers closed");

  await closeQueues();

  if (
    redisConnection.status === "ready" ||
    redisConnection.status === "connecting"
  ) {
    await redisConnection.quit();
    logger.info("Redis connection closed");
  }

  logger.info("Shutdown complete");
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start();
