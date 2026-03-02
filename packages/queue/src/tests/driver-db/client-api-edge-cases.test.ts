/**
 * Client API Edge Cases
 *
 * Tests for boundary conditions and defensive behavior of the QueueClient API:
 * - getJob() for nonexistent jobs
 * - cancel/retry on wrong-state jobs
 * - Queue isolation (workers only process their own queue)
 * - Worker double-start / stop-before-start
 * - Stats for empty/nonexistent queues
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PermanentError } from "../../core/errors.js";
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

describe.each(DB_TEST_CONFIGS)(
  "Client API Edge Cases ($label)",
  ({ dbType }) => {
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
      await Promise.all(workers.map((w) => w.stop()));
      workers = [];
      await client.close();
      await testDb.cleanup();
    });

    // =========================================================================
    // getJob edge cases
    // =========================================================================

    describe("getJob", () => {
      it("should return null for nonexistent job ID", async () => {
        const job = await client.getJob("nonexistent-id-12345");
        expect(job).toBeNull();
      });

      it("should return null for nonexistent key", async () => {
        const job = await client.getJob("nonexistent-key");
        expect(job).toBeNull();
      });

      it("should return null for empty string", async () => {
        const job = await client.getJob("");
        expect(job).toBeNull();
      });
    });

    // =========================================================================
    // cancel edge cases
    // =========================================================================

    describe("cancel", () => {
      it("should return false when cancelling a completed job", async () => {
        const jobId = await client.enqueue("test-queue", { value: 1 });

        // Process the job to completion
        const worker = createDbWorker(
          "test-queue",
          async () => {},
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

        await eventually(async () => {
          const job = await client.getJob(jobId);
          return job?.status === "completed";
        });

        // Try to cancel a completed job
        const cancelled = await client.cancel(jobId);
        expect(cancelled).toBe(false);

        // Job should still be completed
        const job = await client.getJob(jobId);
        expect(job?.status).toBe("completed");
      });

      it("should return false when cancelling a failed job", async () => {
        const jobId = await client.enqueue(
          "test-queue",
          { value: 1 },
          { attempts: 1 },
        );

        const worker = createDbWorker(
          "test-queue",
          async () => {
            throw new PermanentError("fail");
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

        await eventually(async () => {
          const job = await client.getJob(jobId);
          return job?.status === "failed";
        });

        const cancelled = await client.cancel(jobId);
        expect(cancelled).toBe(false);
      });
    });

    // =========================================================================
    // retry edge cases
    // =========================================================================

    describe("retry", () => {
      it("should return false when retrying a completed job", async () => {
        const jobId = await client.enqueue("test-queue", { value: 1 });

        const worker = createDbWorker(
          "test-queue",
          async () => {},
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

        await eventually(async () => {
          const job = await client.getJob(jobId);
          return job?.status === "completed";
        });

        const retried = await client.retry(jobId);
        expect(retried).toBe(false);
      });
    });

    // =========================================================================
    // Queue isolation
    // =========================================================================

    describe("Queue isolation", () => {
      it("should not process jobs from a different queue", async () => {
        const processedJobs: string[] = [];

        // Enqueue jobs in two different queues
        await client.enqueue("queue-a", { value: "a" });
        const jobB = await client.enqueue("queue-b", { value: "b" });

        // Start worker ONLY for queue-b
        const worker = createDbWorker(
          "queue-b",
          async (ctx) => {
            processedJobs.push(ctx.job.queue);
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

        // Wait for queue-b job to complete
        await eventually(async () => {
          const job = await client.getJob(jobB);
          return job?.status === "completed";
        });

        // Wait a bit to ensure queue-a job is NOT picked up
        await sleep(200);

        // Only queue-b job should have been processed
        expect(processedJobs).toEqual(["queue-b"]);

        // queue-a job should still be pending
        const statsA = await client.stats("queue-a");
        expect(statsA.pending).toBe(1);
        expect(statsA.completed).toBe(0);
      });
    });

    // =========================================================================
    // Stats edge cases
    // =========================================================================

    describe("Stats", () => {
      it("should return zeros for empty queue", async () => {
        const stats = await client.stats("empty-queue");
        expect(stats.pending).toBe(0);
        expect(stats.processing).toBe(0);
        expect(stats.completed).toBe(0);
        expect(stats.failed).toBe(0);
        expect(stats.retryPending).toBe(0);
      });

      it("should return aggregate stats when no queue specified", async () => {
        await client.enqueue("queue-a", { value: 1 });
        await client.enqueue("queue-b", { value: 2 });
        await client.enqueue("queue-b", { value: 3 });

        const stats = await client.stats();
        expect(stats.pending).toBe(3);
      });
    });

    // =========================================================================
    // Worker lifecycle edge cases
    // =========================================================================

    describe("Worker lifecycle", () => {
      it("should handle stop() before start()", async () => {
        const worker = createDbWorker(
          "test-queue",
          async () => {},
          {
            db: testDb.db,
            schema: testDb.schema,
            capabilities: testDb.capabilities,
            logger,
            pollInterval: TEST_TIMEOUTS.pollInterval,
          },
        );
        workers.push(worker);

        // Stop before start should not throw
        await expect(worker.stop()).resolves.not.toThrow();
        expect(worker.isRunning()).toBe(false);
      });

      it("should report isRunning() correctly through lifecycle", async () => {
        const worker = createDbWorker(
          "test-queue",
          async () => {},
          {
            db: testDb.db,
            schema: testDb.schema,
            capabilities: testDb.capabilities,
            logger,
            pollInterval: TEST_TIMEOUTS.pollInterval,
          },
        );
        workers.push(worker);

        expect(worker.isRunning()).toBe(false);
        await worker.start();
        expect(worker.isRunning()).toBe(true);
        await worker.stop();
        expect(worker.isRunning()).toBe(false);
      });
    });
  },
);
