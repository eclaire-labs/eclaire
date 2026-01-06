/**
 * Remote Database Workers
 *
 * Workers that connect to Postgres remotely (separate container).
 * Uses createDbWorker from @eclaire/queue/driver-db with Postgres NOTIFY
 * for real-time SSE updates via the database pub/sub channel.
 *
 * Use this when SERVICE_ROLE=worker and you want to use Postgres instead of Redis.
 */

import { QueueNames } from "@eclaire/queue/app";
import type { JobContext, Worker } from "@eclaire/queue/core";
import {
  createDbWorker,
  type DbWorkerConfig,
  getQueueSchema,
  type DbCapabilities as QueueDbCapabilities,
} from "@eclaire/queue/driver-db";
import { db, dbCapabilities, dbType } from "../../db/index.js";
import { createChildLogger } from "../../lib/logger.js";
// Import job processors
import processBookmarkJob from "../jobs/bookmarkProcessor.js";
import { processDocumentJob } from "../jobs/documentProcessor.js";
import processImageJob from "../jobs/imageProcessor.js";
import processNoteJob from "../jobs/noteProcessor.js";
import processTaskExecution from "../jobs/taskExecutionProcessor.js";
import processTaskJob from "../jobs/taskProcessor.js";
import { createPostgresPublisher } from "./postgres-publisher.js";

const logger = createChildLogger("remote-db-workers");

// Track active workers for graceful shutdown
const workers: Worker[] = [];

/**
 * Get queue schema for Postgres (remote DB workers only support Postgres)
 */
function getSchema() {
  if (dbType !== "postgres") {
    throw new Error(
      `Remote database workers only support PostgreSQL, but DATABASE_TYPE is '${dbType}'`,
    );
  }
  return getQueueSchema("postgres");
}

/**
 * Get database capabilities for the queue driver
 */
function getCapabilities(): QueueDbCapabilities {
  return {
    skipLocked: dbCapabilities.skipLocked,
    notify: dbCapabilities.notify,
    jsonb: true, // Postgres always has jsonb
    type: "postgres",
  };
}

/**
 * Base worker configuration
 */
function getWorkerConfig(): Omit<DbWorkerConfig, "eventCallbacks"> {
  return {
    db,
    schema: getSchema(),
    capabilities: getCapabilities(),
    logger,
    lockDuration: 300000, // 5 minutes
    heartbeatInterval: 60000, // 1 minute
    pollInterval: 5000, // 5 seconds
    gracefulShutdownTimeout: 30000, // 30 seconds
  };
}

/**
 * Start all remote database workers
 *
 * These workers connect to Postgres remotely and use Postgres NOTIFY
 * to publish real-time SSE updates. The backend listens with LISTEN
 * and forwards to connected SSE clients.
 */
export async function startRemoteDbWorkers(): Promise<void> {
  logger.info({}, "Starting remote database workers (Postgres mode)");

  // Create event callbacks that publish via Postgres NOTIFY
  const eventCallbacks = createPostgresPublisher(db as any, logger);

  const baseConfig = getWorkerConfig();
  const config: DbWorkerConfig = {
    ...baseConfig,
    eventCallbacks,
  };

  // Bookmark processing worker
  const bookmarkWorker = createDbWorker(
    QueueNames.BOOKMARK_PROCESSING,
    async (ctx: JobContext<any>) => {
      await processBookmarkJob(ctx);
    },
    config,
    { concurrency: 1 },
  );
  workers.push(bookmarkWorker);
  logger.info(
    { queue: QueueNames.BOOKMARK_PROCESSING },
    "Bookmark worker started",
  );

  // Image processing worker
  const imageWorker = createDbWorker(
    QueueNames.IMAGE_PROCESSING,
    async (ctx: JobContext<any>) => {
      await processImageJob(ctx);
    },
    config,
    { concurrency: 1 },
  );
  workers.push(imageWorker);
  logger.info({ queue: QueueNames.IMAGE_PROCESSING }, "Image worker started");

  // Document processing worker
  const documentWorker = createDbWorker(
    QueueNames.DOCUMENT_PROCESSING,
    async (ctx: JobContext<any>) => {
      await processDocumentJob(ctx);
    },
    config,
    { concurrency: 1 },
  );
  workers.push(documentWorker);
  logger.info(
    { queue: QueueNames.DOCUMENT_PROCESSING },
    "Document worker started",
  );

  // Note processing worker
  const noteWorker = createDbWorker(
    QueueNames.NOTE_PROCESSING,
    async (ctx: JobContext<any>) => {
      await processNoteJob(ctx);
    },
    config,
    { concurrency: 1 },
  );
  workers.push(noteWorker);
  logger.info({ queue: QueueNames.NOTE_PROCESSING }, "Note worker started");

  // Task processing worker (tag generation)
  const taskWorker = createDbWorker(
    QueueNames.TASK_PROCESSING,
    async (ctx: JobContext<any>) => {
      await processTaskJob(ctx);
    },
    config,
    { concurrency: 1 },
  );
  workers.push(taskWorker);
  logger.info({ queue: QueueNames.TASK_PROCESSING }, "Task worker started");

  // Task execution worker
  const taskExecutionWorker = createDbWorker(
    QueueNames.TASK_EXECUTION_PROCESSING,
    async (ctx: JobContext<any>) => {
      await processTaskExecution(ctx);
    },
    config,
    { concurrency: 1 },
  );
  workers.push(taskExecutionWorker);
  logger.info(
    { queue: QueueNames.TASK_EXECUTION_PROCESSING },
    "Task execution worker started",
  );

  // Start all workers
  for (const worker of workers) {
    await worker.start();
  }

  logger.info(
    { workerCount: workers.length },
    "All remote database workers started",
  );
}

/**
 * Stop all remote database workers gracefully
 */
export async function stopRemoteDbWorkers(): Promise<void> {
  logger.info({}, "Stopping remote database workers...");

  await Promise.all(workers.map((worker) => worker.stop()));

  workers.length = 0;
  logger.info({}, "All remote database workers stopped");
}
