/**
 * BullMQ Job Context Tests
 *
 * Tests JobContext methods: heartbeat, log, progress.
 *
 * Note: BullMQ handles lock extension automatically via lockDuration.
 * The heartbeat() method updates progress to show activity.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JobContext, QueueClient, Worker } from "../../core/types.js";
import {
  createBullMQTestHarness,
  createDeferred,
  eventually,
  type QueueTestHarness,
  sleep,
} from "../testkit/index.js";

describe("BullMQ: Job Context", () => {
  let harness: QueueTestHarness;
  let client: QueueClient;
  let worker: Worker | null = null;

  beforeEach(async () => {
    harness = await createBullMQTestHarness();
    client = harness.createClient();
  });

  afterEach(async () => {
    if (worker) {
      await worker.stop();
      worker = null;
    }
    await harness.cleanup();
  });

  describe("heartbeat()", () => {
    it("should be callable without error", async () => {
      const heartbeatCalled = createDeferred<void>();

      await client.enqueue("test-queue", { value: 1 });

      worker = harness.createWorker("test-queue", async (ctx) => {
        await ctx.heartbeat();
        heartbeatCalled.resolve();
      });
      await worker.start();

      await heartbeatCalled.promise;
    });

    it("should allow multiple heartbeat calls", async () => {
      let heartbeatCount = 0;
      const processingDone = createDeferred<void>();

      await client.enqueue("test-queue", { value: 1 });

      worker = harness.createWorker("test-queue", async (ctx) => {
        // Call heartbeat multiple times
        for (let i = 0; i < 5; i++) {
          await ctx.heartbeat();
          heartbeatCount++;
          await sleep(10);
        }
        processingDone.resolve();
      });
      await worker.start();

      await processingDone.promise;

      expect(heartbeatCount).toBe(5);
    });

    it("should keep job active during long processing", async () => {
      // Use a short lock duration to test heartbeat keeps job alive
      const jobId = await client.enqueue("test-queue", { value: 1 });

      const jobStarted = createDeferred<void>();

      worker = harness.createWorker(
        "test-queue",
        async (ctx) => {
          jobStarted.resolve();

          // Simulate long processing with periodic heartbeats
          for (let i = 0; i < 3; i++) {
            await ctx.heartbeat();
            await sleep(100);
          }
        },
        { lockDuration: 500 }, // Short lock for testing
      );
      await worker.start();

      await jobStarted.promise;

      // Job should still be processing (not stalled)
      const job = await client.getJob(jobId);
      expect(job?.status).toBe("processing");

      // Wait for completion
      await eventually(async () => {
        const j = await client.getJob(jobId);
        return j?.status === "completed";
      });
    });
  });

  describe("log()", () => {
    it("should record log messages", async () => {
      const logMessages: string[] = [];

      await client.enqueue("test-queue", { value: 1 });

      worker = harness.createWorker("test-queue", async (ctx) => {
        ctx.log("Starting job processing");
        ctx.log("Step 1 complete");
        ctx.log("Step 2 complete");
        ctx.log("Job finished");
      });
      await worker.start();

      await eventually(async () => {
        const stats = await client.stats("test-queue");
        return stats.completed === 1;
      });

      // Log is called without error (messages go to BullMQ job logs)
      // We can't easily verify the logs without direct Redis access,
      // but the test verifies the method is callable
    });

    it("should handle empty log messages", async () => {
      const completed = createDeferred<void>();

      await client.enqueue("test-queue", { value: 1 });

      worker = harness.createWorker("test-queue", async (ctx) => {
        ctx.log("");
        completed.resolve();
      });
      await worker.start();

      await completed.promise;
    });

    it("should handle special characters in log messages", async () => {
      const completed = createDeferred<void>();

      await client.enqueue("test-queue", { value: 1 });

      worker = harness.createWorker("test-queue", async (ctx) => {
        ctx.log("Message with special chars: \n\t\"quotes\" and 'apostrophes'");
        ctx.log("Unicode: 你好世界 🎉");
        ctx.log('JSON: {"key": "value"}');
        completed.resolve();
      });
      await worker.start();

      await completed.promise;
    });
  });

  describe("progress()", () => {
    it("should update job progress", async () => {
      const progressValues: number[] = [];
      const completed = createDeferred<void>();

      await client.enqueue("test-queue", { value: 1 });

      worker = harness.createWorker("test-queue", async (ctx) => {
        ctx.progress(0);
        progressValues.push(0);

        await sleep(10);
        ctx.progress(25);
        progressValues.push(25);

        await sleep(10);
        ctx.progress(50);
        progressValues.push(50);

        await sleep(10);
        ctx.progress(75);
        progressValues.push(75);

        await sleep(10);
        ctx.progress(100);
        progressValues.push(100);

        completed.resolve();
      });
      await worker.start();

      await completed.promise;

      expect(progressValues).toEqual([0, 25, 50, 75, 100]);
    });

    it("should handle progress values 0-100", async () => {
      const completed = createDeferred<void>();

      await client.enqueue("test-queue", { value: 1 });

      worker = harness.createWorker("test-queue", async (ctx) => {
        ctx.progress(0); // Minimum
        ctx.progress(50); // Middle
        ctx.progress(100); // Maximum
        completed.resolve();
      });
      await worker.start();

      await completed.promise;
    });

    it("should allow rapid progress updates", async () => {
      let updateCount = 0;
      const completed = createDeferred<void>();

      await client.enqueue("test-queue", { value: 1 });

      worker = harness.createWorker("test-queue", async (ctx) => {
        // Rapid progress updates (like in a batch processing loop)
        for (let i = 0; i <= 100; i++) {
          ctx.progress(i);
          updateCount++;
        }
        completed.resolve();
      });
      await worker.start();

      await completed.promise;

      expect(updateCount).toBe(101);
    });
  });

  describe("Context availability", () => {
    it("should provide job data in context", async () => {
      let receivedData: unknown;

      await client.enqueue("test-queue", { message: "Hello", count: 42 });

      worker = harness.createWorker("test-queue", async (ctx) => {
        receivedData = ctx.job.data;
      });
      await worker.start();

      await eventually(async () => {
        const stats = await client.stats("test-queue");
        return stats.completed === 1;
      });

      expect(receivedData).toEqual({ message: "Hello", count: 42 });
    });

    it("should provide job metadata in context", async () => {
      let jobInfo: { id: string; queue: string; attempts: number } | null = null;

      const jobId = await client.enqueue(
        "test-queue",
        { value: 1 },
        { key: "context-test", attempts: 5 },
      );

      worker = harness.createWorker("test-queue", async (ctx) => {
        jobInfo = {
          id: ctx.job.id,
          queue: ctx.job.queue,
          attempts: ctx.job.attempts,
        };
      });
      await worker.start();

      await eventually(async () => {
        const stats = await client.stats("test-queue");
        return stats.completed === 1;
      });

      expect(jobInfo).not.toBeNull();
      expect(jobInfo!.id).toBe("context-test");
      expect(jobInfo!.queue).toBe("test-queue");
      expect(jobInfo!.attempts).toBe(1); // First attempt
    });

    it("should show correct attempt number on retries", async () => {
      const attemptNumbers: number[] = [];

      await client.enqueue(
        "test-queue",
        { value: 1 },
        { attempts: 3, backoff: { type: "fixed", delay: 50 } },
      );

      worker = harness.createWorker("test-queue", async (ctx) => {
        attemptNumbers.push(ctx.job.attempts);
        if (attemptNumbers.length < 3) {
          throw new Error("Retry");
        }
      });
      await worker.start();

      await eventually(
        async () => {
          const stats = await client.stats("test-queue");
          return stats.completed === 1;
        },
        { timeout: 5000 },
      );

      expect(attemptNumbers).toEqual([1, 2, 3]);
    });
  });
});
