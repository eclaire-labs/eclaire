#!/usr/bin/env tsx
/**
 * Worker subprocess for multi-process tests (H-series)
 *
 * This script is spawned as a child process to test distributed worker scenarios.
 * It reads configuration from environment variables and outputs JSON lines to stdout.
 *
 * Environment variables:
 * - QUEUE_NAME: Name of the queue to process (required)
 * - BACKEND: "postgres" or "redis" (required)
 * - DATABASE_URL: PostgreSQL connection URL (required for postgres backend)
 * - REDIS_URL: Redis connection URL (required for redis backend)
 * - WORKER_ID: Unique identifier for this worker (required)
 * - MAX_JOBS: Exit after processing this many jobs (optional, default: unlimited)
 * - NOTIFY_ENABLED: "true" to enable Postgres NOTIFY (optional, default: false)
 *
 * Output (JSON lines to stdout):
 * - { type: "ready" } - Worker is ready to process jobs
 * - { type: "processed", jobId: "...", workerId: "...", data: {...} } - Job processed
 * - { type: "error", message: "..." } - Error occurred
 * - { type: "shutdown" } - Worker is shutting down
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  createDbQueueClient,
  createDbWorker,
  getQueueSchema,
} from "../../driver-db/index.js";
import {
  createBullMQClient,
  createBullMQWorker,
  createRedisConnection,
} from "../../driver-bullmq/index.js";
import type { JobContext } from "../../core/types.js";

// Helper to output JSON line
function output(data: Record<string, unknown>) {
  console.log(JSON.stringify(data));
}

// Parse environment
const config = {
  queueName: process.env.QUEUE_NAME,
  backend: process.env.BACKEND as "postgres" | "redis" | undefined,
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  workerId: process.env.WORKER_ID,
  maxJobs: process.env.MAX_JOBS ? parseInt(process.env.MAX_JOBS, 10) : undefined,
  notifyEnabled: process.env.NOTIFY_ENABLED === "true",
};

// Validate config
if (!config.queueName) {
  output({ type: "error", message: "QUEUE_NAME is required" });
  process.exit(1);
}
if (!config.backend || !["postgres", "redis"].includes(config.backend)) {
  output({ type: "error", message: "BACKEND must be 'postgres' or 'redis'" });
  process.exit(1);
}
if (!config.workerId) {
  output({ type: "error", message: "WORKER_ID is required" });
  process.exit(1);
}
if (config.backend === "postgres" && !config.databaseUrl) {
  output({ type: "error", message: "DATABASE_URL is required for postgres backend" });
  process.exit(1);
}
if (config.backend === "redis" && !config.redisUrl) {
  output({ type: "error", message: "REDIS_URL is required for redis backend" });
  process.exit(1);
}

let processedCount = 0;
let shouldStop = false;

// No-op logger for subprocess
const noopLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
  child: () => noopLogger,
};

async function runPostgresWorker() {
  const sql = postgres(config.databaseUrl!);
  const db = drizzle(sql);
  const schema = getQueueSchema("postgres");

  const client = createDbQueueClient({
    db,
    schema,
    capabilities: {
      skipLocked: true,
      notify: config.notifyEnabled,
      jsonb: true,
      type: "postgres",
    },
    logger: noopLogger,
  });

  const worker = createDbWorker<{ value: number }>(
    config.queueName!,
    async (ctx: JobContext<{ value: number }>) => {
      output({
        type: "processed",
        jobId: ctx.job.id,
        workerId: config.workerId,
        data: ctx.job.data,
      });
      processedCount++;

      if (config.maxJobs && processedCount >= config.maxJobs) {
        shouldStop = true;
      }
    },
    {
      db,
      schema,
      capabilities: {
        skipLocked: true,
        notify: config.notifyEnabled,
        jsonb: true,
        type: "postgres",
      },
      workerId: config.workerId!,
      lockDuration: 30000,
      heartbeatInterval: 5000,
      pollInterval: 100,
      logger: noopLogger,
    },
    { concurrency: 1 },
  );

  // Handle shutdown
  const cleanup = async () => {
    output({ type: "shutdown" });
    await worker.stop();
    await sql.end();
    process.exit(0);
  };

  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);

  // Start worker
  await worker.start();
  output({ type: "ready" });

  // Wait for max jobs or shutdown signal
  while (!shouldStop) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  await cleanup();
}

async function runRedisWorker() {
  const connection = createRedisConnection({
    url: config.redisUrl!,
    logger: noopLogger,
  });

  const worker = createBullMQWorker<{ value: number }>(
    config.queueName!,
    async (ctx: JobContext<{ value: number }>) => {
      output({
        type: "processed",
        jobId: ctx.job.id,
        workerId: config.workerId,
        data: ctx.job.data,
      });
      processedCount++;

      if (config.maxJobs && processedCount >= config.maxJobs) {
        shouldStop = true;
      }
    },
    { redis: { connection }, logger: noopLogger },
    { concurrency: 1 },
  );

  // Handle shutdown
  const cleanup = async () => {
    output({ type: "shutdown" });
    await worker.stop();
    await connection.quit();
    process.exit(0);
  };

  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);

  // Start worker
  await worker.start();
  output({ type: "ready" });

  // Wait for max jobs or shutdown signal
  while (!shouldStop) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  await cleanup();
}

// Main
async function main() {
  try {
    if (config.backend === "postgres") {
      await runPostgresWorker();
    } else {
      await runRedisWorker();
    }
  } catch (error) {
    output({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

main();
