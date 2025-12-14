/**
 * A11: Cancel (waiting/scheduled)
 *
 * Tests that pending/scheduled jobs can be cancelled before processing.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DB_TEST_CONFIGS,
  TEST_TIMEOUTS,
  createQueueTestDatabase,
  eventually,
  createTestLogger,
  type QueueTestDatabase,
} from "../testkit/index.js";
import {
  createDbQueueClient,
  createDbWorker,
} from "../../driver-db/index.js";
import type { QueueClient, Worker, Job } from "../../core/types.js";

describe.each(DB_TEST_CONFIGS)("A11: Cancel ($label)", ({ dbType }) => {
  let testDb: QueueTestDatabase;
  let client: QueueClient;
  let worker: Worker | null = null;
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
    if (worker) {
      await worker.stop();
      worker = null;
    }
    await client.close();
    await testDb.cleanup();
  });

  it("should cancel a pending job by ID", async () => {
    const jobId = await client.enqueue("test-queue", { value: 1 });

    const cancelled = await client.cancel(jobId);
    expect(cancelled).toBe(true);

    // Job should no longer be pending
    const stats = await client.stats("test-queue");
    expect(stats.pending).toBe(0);
  });

  it("should cancel a pending job by key", async () => {
    const key = "cancel-by-key";
    await client.enqueue("test-queue", { value: 1 }, { key });

    const cancelled = await client.cancel(key);
    expect(cancelled).toBe(true);

    const stats = await client.stats("test-queue");
    expect(stats.pending).toBe(0);
  });

  it("should return false when cancelling non-existent job", async () => {
    const cancelled = await client.cancel("non-existent-id");
    expect(cancelled).toBe(false);
  });

  it("should not process a cancelled job", async () => {
    const processed: Job[] = [];

    // Enqueue and immediately cancel BEFORE starting worker
    const jobId = await client.enqueue("test-queue", { value: 1 });
    await client.cancel(jobId);

    // Also enqueue a job that won't be cancelled
    const jobId2 = await client.enqueue("test-queue", { value: 2 });

    worker = createDbWorker(
      "test-queue",
      async (ctx) => {
        processed.push(ctx.job);
      },
      {
        db: testDb.db,
        schema: testDb.schema,
        capabilities: testDb.capabilities,
        logger,
        pollInterval: TEST_TIMEOUTS.pollInterval,
      },
    );

    await worker.start();

    // Wait for the second job to complete
    await eventually(async () => {
      const job = await client.getJob(jobId2);
      return job?.status === "completed";
    });

    // Only the second job should have been processed
    expect(processed).toHaveLength(1);
    expect(processed[0].id).toBe(jobId2);
  });

  it("should cancel a scheduled job before it becomes available", async () => {
    // Schedule job 1 second in the future
    const futureDate = new Date(Date.now() + 1000);
    const jobId = await client.enqueue(
      "test-queue",
      { value: 1 },
      { runAt: futureDate },
    );

    // Cancel before it becomes available
    const cancelled = await client.cancel(jobId);
    expect(cancelled).toBe(true);

    // Verify job is not pending
    const stats = await client.stats("test-queue");
    expect(stats.pending).toBe(0);
  });

  it("should cancel multiple jobs", async () => {
    const jobId1 = await client.enqueue("test-queue", { value: 1 });
    const jobId2 = await client.enqueue("test-queue", { value: 2 });
    const jobId3 = await client.enqueue("test-queue", { value: 3 });

    await client.cancel(jobId1);
    await client.cancel(jobId3);

    const stats = await client.stats("test-queue");
    expect(stats.pending).toBe(1);

    // Only job2 should remain
    const job2 = await client.getJob(jobId2);
    expect(job2?.status).toBe("pending");
  });

  it("should update stats correctly after cancellation", async () => {
    await client.enqueue("test-queue", { value: 1 });
    await client.enqueue("test-queue", { value: 2 });
    const jobId3 = await client.enqueue("test-queue", { value: 3 });

    let stats = await client.stats("test-queue");
    expect(stats.pending).toBe(3);

    await client.cancel(jobId3);

    stats = await client.stats("test-queue");
    expect(stats.pending).toBe(2);
  });
});
