/**
 * Direct Database Workers
 *
 * Workers that access the database directly (unified mode).
 * Uses createDbWorker from @eclaire/queue/driver-db with event callbacks
 * for real-time SSE updates.
 */

import {
  createDbWorker,
  getQueueSchema,
  type DbWorkerConfig,
  type DbCapabilities as QueueDbCapabilities,
} from "@eclaire/queue/driver-db";
import {
  createEventCallbacks,
  QueueNames,
} from "@eclaire/queue/app";
import type { JobContext, Worker, JobEventCallbacks } from "@eclaire/queue/core";
import { db, dbType, dbCapabilities } from "../../db/index.js";
import { publishDirectSSEEvent } from "../../routes/processing-events.js";
import { processArtifacts } from "../../lib/services/artifact-processor.js";
import type { AssetType } from "../../types/assets.js";
import { createChildLogger } from "../../lib/logger.js";
import { runWithRequestId } from "@eclaire/logger";

// Import job processors
import processBookmarkJob from "../jobs/bookmarkProcessor.js";
import { processDocumentJob } from "../jobs/documentProcessor.js";
import processImageJob from "../jobs/imageProcessor.js";
import processNoteJob from "../jobs/noteProcessor.js";
import processTaskJob from "../jobs/taskProcessor.js";
import processTaskExecution from "../jobs/taskExecutionProcessor.js";

const logger = createChildLogger("direct-db-workers");

// Track active workers for graceful shutdown
const workers: Worker[] = [];

/**
 * Get queue schema for the current database type
 */
function getSchema() {
  return getQueueSchema(dbType as "postgres" | "sqlite");
}

/**
 * Get database capabilities for the queue driver
 */
function getCapabilities(): QueueDbCapabilities {
  // Map from @eclaire/db capabilities to @eclaire/queue capabilities
  const queueDbType = dbType as "postgres" | "sqlite";
  return {
    skipLocked: dbCapabilities.skipLocked,
    notify: dbCapabilities.notify,
    // Map jsonIndexing to jsonb (postgres has both)
    jsonb: queueDbType === "postgres",
    type: queueDbType,
  };
}

/**
 * Create event callbacks for SSE publishing and artifact processing
 */
function createSSEEventCallbacks(): JobEventCallbacks {
  return createEventCallbacks({
    publisher: publishDirectSSEEvent,
    artifactProcessor: (assetType, assetId, artifacts) =>
      processArtifacts(assetType as AssetType, assetId, artifacts),
    logger,
  });
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
    // Wrap job execution in AsyncLocalStorage context for request tracing
    wrapJobExecution: async (requestId, execute) => {
      if (requestId) {
        return runWithRequestId(requestId, execute);
      }
      return execute();
    },
  };
}

/**
 * Start all direct database workers
 *
 * These workers access the database directly and use event callbacks
 * to publish real-time SSE updates to connected clients.
 */
export async function startDirectDbWorkers(): Promise<void> {
  logger.info({}, "Starting direct database workers (unified mode)");

  const eventCallbacks = createSSEEventCallbacks();
  const baseConfig = getWorkerConfig();
  const config: DbWorkerConfig = {
    ...baseConfig,
    eventCallbacks,
  };

  // Bookmark processing worker - now uses ctx directly
  const bookmarkWorker = createDbWorker(
    QueueNames.BOOKMARK_PROCESSING,
    async (ctx: JobContext<any>) => {
      await processBookmarkJob(ctx);
    },
    config,
    { concurrency: 1 },
  );
  workers.push(bookmarkWorker);
  logger.info({ queue: QueueNames.BOOKMARK_PROCESSING }, "Bookmark worker started");

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
  logger.info({ queue: QueueNames.DOCUMENT_PROCESSING }, "Document worker started");

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
  logger.info({ queue: QueueNames.TASK_EXECUTION_PROCESSING }, "Task execution worker started");

  // Start all workers
  for (const worker of workers) {
    await worker.start();
  }

  logger.info(
    { workerCount: workers.length },
    "All direct database workers started",
  );
}

/**
 * Stop all direct database workers gracefully
 */
export async function stopDirectDbWorkers(): Promise<void> {
  logger.info({}, "Stopping direct database workers...");

  await Promise.all(workers.map((worker) => worker.stop()));

  workers.length = 0;
  logger.info({}, "All direct database workers stopped");
}
