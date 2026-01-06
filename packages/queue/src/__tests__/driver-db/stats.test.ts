/**
 * A13: Stats / Inspection
 *
 * Tests that queue statistics accurately reflect job states.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PermanentError } from "../../core/errors.js";
import type { QueueClient, Worker } from "../../core/types.js";
import { createDbQueueClient, createDbWorker } from "../../driver-db/index.js";
import {
  createDeferred,
  createQueueTestDatabase,
  createTestLogger,
  DB_TEST_CONFIGS,
  eventually,
  type QueueTestDatabase,
  TEST_TIMEOUTS,
} from "../testkit/index.js";

describe.each(DB_TEST_CONFIGS)("A13: Stats ($label)", ({ dbType }) => {
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

  it("should return zero counts for empty queue", async () => {
    const stats = await client.stats("test-queue");

    expect(stats.pending).toBe(0);
    expect(stats.processing).toBe(0);
    expect(stats.completed).toBe(0);
    expect(stats.failed).toBe(0);
    expect(stats.retryPending).toBe(0);
  });

  it("should count pending jobs", async () => {
    await client.enqueue("test-queue", { value: 1 });
    await client.enqueue("test-queue", { value: 2 });
    await client.enqueue("test-queue", { value: 3 });

    const stats = await client.stats("test-queue");
    expect(stats.pending).toBe(3);
  });

  it("should count completed jobs", async () => {
    // Enqueue jobs BEFORE starting worker
    const jobId1 = await client.enqueue("test-queue", { value: 1 });
    const jobId2 = await client.enqueue("test-queue", { value: 2 });

    worker = createDbWorker(
      "test-queue",
      async () => {
        // Complete successfully
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

    await eventually(async () => {
      const j1 = await client.getJob(jobId1);
      const j2 = await client.getJob(jobId2);
      return j1?.status === "completed" && j2?.status === "completed";
    });

    const stats = await client.stats("test-queue");
    expect(stats.completed).toBe(2);
    expect(stats.pending).toBe(0);
  });

  it("should count failed jobs", async () => {
    // Enqueue job BEFORE starting worker
    const jobId = await client.enqueue("test-queue", { value: 1 });

    worker = createDbWorker(
      "test-queue",
      async () => {
        throw new PermanentError("Permanent failure");
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

    await eventually(async () => {
      const job = await client.getJob(jobId);
      return job?.status === "failed";
    });

    const stats = await client.stats("test-queue");
    expect(stats.failed).toBe(1);
    expect(stats.pending).toBe(0);
  });

  it("should filter stats by queue name", async () => {
    await client.enqueue("queue-a", { value: 1 });
    await client.enqueue("queue-a", { value: 2 });
    await client.enqueue("queue-b", { value: 3 });

    const statsA = await client.stats("queue-a");
    const statsB = await client.stats("queue-b");

    expect(statsA.pending).toBe(2);
    expect(statsB.pending).toBe(1);
  });

  it("should return aggregate stats when no name filter", async () => {
    await client.enqueue("queue-a", { value: 1 });
    await client.enqueue("queue-b", { value: 2 });
    await client.enqueue("queue-c", { value: 3 });

    const stats = await client.stats();

    expect(stats.pending).toBe(3);
  });

  it("should track processing jobs", async () => {
    const processingStarted = createDeferred<void>();
    const continueProcessing = createDeferred<void>();

    // Enqueue job BEFORE starting worker
    const jobId = await client.enqueue("test-queue", { value: 1 });

    worker = createDbWorker(
      "test-queue",
      async () => {
        processingStarted.resolve();
        await continueProcessing.promise;
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

    // Wait for worker to start processing
    await processingStarted.promise;

    // Job should be in processing state
    const stats = await client.stats("test-queue");
    expect(stats.processing).toBe(1);
    expect(stats.pending).toBe(0);

    // Let job complete
    continueProcessing.resolve();

    await eventually(async () => {
      const job = await client.getJob(jobId);
      return job?.status === "completed";
    });

    const finalStats = await client.stats("test-queue");
    expect(finalStats.processing).toBe(0);
    expect(finalStats.completed).toBe(1);
  });

  it("should reflect mixed job states", async () => {
    const continueJob2 = createDeferred<void>();
    const job2Started = createDeferred<void>();
    let jobCounter = 0;

    // Enqueue 4 jobs BEFORE starting worker
    const jobId1 = await client.enqueue("test-queue", { value: 1 });
    const jobId2 = await client.enqueue("test-queue", { value: 2 });
    await client.enqueue("test-queue", { value: 3 });
    await client.enqueue("test-queue", { value: 4 });

    worker = createDbWorker(
      "test-queue",
      async (ctx) => {
        jobCounter++;
        if (jobCounter === 1) {
          // First job: complete immediately
          return;
        }
        if (jobCounter === 2) {
          // Second job: block until we signal
          job2Started.resolve();
          await continueJob2.promise;
        }
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

    // Wait for first job to complete and second to start
    await eventually(async () => {
      const j1 = await client.getJob(jobId1);
      return j1?.status === "completed";
    });
    await job2Started.promise;

    // At this point: 1 completed, 1 processing, 2 pending
    const stats = await client.stats("test-queue");
    expect(stats.completed).toBe(1);
    expect(stats.processing).toBe(1);
    expect(stats.pending).toBe(2);

    // Let remaining jobs complete
    continueJob2.resolve();

    await eventually(async () => {
      const s = await client.stats("test-queue");
      return s.completed === 4;
    });

    const finalStats = await client.stats("test-queue");
    expect(finalStats.completed).toBe(4);
    expect(finalStats.pending).toBe(0);
    expect(finalStats.processing).toBe(0);
  });
});
