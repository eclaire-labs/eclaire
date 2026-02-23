/**
 * BullMQ Worker Concurrency Tests
 *
 * Tests the worker `concurrency` option which controls how many jobs
 * a single worker processes simultaneously.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { QueueClient, Worker } from "../../core/types.js";
import {
  createBullMQTestHarness,
  eventually,
  type QueueTestHarness,
  sleep,
} from "../testkit/index.js";

describe("BullMQ: Worker Concurrency Option", () => {
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

  describe("concurrency: 1 (default)", () => {
    it("should process one job at a time", async () => {
      const concurrentJobs: number[] = [];
      let currentConcurrent = 0;
      let maxConcurrent = 0;

      // Create several jobs
      for (let i = 0; i < 5; i++) {
        await client.enqueue("test-queue", { id: i });
      }

      worker = harness.createWorker(
        "test-queue",
        async () => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          concurrentJobs.push(currentConcurrent);
          await sleep(50);
          currentConcurrent--;
        },
        { concurrency: 1 },
      );
      await worker.start();

      await eventually(
        async () => {
          const stats = await client.stats("test-queue");
          return stats.completed === 5;
        },
        { timeout: 5000 },
      );

      // With concurrency 1, max should be 1
      expect(maxConcurrent).toBe(1);
    });
  });

  describe("concurrency: 3", () => {
    it("should process up to 3 jobs simultaneously", async () => {
      let currentConcurrent = 0;
      let maxConcurrent = 0;
      const concurrencySnapshots: number[] = [];

      // Create many jobs
      for (let i = 0; i < 15; i++) {
        await client.enqueue("test-queue", { id: i });
      }

      worker = harness.createWorker(
        "test-queue",
        async () => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          concurrencySnapshots.push(currentConcurrent);
          await sleep(100); // Hold the job for a bit
          currentConcurrent--;
        },
        { concurrency: 3 },
      );
      await worker.start();

      await eventually(
        async () => {
          const stats = await client.stats("test-queue");
          return stats.completed === 15;
        },
        { timeout: 10000 },
      );

      // Should have reached concurrency of 3
      expect(maxConcurrent).toBeGreaterThanOrEqual(2);
      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it("should not exceed concurrency limit", async () => {
      let currentConcurrent = 0;
      let maxConcurrent = 0;

      // Create many jobs
      for (let i = 0; i < 20; i++) {
        await client.enqueue("test-queue", { id: i });
      }

      worker = harness.createWorker(
        "test-queue",
        async () => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          await sleep(50);
          currentConcurrent--;
        },
        { concurrency: 3 },
      );
      await worker.start();

      await eventually(
        async () => {
          const stats = await client.stats("test-queue");
          return stats.completed === 20;
        },
        { timeout: 10000 },
      );

      // Should never exceed 3
      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });
  });

  describe("High concurrency", () => {
    it("should handle concurrency: 5 correctly", async () => {
      let currentConcurrent = 0;
      let maxConcurrent = 0;
      const processedCount = { value: 0 };

      // Create many jobs
      for (let i = 0; i < 25; i++) {
        await client.enqueue("test-queue", { id: i });
      }

      worker = harness.createWorker(
        "test-queue",
        async () => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          processedCount.value++;
          await sleep(50);
          currentConcurrent--;
        },
        { concurrency: 5 },
      );
      await worker.start();

      await eventually(
        async () => {
          const stats = await client.stats("test-queue");
          return stats.completed === 25;
        },
        { timeout: 10000 },
      );

      expect(processedCount.value).toBe(25);
      expect(maxConcurrent).toBeLessThanOrEqual(5);
      expect(maxConcurrent).toBeGreaterThanOrEqual(3); // Should utilize concurrency
    });
  });

  describe("All jobs complete", () => {
    it("should complete all jobs regardless of concurrency", async () => {
      const completedIds = new Set<number>();

      // Create jobs
      for (let i = 0; i < 10; i++) {
        await client.enqueue("test-queue", { id: i });
      }

      worker = harness.createWorker(
        "test-queue",
        async (ctx) => {
          const data = ctx.job.data as { id: number };
          completedIds.add(data.id);
          await sleep(30);
        },
        { concurrency: 3 },
      );
      await worker.start();

      await eventually(
        async () => {
          const stats = await client.stats("test-queue");
          return stats.completed === 10;
        },
        { timeout: 5000 },
      );

      // All job IDs should be present
      for (let i = 0; i < 10; i++) {
        expect(completedIds.has(i)).toBe(true);
      }
    });

    it("should not have job starvation with high concurrency", async () => {
      const processedOrder: number[] = [];

      // Create jobs with delays to ensure they're all queued
      for (let i = 0; i < 20; i++) {
        await client.enqueue("test-queue", { order: i });
      }

      worker = harness.createWorker(
        "test-queue",
        async (ctx) => {
          const data = ctx.job.data as { order: number };
          processedOrder.push(data.order);
          // Variable processing time
          await sleep(10 + Math.random() * 40);
        },
        { concurrency: 5 },
      );
      await worker.start();

      await eventually(
        async () => {
          const stats = await client.stats("test-queue");
          return stats.completed === 20;
        },
        { timeout: 10000 },
      );

      // All jobs should be processed
      expect(processedOrder.length).toBe(20);
      expect(new Set(processedOrder).size).toBe(20); // No duplicates
    });
  });

  describe("Error handling with concurrency", () => {
    it("should handle errors in concurrent jobs independently", async () => {
      let _successCount = 0;
      let _errorCount = 0;

      // Create jobs - some will fail
      for (let i = 0; i < 10; i++) {
        await client.enqueue(
          "test-queue",
          { id: i, shouldFail: i % 3 === 0 },
          { attempts: 1 },
        );
      }

      worker = harness.createWorker(
        "test-queue",
        async (ctx) => {
          const data = ctx.job.data as { id: number; shouldFail: boolean };
          await sleep(30);
          if (data.shouldFail) {
            _errorCount++;
            throw new Error("Intentional failure");
          }
          _successCount++;
        },
        { concurrency: 3 },
      );
      await worker.start();

      await eventually(
        async () => {
          const stats = await client.stats("test-queue");
          return stats.completed + stats.failed === 10;
        },
        { timeout: 10000 },
      );

      const stats = await client.stats("test-queue");

      // Jobs 0, 3, 6, 9 should fail (4 jobs)
      expect(stats.failed).toBe(4);
      expect(stats.completed).toBe(6);
    });
  });
});
