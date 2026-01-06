/**
 * BullMQ Concurrency Tests
 *
 * Tests multiple workers competing for jobs from the same queue.
 * Verifies that jobs are distributed and each job is processed exactly once.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { QueueClient, Worker } from "../../core/types.js";
import {
  createBullMQTestHarness,
  eventually,
  type QueueTestHarness,
  sleep,
} from "../testkit/index.js";

describe("BullMQ: Concurrency (Multiple Workers)", () => {
  let harness: QueueTestHarness;
  let client: QueueClient;
  let worker1: Worker | null = null;
  let worker2: Worker | null = null;

  beforeEach(async () => {
    harness = await createBullMQTestHarness();
    client = harness.createClient();
  });

  afterEach(async () => {
    if (worker1) {
      await worker1.stop();
      worker1 = null;
    }
    if (worker2) {
      await worker2.stop();
      worker2 = null;
    }
    await harness.cleanup();
  });

  describe("Job Distribution", () => {
    it("should distribute jobs across two workers", async () => {
      const processedByWorker: Map<string, string> = new Map();
      const worker1Jobs: string[] = [];
      const worker2Jobs: string[] = [];

      // Create jobs first
      for (let i = 0; i < 10; i++) {
        await client.enqueue("test-queue", { id: i }, { key: `job-${i}` });
      }

      // Create two workers processing the same queue
      worker1 = harness.createWorker("test-queue", async (ctx) => {
        const jobId = ctx.job.id;
        worker1Jobs.push(jobId);
        processedByWorker.set(jobId, "worker1");
        await sleep(50); // Simulate work
      });

      worker2 = harness.createWorker("test-queue", async (ctx) => {
        const jobId = ctx.job.id;
        worker2Jobs.push(jobId);
        processedByWorker.set(jobId, "worker2");
        await sleep(50); // Simulate work
      });

      await worker1.start();
      await worker2.start();

      // Wait for all jobs to complete
      await eventually(
        async () => {
          const stats = await client.stats("test-queue");
          return stats.completed === 10;
        },
        { timeout: 10000 },
      );

      // All jobs should be processed
      expect(processedByWorker.size).toBe(10);

      // Both workers should have received jobs
      // (may not be exactly 5 each due to timing, but both should have > 0)
      expect(worker1Jobs.length).toBeGreaterThan(0);
      expect(worker2Jobs.length).toBeGreaterThan(0);

      // Total should be 10
      expect(worker1Jobs.length + worker2Jobs.length).toBe(10);
    });

    it("should not process the same job twice", async () => {
      const processedJobIds: string[] = [];

      // Create jobs
      for (let i = 0; i < 20; i++) {
        await client.enqueue("test-queue", { id: i }, { key: `unique-${i}` });
      }

      // Create two workers
      worker1 = harness.createWorker("test-queue", async (ctx) => {
        processedJobIds.push(ctx.job.id);
        await sleep(30);
      });

      worker2 = harness.createWorker("test-queue", async (ctx) => {
        processedJobIds.push(ctx.job.id);
        await sleep(30);
      });

      await worker1.start();
      await worker2.start();

      await eventually(
        async () => {
          const stats = await client.stats("test-queue");
          return stats.completed === 20;
        },
        { timeout: 10000 },
      );

      // Verify no duplicates
      const uniqueIds = new Set(processedJobIds);
      expect(uniqueIds.size).toBe(20);
      expect(processedJobIds.length).toBe(20);
    });
  });

  describe("All Jobs Processed", () => {
    it("should eventually process all jobs with multiple workers", async () => {
      const processedCount = { value: 0 };

      // Create many jobs
      for (let i = 0; i < 50; i++) {
        await client.enqueue("test-queue", { id: i });
      }

      worker1 = harness.createWorker("test-queue", async () => {
        processedCount.value++;
        await sleep(20);
      });

      worker2 = harness.createWorker("test-queue", async () => {
        processedCount.value++;
        await sleep(20);
      });

      await worker1.start();
      await worker2.start();

      await eventually(
        async () => {
          const stats = await client.stats("test-queue");
          return stats.completed === 50;
        },
        { timeout: 15000 },
      );

      expect(processedCount.value).toBe(50);
    });

    it("should handle workers starting at different times", async () => {
      const processedCount = { value: 0 };

      // Create jobs
      for (let i = 0; i < 10; i++) {
        await client.enqueue("test-queue", { id: i });
      }

      // Start first worker
      worker1 = harness.createWorker("test-queue", async () => {
        processedCount.value++;
        await sleep(50);
      });
      await worker1.start();

      // Wait a bit, then start second worker
      await sleep(100);

      worker2 = harness.createWorker("test-queue", async () => {
        processedCount.value++;
        await sleep(50);
      });
      await worker2.start();

      await eventually(
        async () => {
          const stats = await client.stats("test-queue");
          return stats.completed === 10;
        },
        { timeout: 10000 },
      );

      expect(processedCount.value).toBe(10);
    });
  });

  describe("Worker Failure Scenarios", () => {
    it("should continue processing if one worker stops", async () => {
      const processedCount = { value: 0 };

      // Create jobs
      for (let i = 0; i < 10; i++) {
        await client.enqueue("test-queue", { id: i });
      }

      worker1 = harness.createWorker("test-queue", async () => {
        processedCount.value++;
        await sleep(30);
      });

      worker2 = harness.createWorker("test-queue", async () => {
        processedCount.value++;
        await sleep(30);
      });

      await worker1.start();
      await worker2.start();

      // Wait for some processing
      await eventually(async () => processedCount.value >= 3, {
        timeout: 5000,
      });

      // Stop one worker
      await worker1.stop();
      worker1 = null;

      // Remaining worker should complete the rest
      await eventually(
        async () => {
          const stats = await client.stats("test-queue");
          return stats.completed === 10;
        },
        { timeout: 10000 },
      );

      expect(processedCount.value).toBe(10);
    });
  });
});
