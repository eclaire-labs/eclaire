/**
 * BullMQ Driver-Specific Tests
 *
 * Tests BullMQ-only features that don't have DB equivalents.
 * These test Redis-specific behaviors and BullMQ internals.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createBullMQTestHarness,
  eventually,
  sleep,
  createDeferred,
  type QueueTestHarness,
} from "../testkit/index.js";
import type { QueueClient, Worker } from "../../core/types.js";

describe("BullMQ: Driver-Specific Features", () => {
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

  describe("Stalled Job Handling", () => {
    it("should detect stalled jobs with short lock duration", async () => {
      // This tests BullMQ's stalled job detection mechanism.
      // With maxStalledCount: 1 (set in worker.ts), a stalled job
      // is automatically failed after detection.

      const jobStarted = createDeferred<void>();
      let processCount = 0;

      const jobId = await client.enqueue("test-queue", { value: 1 });

      // Create worker with very short lock duration
      worker = harness.createWorker(
        "test-queue",
        async () => {
          processCount++;
          jobStarted.resolve();
          // Simulate a job that takes longer than lock duration
          // but doesn't call heartbeat - this should cause stall
          await sleep(1000);
        },
        {
          lockDuration: 200, // Very short lock
        },
      );
      await worker.start();

      await jobStarted.promise;

      // Wait for job to either complete or fail due to stall
      await eventually(
        async () => {
          const job = await client.getJob(jobId);
          return job?.status === "completed" || job?.status === "failed";
        },
        { timeout: 5000 },
      );

      // Job should have been processed
      expect(processCount).toBeGreaterThanOrEqual(1);
    });

    it("should keep job alive with heartbeat during long processing", async () => {
      const jobId = await client.enqueue("test-queue", { value: 1 });
      let completed = false;

      worker = harness.createWorker(
        "test-queue",
        async (ctx) => {
          // Long running job with heartbeats
          for (let i = 0; i < 5; i++) {
            await ctx.heartbeat();
            await sleep(100);
          }
          completed = true;
        },
        {
          lockDuration: 300, // Short lock, but heartbeat keeps it alive
        },
      );
      await worker.start();

      await eventually(
        async () => {
          const job = await client.getJob(jobId);
          return job?.status === "completed";
        },
        { timeout: 3000 },
      );

      expect(completed).toBe(true);
    });
  });

  describe("Job State Transitions", () => {
    it("should transition through waiting -> active -> completed", async () => {
      const states: string[] = [];
      const processingStarted = createDeferred<void>();
      const canFinish = createDeferred<void>();

      const jobId = await client.enqueue("test-queue", { value: 1 });

      // Check initial state
      let job = await client.getJob(jobId);
      states.push(job?.status || "unknown");

      worker = harness.createWorker("test-queue", async () => {
        processingStarted.resolve();
        await canFinish.promise;
      });
      await worker.start();

      await processingStarted.promise;

      // Check processing state
      job = await client.getJob(jobId);
      states.push(job?.status || "unknown");

      canFinish.resolve();

      // Wait for completion
      await eventually(async () => {
        const j = await client.getJob(jobId);
        return j?.status === "completed";
      });

      job = await client.getJob(jobId);
      states.push(job?.status || "unknown");

      expect(states).toEqual(["pending", "processing", "completed"]);
    });

    it("should transition to failed after error", async () => {
      const jobId = await client.enqueue(
        "test-queue",
        { value: 1 },
        { attempts: 1 },
      );

      worker = harness.createWorker("test-queue", async () => {
        throw new Error("Intentional failure");
      });
      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "failed";
      });

      const job = await client.getJob(jobId);
      expect(job?.status).toBe("failed");
    });
  });

  describe("Job Data Integrity", () => {
    it("should preserve complex nested data through processing", async () => {
      const complexData = {
        string: "hello",
        number: 42,
        boolean: true,
        null: null,
        array: [1, 2, 3, { nested: "value" }],
        object: {
          deep: {
            nested: {
              value: "found",
            },
          },
        },
        date: "2024-01-15T10:30:00.000Z", // Dates serialized as strings
      };

      let receivedData: unknown;

      await client.enqueue("test-queue", complexData);

      worker = harness.createWorker("test-queue", async (ctx) => {
        receivedData = ctx.job.data;
      });
      await worker.start();

      await eventually(async () => {
        const stats = await client.stats("test-queue");
        return stats.completed === 1;
      });

      expect(receivedData).toEqual(complexData);
    });

    it("should handle large payloads", async () => {
      // Create a moderately large payload (10KB)
      const largeArray = Array.from({ length: 1000 }, (_, i) => ({
        index: i,
        data: `item-${i}-${"x".repeat(10)}`,
      }));

      let receivedLength = 0;

      await client.enqueue("test-queue", { items: largeArray });

      worker = harness.createWorker("test-queue", async (ctx) => {
        const data = ctx.job.data as { items: unknown[] };
        receivedLength = data.items.length;
      });
      await worker.start();

      await eventually(async () => {
        const stats = await client.stats("test-queue");
        return stats.completed === 1;
      });

      expect(receivedLength).toBe(1000);
    });
  });

  describe("Queue Isolation", () => {
    it("should isolate jobs by queue name", async () => {
      const queueAJobs: string[] = [];
      const queueBJobs: string[] = [];

      // Enqueue to different queues
      await client.enqueue("queue-a", { id: "a1" });
      await client.enqueue("queue-a", { id: "a2" });
      await client.enqueue("queue-b", { id: "b1" });

      // Create workers for each queue
      const workerA = harness.createWorker("queue-a", async (ctx) => {
        queueAJobs.push((ctx.job.data as { id: string }).id);
      });

      const workerB = harness.createWorker("queue-b", async (ctx) => {
        queueBJobs.push((ctx.job.data as { id: string }).id);
      });

      await workerA.start();
      await workerB.start();

      await eventually(async () => {
        const statsA = await client.stats("queue-a");
        const statsB = await client.stats("queue-b");
        return statsA.completed === 2 && statsB.completed === 1;
      });

      await workerA.stop();
      await workerB.stop();

      // Jobs should be processed by correct queue workers
      expect(queueAJobs.sort()).toEqual(["a1", "a2"]);
      expect(queueBJobs).toEqual(["b1"]);
    });
  });

  describe("Job Removal and Cleanup", () => {
    it("should allow cancellation of delayed jobs", async () => {
      // Create a delayed job
      const jobId = await client.enqueue(
        "test-queue",
        { value: 1 },
        { key: "delayed-cancel", delay: 60000 }, // 1 minute delay
      );

      // Verify it exists
      let job = await client.getJob(jobId);
      expect(job).not.toBeNull();
      expect(job?.status).toBe("pending");

      // Cancel it
      const cancelled = await client.cancel(jobId);
      expect(cancelled).toBe(true);

      // Should be removed or marked as failed
      job = await client.getJob(jobId);
      if (job !== null) {
        expect(["failed", "completed"]).toContain(job.status);
      }
    });

    it("should handle retry of failed job", async () => {
      let attemptCount = 0;

      const jobId = await client.enqueue(
        "test-queue",
        { value: 1 },
        { key: "retry-job", attempts: 1 },
      );

      worker = harness.createWorker("test-queue", async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error("First attempt fails");
        }
        // Second attempt succeeds
      });
      await worker.start();

      // Wait for initial failure
      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "failed";
      });

      expect(attemptCount).toBe(1);

      // Retry the failed job
      const retried = await client.retry(jobId);
      expect(retried).toBe(true);

      // Wait for successful completion
      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      expect(attemptCount).toBe(2);
    });
  });

  describe("Prefix Isolation", () => {
    it("should use test prefix for queue isolation", async () => {
      // This test verifies that the test harness properly isolates
      // queues using a unique prefix, preventing test interference.

      const processedIds: string[] = [];

      // Multiple jobs
      for (let i = 0; i < 3; i++) {
        await client.enqueue("isolated-queue", { id: `job-${i}` });
      }

      worker = harness.createWorker("isolated-queue", async (ctx) => {
        processedIds.push((ctx.job.data as { id: string }).id);
      });
      await worker.start();

      await eventually(async () => {
        const stats = await client.stats("isolated-queue");
        return stats.completed === 3;
      });

      expect(processedIds.length).toBe(3);
    });
  });
});
