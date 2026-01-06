/**
 * H1-H2: Multi-process worker tests for PostgreSQL
 *
 * These tests spawn actual separate worker processes to validate
 * distributed worker scenarios with PostgreSQL backend.
 *
 * Requirements:
 * - Real PostgreSQL database (not PGlite - it's in-process)
 * - Set POSTGRES_URL environment variable to run these tests
 *
 * Run with: POSTGRES_URL=postgresql://... pnpm vitest run H1-H2
 */

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { createDbQueueClient, getQueueSchema } from "../../driver-db/index.js";
import {
  collectResults,
  killAllWorkers,
  spawnWorker,
  type WorkerProcess,
  waitForAllReady,
  waitForJobsProcessed,
} from "../testkit/index.js";

const POSTGRES_URL = process.env.POSTGRES_URL;

// Skip all tests if POSTGRES_URL is not set
const describeIfPostgres = POSTGRES_URL ? describe : describe.skip;

describeIfPostgres("H1-H2: Multi-process workers (Postgres)", () => {
  const queueName = `test-multiprocess-${Date.now()}`;
  let sqlClient: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let schema: ReturnType<typeof getQueueSchema>;
  let client: ReturnType<typeof createDbQueueClient>;
  let workers: WorkerProcess[] = [];

  beforeAll(async () => {
    sqlClient = postgres(POSTGRES_URL!);
    db = drizzle(sqlClient);
    schema = getQueueSchema("postgres");

    // Create queue tables if they don't exist
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS queue_jobs (
        id TEXT PRIMARY KEY,
        queue TEXT NOT NULL,
        key TEXT,
        data JSONB NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending',
        priority INTEGER NOT NULL DEFAULT 0,
        scheduled_for TIMESTAMP WITH TIME ZONE,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        locked_by TEXT,
        locked_at TIMESTAMP WITH TIME ZONE,
        expires_at TIMESTAMP WITH TIME ZONE,
        lock_token TEXT,
        next_retry_at TIMESTAMP WITH TIME ZONE,
        backoff_ms INTEGER,
        backoff_type TEXT,
        error_message TEXT,
        error_details JSONB,
        stages JSONB,
        current_stage TEXT,
        overall_progress REAL,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    // Create indexes
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_queue_jobs_queue_status
      ON queue_jobs (queue, status)
    `);

    client = createDbQueueClient({
      db,
      schema,
      capabilities: {
        skipLocked: true,
        notify: true,
        jsonb: true,
        type: "postgres",
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await db.execute(
      sql`DELETE FROM queue_jobs WHERE queue LIKE 'test-multiprocess-%'`,
    );
    await sqlClient.end();
  });

  beforeEach(async () => {
    // Clean up any jobs from previous tests
    await db.execute(sql`DELETE FROM queue_jobs WHERE queue = ${queueName}`);
    workers = [];
  });

  afterEach(async () => {
    // Kill any remaining workers
    await killAllWorkers(workers);
  });

  describe("H1: Job distribution across processes", () => {
    it("H1.1: jobs are distributed across 2 worker processes", async () => {
      const jobCount = 10;

      // Enqueue jobs
      for (let i = 0; i < jobCount; i++) {
        await client.enqueue(queueName, { value: i });
      }

      // Spawn 2 worker processes
      const worker1 = spawnWorker({
        workerId: "worker-1",
        queueName,
        backend: "postgres",
        databaseUrl: POSTGRES_URL!,
        maxJobs: 5,
      });
      const worker2 = spawnWorker({
        workerId: "worker-2",
        queueName,
        backend: "postgres",
        databaseUrl: POSTGRES_URL!,
        maxJobs: 5,
      });
      workers = [worker1, worker2];

      // Wait for workers to be ready
      await waitForAllReady(workers);

      // Wait for all jobs to be processed
      await waitForJobsProcessed(workers, jobCount, 30000);

      // Collect results
      const results = collectResults(workers);

      // Verify each job was processed exactly once
      expect(results.size).toBe(jobCount);
      for (const [jobId, workerIds] of results) {
        expect(workerIds.length).toBe(1);
      }

      // Verify both workers got some jobs (distribution happened)
      expect(worker1.processed.length).toBeGreaterThan(0);
      expect(worker2.processed.length).toBeGreaterThan(0);

      // Total should equal job count
      expect(worker1.processed.length + worker2.processed.length).toBe(
        jobCount,
      );
    }, 60000);
  });

  describe("H2: NOTIFY/LISTEN cross-process wakeup", () => {
    it("H2.1: NOTIFY wakes remote worker faster than polling", async () => {
      // Spawn worker with NOTIFY enabled
      const worker = spawnWorker({
        workerId: "notify-worker",
        queueName,
        backend: "postgres",
        databaseUrl: POSTGRES_URL!,
        notifyEnabled: true,
        maxJobs: 1,
      });
      workers = [worker];

      // Wait for worker to be ready
      await waitForAllReady(workers);

      // Small delay to ensure worker is polling
      await new Promise((r) => setTimeout(r, 200));

      // Record start time
      const startTime = Date.now();

      // Enqueue a job (this should trigger NOTIFY)
      await client.enqueue(queueName, { value: 42 });

      // Also send NOTIFY manually to ensure it's triggered
      await db.execute(sql`NOTIFY ${sql.raw(`"queue_${queueName}"`)}` as any);

      // Wait for job to be processed
      await waitForJobsProcessed(workers, 1, 10000);

      const processingTime = Date.now() - startTime;

      // With NOTIFY, the worker should wake up quickly (< 500ms)
      // Without NOTIFY, it would wait for the poll interval (5 seconds in production)
      // We use a generous 2000ms threshold to account for process startup overhead
      expect(processingTime).toBeLessThan(2000);

      // Verify job was processed
      expect(worker.processed.length).toBe(1);
      expect(worker.processed[0].data).toEqual({ value: 42 });
    }, 30000);
  });
});
