/**
 * A1: Enqueue + Basic Processing
 *
 * Tests that a job can be enqueued and processed by a worker.
 * This is the most fundamental contract test.
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

describe.each(DB_TEST_CONFIGS)(
  "A1: Basic Processing ($label)",
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
      if (worker) {
        await worker.stop();
        worker = null;
      }
      await client.close();
      await testDb.cleanup();
    });

    it("should enqueue a job and return a job ID", async () => {
      const jobId = await client.enqueue("test-queue", { value: 42 });

      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe("string");
      expect(jobId.length).toBeGreaterThan(0);

      // Job should be retrievable
      const job = await client.getJob(jobId);
      expect(job).toBeDefined();
      expect(job?.id).toBe(jobId);
      expect(job?.name).toBe("test-queue");
      expect(job?.data).toEqual({ value: 42 });
    });

    it("should process a single job through a worker", async () => {
      const processed: Job[] = [];

      // Enqueue job BEFORE starting worker to avoid race condition
      const jobId = await client.enqueue("test-queue", { value: 42 });

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

      expect(processed).toHaveLength(1);
      expect(processed[0].data).toEqual({ value: 42 });
      expect(processed[0].id).toBe(jobId);
    });

    it("should set job status to completed after successful processing", async () => {
      // Enqueue job BEFORE starting worker
      const jobId = await client.enqueue("test-queue", { value: 1 });

      worker = createDbWorker(
        "test-queue",
        async () => {
          // Do nothing - just complete successfully
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
        return job?.status === "completed";
      });

      const job = await client.getJob(jobId);
      expect(job?.status).toBe("completed");
      expect(job?.attempts).toBe(1);
    });

    it("should process multiple jobs in order", async () => {
      const processedOrder: number[] = [];

      // Enqueue jobs BEFORE starting worker
      const job1 = await client.enqueue("test-queue", { order: 1 });
      const job2 = await client.enqueue("test-queue", { order: 2 });
      const job3 = await client.enqueue("test-queue", { order: 3 });

      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          processedOrder.push((ctx.job.data as { order: number }).order);
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

      expect(processedOrder).toHaveLength(3);
      // FIFO order for same priority
      expect(processedOrder).toEqual([1, 2, 3]);
    });

    it("should provide job context with heartbeat and log methods", async () => {
      let receivedCtx: any = null;

      // Enqueue job BEFORE starting worker
      const jobId = await client.enqueue("test-queue", { value: 1 });

      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          receivedCtx = ctx;
          ctx.log("Test log message");
          await ctx.heartbeat();
          ctx.progress(50);
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
        return job?.status === "completed";
      });

      expect(receivedCtx).toBeDefined();
      expect(receivedCtx.job).toBeDefined();
      expect(typeof receivedCtx.heartbeat).toBe("function");
      expect(typeof receivedCtx.log).toBe("function");
      expect(typeof receivedCtx.progress).toBe("function");
    });
  },
);
