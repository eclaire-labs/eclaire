/**
 * B10: Worker Concurrency
 *
 * Tests that the worker correctly handles concurrent job processing
 * when concurrency > 1.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DB_TEST_CONFIGS,
  TEST_TIMEOUTS,
  createQueueTestDatabase,
  createTestLogger,
  eventually,
  sleep,
  createDeferred,
  type QueueTestDatabase,
  type Deferred,
} from "../testkit/index.js";
import {
  createDbQueueClient,
  createDbWorker,
} from "../../driver-db/index.js";
import type { QueueClient, Worker } from "../../core/types.js";

describe.each(DB_TEST_CONFIGS)(
  "B10: Worker Concurrency ($label)",
  ({ dbType }) => {
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
      if (worker?.isRunning()) {
        await worker.stop();
      }
      await client.close();
      await testDb.cleanup();
    });

    it("B10.1: multiple jobs processed simultaneously with concurrency > 1", async () => {
      const startTime = Date.now();
      const processedJobs: string[] = [];

      // Create worker with concurrency: 3
      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          // Each job takes 100ms
          await sleep(100);
          processedJobs.push(ctx.job.id);
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
          lockDuration: TEST_TIMEOUTS.lockDuration,
          heartbeatInterval: TEST_TIMEOUTS.heartbeatInterval,
        },
        { concurrency: 3 },
      );

      // Enqueue 3 jobs first
      const job1 = await client.enqueue("test-queue", { index: 1 });
      const job2 = await client.enqueue("test-queue", { index: 2 });
      const job3 = await client.enqueue("test-queue", { index: 3 });

      await worker.start();

      // Wait for all jobs to complete
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

      const totalTime = Date.now() - startTime;

      // If processed in parallel: ~100ms
      // If processed sequentially: ~300ms
      // Allow some overhead, but should be less than sequential time
      expect(totalTime).toBeLessThan(350);

      // All jobs should be processed
      expect(processedJobs).toContain(job1);
      expect(processedJobs).toContain(job2);
      expect(processedJobs).toContain(job3);
    });

    it("B10.2: concurrency limit is respected", async () => {
      let maxConcurrent = 0;
      let currentConcurrent = 0;
      const processedJobs: string[] = [];

      // Create worker with concurrency: 2
      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);

          // Hold the job for a bit
          await sleep(50);

          currentConcurrent--;
          processedJobs.push(ctx.job.id);
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
          lockDuration: TEST_TIMEOUTS.lockDuration,
          heartbeatInterval: TEST_TIMEOUTS.heartbeatInterval,
        },
        { concurrency: 2 },
      );

      // Enqueue 5 jobs first
      const jobIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const id = await client.enqueue("test-queue", { index: i });
        jobIds.push(id);
      }

      await worker.start();

      // Wait for all jobs to complete
      await eventually(async () => {
        const jobs = await Promise.all(jobIds.map((id) => client.getJob(id)));
        return jobs.every((j) => j?.status === "completed");
      });

      // Max concurrent should never exceed 2
      expect(maxConcurrent).toBeLessThanOrEqual(2);
      // But we should have had at least 2 concurrent at some point
      expect(maxConcurrent).toBe(2);
    });

    it("B10.3: all concurrent jobs complete before stop() returns", async () => {
      const jobsInProgress: string[] = [];
      const jobsCompleted: string[] = [];
      const jobDeferreds = new Map<string, Deferred<void>>();

      // Create worker with concurrency: 3
      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          jobsInProgress.push(ctx.job.id);

          // Create a deferred that we control
          const deferred = createDeferred<void>();
          jobDeferreds.set(ctx.job.id, deferred);

          // Wait for external signal to complete
          await deferred.promise;

          jobsCompleted.push(ctx.job.id);
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
          lockDuration: 5000, // Longer lock for this test
          heartbeatInterval: TEST_TIMEOUTS.heartbeatInterval,
        },
        { concurrency: 3 },
      );

      // Enqueue 3 jobs first
      await client.enqueue("test-queue", { index: 1 });
      await client.enqueue("test-queue", { index: 2 });
      await client.enqueue("test-queue", { index: 3 });

      await worker.start();

      // Wait for all jobs to start processing
      await eventually(async () => {
        return jobsInProgress.length === 3;
      });

      // Start stopping the worker (this should block until jobs complete)
      const stopPromise = worker.stop();

      // At this point, stop() is waiting for jobs to complete
      // Jobs should still be in progress
      expect(jobsCompleted.length).toBe(0);

      // Now let the jobs complete
      for (const deferred of jobDeferreds.values()) {
        deferred.resolve();
      }

      // Wait for stop to complete
      await stopPromise;

      // All jobs should now be completed
      expect(jobsCompleted.length).toBe(3);
    });

    it("B10.4: worker with concurrency 1 processes jobs sequentially", async () => {
      const processingOrder: number[] = [];
      let concurrent = 0;
      let maxConcurrent = 0;

      // Create worker with default concurrency (1)
      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);

          processingOrder.push((ctx.job.data as any).index);
          await sleep(30);

          concurrent--;
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
          lockDuration: TEST_TIMEOUTS.lockDuration,
          heartbeatInterval: TEST_TIMEOUTS.heartbeatInterval,
        },
        { concurrency: 1 },
      );

      // Enqueue 3 jobs first
      const job1 = await client.enqueue("test-queue", { index: 1 });
      const job2 = await client.enqueue("test-queue", { index: 2 });
      const job3 = await client.enqueue("test-queue", { index: 3 });

      await worker.start();

      // Wait for all jobs to complete
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

      // Should never have more than 1 concurrent
      expect(maxConcurrent).toBe(1);
    });
  },
);
