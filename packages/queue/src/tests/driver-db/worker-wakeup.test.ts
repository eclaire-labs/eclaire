/**
 * B8: Worker Wakeup With Notifier
 *
 * Tests that workers wake up quickly when notifications are available,
 * without relying on short poll intervals. This validates the integration
 * between the notification system and the worker loop.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { QueueClient, Worker } from "../../core/types.js";
import {
  createDbQueueClient,
  createDbWorker,
  createInMemoryNotify,
} from "../../driver-db/index.js";
import {
  createQueueTestDatabase,
  createTestLogger,
  DB_TEST_CONFIGS,
  eventually,
  type QueueTestDatabase,
  TEST_TIMEOUTS,
} from "../testkit/index.js";

describe.each(DB_TEST_CONFIGS)("B8: Worker Wakeup With Notifier ($label)", ({
  dbType,
}) => {
  let testDb: QueueTestDatabase;
  let client: QueueClient;
  let worker: Worker | null = null;
  const logger = createTestLogger();

  beforeEach(async () => {
    testDb = await createQueueTestDatabase(dbType);
  });

  afterEach(async () => {
    if (worker?.isRunning()) {
      await worker.stop();
    }
    if (client) {
      await client.close();
    }
    await testDb.cleanup();
  });

  it("B8.1: worker wakes quickly on in-process notify", async () => {
    // 1. Create in-memory notify pair
    const { emitter, listener } = createInMemoryNotify({ logger });

    // 2. Create client with notifyEmitter
    client = createDbQueueClient({
      db: testDb.db,
      schema: testDb.schema,
      capabilities: testDb.capabilities,
      logger,
      notifyEmitter: emitter,
    });

    // Track when job was processed
    let processedAt: number | null = null;
    const jobProcessed = new Promise<void>((resolve) => {
      // 3. Create worker with notifyListener and LARGE pollInterval
      worker = createDbWorker(
        "test-queue",
        async () => {
          processedAt = Date.now();
          resolve();
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: 10000, // 10 seconds - intentionally large
          lockDuration: TEST_TIMEOUTS.lockDuration,
          heartbeatInterval: TEST_TIMEOUTS.heartbeatInterval,
          notifyListener: listener,
        },
      );
    });

    // 4. Start worker
    await worker!.start();

    // Small delay to ensure worker is in its wait state
    await new Promise((r) => setTimeout(r, 50));

    // 5. Enqueue a job and record time
    const enqueuedAt = Date.now();
    await client.enqueue("test-queue", { value: "test" });

    // 6. Wait for job to be processed
    await jobProcessed;

    // 7. Assert job completed quickly (within 500ms, not 10 seconds)
    const processingDelay = processedAt! - enqueuedAt;
    expect(processingDelay).toBeLessThan(500);

    // Cleanup
    await listener.close();
    await emitter.close();
  });

  it("B8.2: worker processes multiple jobs with notifications", async () => {
    const { emitter, listener } = createInMemoryNotify({ logger });

    client = createDbQueueClient({
      db: testDb.db,
      schema: testDb.schema,
      capabilities: testDb.capabilities,
      logger,
      notifyEmitter: emitter,
    });

    const processedJobs: string[] = [];

    worker = createDbWorker(
      "test-queue",
      async (ctx) => {
        processedJobs.push(ctx.job.id);
      },
      {
        db: testDb.db,
        schema: testDb.schema,
        capabilities: testDb.capabilities,
        logger,
        pollInterval: 10000, // Large poll interval
        lockDuration: TEST_TIMEOUTS.lockDuration,
        heartbeatInterval: TEST_TIMEOUTS.heartbeatInterval,
        notifyListener: listener,
      },
    );

    // Enqueue 3 jobs first
    const job1 = await client.enqueue("test-queue", { index: 1 });
    const job2 = await client.enqueue("test-queue", { index: 2 });
    const job3 = await client.enqueue("test-queue", { index: 3 });

    await worker.start();

    // Wait for all jobs to be processed
    await eventually(async () => {
      const j1 = await client.getJob(job1);
      const j2 = await client.getJob(job2);
      const j3 = await client.getJob(job3);
      return (
        j1?.status === "completed" &&
        j2?.status === "completed" &&
        j3?.status === "completed"
      );
    });

    // All jobs should have been processed
    expect(processedJobs).toContain(job1);
    expect(processedJobs).toContain(job2);
    expect(processedJobs).toContain(job3);

    await listener.close();
    await emitter.close();
  });

  it("B8.3: worker falls back to polling without notify listener", async () => {
    // Create client WITHOUT notify
    client = createDbQueueClient({
      db: testDb.db,
      schema: testDb.schema,
      capabilities: testDb.capabilities,
      logger,
      // No notifyEmitter
    });

    let processed = false;

    worker = createDbWorker(
      "test-queue",
      async () => {
        processed = true;
      },
      {
        db: testDb.db,
        schema: testDb.schema,
        capabilities: testDb.capabilities,
        logger,
        pollInterval: 100, // Short poll interval for this test
        lockDuration: TEST_TIMEOUTS.lockDuration,
        heartbeatInterval: TEST_TIMEOUTS.heartbeatInterval,
        // No notifyListener
      },
    );

    // Enqueue job first
    const jobId = await client.enqueue("test-queue", { value: "test" });

    await worker.start();

    // Should be processed via polling
    await eventually(async () => {
      const job = await client.getJob(jobId);
      return job?.status === "completed";
    });

    expect(processed).toBe(true);
  });
});
