/**
 * A2: Idempotent Enqueue (jobKey)
 *
 * Tests that enqueueing with the same (name, key) doesn't create duplicate jobs.
 * This ensures deduplication works correctly.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Job, QueueClient, Worker } from "../../core/types.js";
import { createDbQueueClient, createDbWorker } from "../../driver-db/index.js";
import {
  createQueueTestDatabase,
  createTestLogger,
  DB_TEST_CONFIGS,
  eventually,
  type QueueTestDatabase,
  TEST_TIMEOUTS,
} from "../testkit/index.js";

describe.each(DB_TEST_CONFIGS)("A2: Idempotent Enqueue ($label)", ({
  dbType,
}) => {
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

  it("should maintain single job when enqueueing with the same key", async () => {
    const key = "unique-key-123";

    await client.enqueue("test-queue", { value: 1 }, { key });
    await client.enqueue("test-queue", { value: 2 }, { key });

    // Only one job should exist (no duplicates)
    const stats = await client.stats("test-queue");
    expect(stats.pending).toBe(1);

    // Job should be retrievable by key
    const job = await client.getJob(key);
    expect(job).toBeDefined();
    expect(job?.key).toBe(key);
  });

  it("should not duplicate jobs with the same key", async () => {
    const key = "unique-key-456";

    await client.enqueue("test-queue", { value: 1 }, { key });
    await client.enqueue("test-queue", { value: 2 }, { key });
    await client.enqueue("test-queue", { value: 3 }, { key });

    // Check stats - should only be 1 pending job
    const stats = await client.stats("test-queue");
    expect(stats.pending).toBe(1);
  });

  it("should allow different keys to create separate jobs", async () => {
    await client.enqueue("test-queue", { value: 1 }, { key: "key-a" });
    await client.enqueue("test-queue", { value: 2 }, { key: "key-b" });
    await client.enqueue("test-queue", { value: 3 }, { key: "key-c" });

    const stats = await client.stats("test-queue");
    expect(stats.pending).toBe(3);
  });

  it("should allow jobs without keys to be separate", async () => {
    // Jobs without keys are not deduplicated
    await client.enqueue("test-queue", { value: 1 });
    await client.enqueue("test-queue", { value: 2 });
    await client.enqueue("test-queue", { value: 3 });

    const stats = await client.stats("test-queue");
    expect(stats.pending).toBe(3);
  });

  it("should process deduplicated job only once", async () => {
    const processed: Job[] = [];
    const key = "dedup-key";

    // Enqueue same key multiple times BEFORE starting worker
    const jobId = await client.enqueue("test-queue", { value: 1 }, { key });
    await client.enqueue("test-queue", { value: 2 }, { key });
    await client.enqueue("test-queue", { value: 3 }, { key });

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

    // Wait for job to complete
    await eventually(async () => {
      const job = await client.getJob(jobId);
      return job?.status === "completed";
    });

    // Only one job should have been processed
    expect(processed).toHaveLength(1);
    expect(processed[0].key).toBe(key);
  });

  it("should allow same key in different queue names", async () => {
    const key = "shared-key";

    const jobId1 = await client.enqueue("queue-a", { value: 1 }, { key });
    const jobId2 = await client.enqueue("queue-b", { value: 2 }, { key });

    // Different queue names should create different jobs
    expect(jobId1).not.toBe(jobId2);

    const job1 = await client.getJob(jobId1);
    const job2 = await client.getJob(jobId2);
    expect(job1?.queue).toBe("queue-a");
    expect(job2?.queue).toBe("queue-b");
  });

  it("should be able to retrieve job by key", async () => {
    const key = "lookup-key";
    const jobId = await client.enqueue("test-queue", { value: 42 }, { key });

    // Should be able to get job by key
    const job = await client.getJob(key);
    expect(job).toBeDefined();
    expect(job?.id).toBe(jobId);
    expect(job?.key).toBe(key);
    expect(job?.data).toEqual({ value: 42 });
  });
});
