/**
 * B3: Crash/Reclaim at Scale
 *
 * Tests that all jobs complete even when workers crash mid-processing.
 * The queue system should automatically recover expired jobs and reassign them.
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { QueueClient, Worker } from "../../core/types.js";
import { createDbQueueClient, createDbWorker } from "../../driver-db/index.js";
import {
  createQueueTestDatabase,
  createTestLogger,
  DB_TEST_CONFIGS,
  eventually,
  type QueueTestDatabase,
  sleep,
  TEST_TIMEOUTS,
} from "../testkit/index.js";

/**
 * Helper to simulate a crashed worker by setting jobs to processing
 * with expired leases
 */
async function simulateCrashedJobs(
  testDb: QueueTestDatabase,
  jobIds: string[],
): Promise<void> {
  const { queueJobs } = testDb.schema;
  for (const jobId of jobIds) {
    await testDb.db
      .update(queueJobs)
      .set({
        status: "processing",
        lockedBy: `dead-worker-${Math.random().toString(36).slice(2, 8)}`,
        lockedAt: new Date(Date.now() - 60000),
        expiresAt: new Date(Date.now() - 10000), // Expired 10 seconds ago
        attempts: 1,
      })
      .where(eq(queueJobs.id, jobId));
  }
}

describe.each(DB_TEST_CONFIGS)("B3: Crash Recovery ($label)", ({ dbType }) => {
  let testDb: QueueTestDatabase;
  let client: QueueClient;
  let workers: Worker[] = [];
  const logger = createTestLogger();

  beforeEach(async () => {
    testDb = await createQueueTestDatabase(dbType);

    client = createDbQueueClient({
      db: testDb.db,
      schema: testDb.schema,
      capabilities: testDb.capabilities,
      logger,
    });
  });

  afterEach(async () => {
    // Stop all workers
    await Promise.all(workers.map((w) => w.stop()));
    workers = [];
    await client.close();
    await testDb.cleanup();
  });

  it("should recover jobs from a crashed worker", async () => {
    const processedJobs = new Set<string>();

    // 1. Enqueue jobs
    const jobIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = await client.enqueue(
        "test-queue",
        { index: i },
        { attempts: 3 },
      );
      jobIds.push(id);
    }

    // 2. Simulate crashed worker: set jobs to processing with expired locks
    await simulateCrashedJobs(testDb, jobIds);

    // Verify jobs are in processing state
    for (const id of jobIds) {
      const job = await client.getJob(id);
      expect(job?.status).toBe("processing");
      expect(job?.attempts).toBe(1);
    }

    // 3. Start recovery worker
    const recoveryWorker = createDbWorker(
      "test-queue",
      async (ctx) => {
        processedJobs.add(ctx.job.id);
      },
      {
        db: testDb.db,
        schema: testDb.schema,
        capabilities: testDb.capabilities,
        logger,
        pollInterval: TEST_TIMEOUTS.pollInterval,
      },
    );
    workers.push(recoveryWorker);
    await recoveryWorker.start();

    // 4. Wait for all jobs to complete
    await eventually(
      async () => {
        for (const id of jobIds) {
          const job = await client.getJob(id);
          if (job?.status !== "completed") return false;
        }
        return true;
      },
      { timeout: 10000 },
    );

    // 5. Verify all jobs completed and attempts incremented
    expect(processedJobs.size).toBe(5);
    for (const id of jobIds) {
      const job = await client.getJob(id);
      expect(job?.status).toBe("completed");
      expect(job?.attempts).toBe(2); // Was 1 from crash, now 2 after recovery
    }
  });

  it("should not recover jobs that exhausted retries", async () => {
    // 1. Enqueue job with only 1 attempt allowed
    const jobId = await client.enqueue(
      "test-queue",
      { value: "single-attempt" },
      { attempts: 1 },
    );

    // 2. Simulate crashed worker: job has 1 attempt (exhausted)
    const { queueJobs } = testDb.schema;
    await testDb.db
      .update(queueJobs)
      .set({
        status: "processing",
        lockedBy: "dead-worker",
        lockedAt: new Date(Date.now() - 60000),
        expiresAt: new Date(Date.now() - 10000),
        attempts: 1,
        maxAttempts: 1, // Exhausted
      })
      .where(eq(queueJobs.id, jobId));

    // 3. Start recovery worker
    let recoveryAttempted = false;
    const recoveryWorker = createDbWorker(
      "test-queue",
      async () => {
        recoveryAttempted = true;
      },
      {
        db: testDb.db,
        schema: testDb.schema,
        capabilities: testDb.capabilities,
        logger,
        pollInterval: TEST_TIMEOUTS.pollInterval,
      },
    );
    workers.push(recoveryWorker);
    await recoveryWorker.start();

    // Wait a bit
    await sleep(300);

    // 4. Job should still be in processing (expired but not recoverable)
    // because attempts (1) >= maxAttempts (1)
    const job = await client.getJob(jobId);
    expect(job?.status).toBe("processing");
    expect(job?.attempts).toBe(1);
    expect(recoveryAttempted).toBe(false);
  });

  it("should increment attempts when recovering", async () => {
    // 1. Enqueue job with multiple attempts
    const jobId = await client.enqueue(
      "test-queue",
      { value: "multi-attempt" },
      { attempts: 5 },
    );

    // 2. Simulate first crash (attempts = 1)
    const { queueJobs } = testDb.schema;
    await testDb.db
      .update(queueJobs)
      .set({
        status: "processing",
        lockedBy: "dead-worker-1",
        lockedAt: new Date(Date.now() - 60000),
        expiresAt: new Date(Date.now() - 10000),
        attempts: 1,
      })
      .where(eq(queueJobs.id, jobId));

    // Verify state
    let job = await client.getJob(jobId);
    expect(job?.attempts).toBe(1);

    // 3. Start worker to recover
    let firstRecoveryAttempts = 0;

    const worker = createDbWorker(
      "test-queue",
      async (ctx) => {
        firstRecoveryAttempts = ctx.job.attempts;
      },
      {
        db: testDb.db,
        schema: testDb.schema,
        capabilities: testDb.capabilities,
        logger,
        pollInterval: TEST_TIMEOUTS.pollInterval,
      },
    );
    workers.push(worker);
    await worker.start();

    // Wait for job to complete
    await eventually(async () => {
      const j = await client.getJob(jobId);
      return j?.status === "completed";
    });

    // 4. Verify attempts were incremented
    job = await client.getJob(jobId);
    expect(job?.status).toBe("completed");
    expect(job?.attempts).toBe(2); // Incremented from 1 to 2
    expect(firstRecoveryAttempts).toBe(2);
  });

  it("should recover multiple crashed workers' jobs", async () => {
    const jobCount = 15;
    const processedJobs = new Set<string>();

    // 1. Enqueue many jobs
    const jobIds: string[] = [];
    for (let i = 0; i < jobCount; i++) {
      const id = await client.enqueue(
        "test-queue",
        { index: i },
        { attempts: 5 },
      );
      jobIds.push(id);
    }

    // 2. Simulate multiple crashed workers
    const { queueJobs } = testDb.schema;
    for (let i = 0; i < jobCount; i++) {
      await testDb.db
        .update(queueJobs)
        .set({
          status: "processing",
          lockedBy: `dead-worker-${i % 3}`, // 3 different "dead" workers
          lockedAt: new Date(Date.now() - 60000),
          expiresAt: new Date(Date.now() - 10000),
          attempts: 1,
        })
        .where(eq(queueJobs.id, jobIds[i]));
    }

    // 3. Start recovery workers
    for (let w = 0; w < 2; w++) {
      const recoveryWorker = createDbWorker(
        "test-queue",
        async (ctx) => {
          processedJobs.add(ctx.job.id);
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
        },
        { concurrency: 3 },
      );
      workers.push(recoveryWorker);
      await recoveryWorker.start();
    }

    // 4. Wait for all jobs to complete
    await eventually(
      async () => {
        for (const id of jobIds) {
          const job = await client.getJob(id);
          if (job?.status !== "completed") return false;
        }
        return true;
      },
      { timeout: 15000 },
    );

    // 5. Verify all jobs completed
    expect(processedJobs.size).toBe(jobCount);
    for (const id of jobIds) {
      const job = await client.getJob(id);
      expect(job?.status).toBe("completed");
    }
  });

  it("should prioritize expired jobs over new pending jobs", async () => {
    const processOrder: string[] = [];

    // 1. Create an "expired" processing job
    const expiredJobId = await client.enqueue(
      "test-queue",
      { type: "expired" },
      { attempts: 3 },
    );

    // Set it to processing with expired lease
    const { queueJobs } = testDb.schema;
    await testDb.db
      .update(queueJobs)
      .set({
        status: "processing",
        lockedBy: "dead-worker",
        lockedAt: new Date(Date.now() - 60000),
        expiresAt: new Date(Date.now() - 10000),
        attempts: 1,
      })
      .where(eq(queueJobs.id, expiredJobId));

    // 2. Enqueue high-priority new job
    const newJobId = await client.enqueue(
      "test-queue",
      { type: "new" },
      { priority: 100 }, // Very high priority
    );

    // 3. Start worker
    const worker = createDbWorker(
      "test-queue",
      async (ctx) => {
        processOrder.push((ctx.job.data as { type: string }).type);
      },
      {
        db: testDb.db,
        schema: testDb.schema,
        capabilities: testDb.capabilities,
        logger,
        pollInterval: TEST_TIMEOUTS.pollInterval,
      },
    );
    workers.push(worker);
    await worker.start();

    // 4. Wait for both jobs to complete
    await eventually(async () => {
      const expired = await client.getJob(expiredJobId);
      const newJob = await client.getJob(newJobId);
      return expired?.status === "completed" && newJob?.status === "completed";
    });

    // 5. Verify expired job was processed first
    expect(processOrder).toHaveLength(2);
    expect(processOrder[0]).toBe("expired");
    expect(processOrder[1]).toBe("new");
  });

  it("should handle mixed pending and expired jobs", async () => {
    const processedJobs: string[] = [];

    // 1. Enqueue some pending jobs
    const pendingIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = await client.enqueue("test-queue", {
        type: "pending",
        index: i,
      });
      pendingIds.push(id);
    }

    // 2. Enqueue and crash some jobs
    const crashedIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = await client.enqueue(
        "test-queue",
        { type: "crashed", index: i },
        { attempts: 3 },
      );
      crashedIds.push(id);
    }
    await simulateCrashedJobs(testDb, crashedIds);

    // 3. Start worker
    const worker = createDbWorker(
      "test-queue",
      async (ctx) => {
        processedJobs.push(ctx.job.id);
      },
      {
        db: testDb.db,
        schema: testDb.schema,
        capabilities: testDb.capabilities,
        logger,
        pollInterval: TEST_TIMEOUTS.pollInterval,
      },
    );
    workers.push(worker);
    await worker.start();

    // 4. Wait for all jobs to complete
    const allIds = [...pendingIds, ...crashedIds];
    await eventually(
      async () => {
        for (const id of allIds) {
          const job = await client.getJob(id);
          if (job?.status !== "completed") return false;
        }
        return true;
      },
      { timeout: 10000 },
    );

    // 5. All 6 jobs should be processed
    expect(processedJobs).toHaveLength(6);

    // Crashed jobs should be processed first (prioritized)
    const firstThree = processedJobs.slice(0, 3);
    for (const id of firstThree) {
      expect(crashedIds).toContain(id);
    }
  });
});
