/**
 * BullMQ Stats Tests
 *
 * Tests queue statistics reporting.
 *
 * Known limitation: BullMQ `retryPending` always returns 0.
 * BullMQ doesn't distinguish between jobs waiting for retry and jobs
 * scheduled for the future - both are in the "delayed" state.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createBullMQTestHarness,
  eventually,
  createDeferred,
  type QueueTestHarness,
} from "../testkit/index.js";
import type { QueueClient, Worker } from "../../core/types.js";
import { PermanentError } from "../../core/errors.js";

describe("BullMQ: Stats", () => {
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

  describe("Pending count", () => {
    it("should count waiting jobs as pending", async () => {
      await client.enqueue("stats-queue", { id: 1 });
      await client.enqueue("stats-queue", { id: 2 });
      await client.enqueue("stats-queue", { id: 3 });

      const stats = await client.stats("stats-queue");

      expect(stats.pending).toBe(3);
      expect(stats.processing).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
    });

    it("should count delayed jobs as pending", async () => {
      await client.enqueue("stats-queue", { id: 1 }, { delay: 60000 });
      await client.enqueue("stats-queue", { id: 2 }, { delay: 60000 });

      const stats = await client.stats("stats-queue");

      expect(stats.pending).toBe(2);
    });

    it("should include both waiting and delayed in pending", async () => {
      await client.enqueue("stats-queue", { id: 1 }); // waiting
      await client.enqueue("stats-queue", { id: 2 }, { delay: 60000 }); // delayed

      const stats = await client.stats("stats-queue");

      expect(stats.pending).toBe(2);
    });
  });

  describe("Processing count", () => {
    it("should count active jobs as processing", async () => {
      const processingStarted = createDeferred<void>();
      const canFinish = createDeferred<void>();

      await client.enqueue("stats-queue", { id: 1 });

      worker = harness.createWorker("stats-queue", async () => {
        processingStarted.resolve();
        await canFinish.promise;
      });
      await worker.start();

      await processingStarted.promise;

      const stats = await client.stats("stats-queue");

      expect(stats.processing).toBe(1);
      expect(stats.pending).toBe(0);

      canFinish.resolve();
    });
  });

  describe("Completed count", () => {
    it("should count completed jobs", async () => {
      await client.enqueue("stats-queue", { id: 1 });
      await client.enqueue("stats-queue", { id: 2 });

      worker = harness.createWorker("stats-queue", async () => {
        // Success
      });
      await worker.start();

      await eventually(async () => {
        const stats = await client.stats("stats-queue");
        return stats.completed === 2;
      });

      const stats = await client.stats("stats-queue");

      expect(stats.completed).toBe(2);
      expect(stats.pending).toBe(0);
      expect(stats.processing).toBe(0);
    });
  });

  describe("Failed count", () => {
    it("should count permanently failed jobs", async () => {
      await client.enqueue("stats-queue", { id: 1 }, { attempts: 1 });
      await client.enqueue("stats-queue", { id: 2 }, { attempts: 1 });

      worker = harness.createWorker("stats-queue", async () => {
        throw new PermanentError("Intentional failure");
      });
      await worker.start();

      await eventually(async () => {
        const stats = await client.stats("stats-queue");
        return stats.failed === 2;
      });

      const stats = await client.stats("stats-queue");

      expect(stats.failed).toBe(2);
      expect(stats.pending).toBe(0);
      expect(stats.completed).toBe(0);
    });
  });

  describe("RetryPending count (BullMQ limitation)", () => {
    it("should always return 0 for retryPending", async () => {
      // BullMQ doesn't distinguish retry_pending from delayed
      // Jobs waiting for retry are in "delayed" state, counted as pending

      const stats = await client.stats("stats-queue");

      // retryPending is always 0 in BullMQ - this is a known limitation
      expect(stats.retryPending).toBe(0);
    });
  });

  describe("Stats across queues", () => {
    it("should aggregate stats from all queues when no name specified", async () => {
      // Create jobs in multiple queues
      await client.enqueue("queue-a", { id: 1 });
      await client.enqueue("queue-a", { id: 2 });
      await client.enqueue("queue-b", { id: 3 });

      const allStats = await client.stats();

      expect(allStats.pending).toBe(3);
    });

    it("should filter stats by queue name", async () => {
      await client.enqueue("queue-a", { id: 1 });
      await client.enqueue("queue-a", { id: 2 });
      await client.enqueue("queue-b", { id: 3 });

      const statsA = await client.stats("queue-a");
      const statsB = await client.stats("queue-b");

      expect(statsA.pending).toBe(2);
      expect(statsB.pending).toBe(1);
    });
  });

  describe("Stats state transitions", () => {
    it("should update stats as jobs transition through states", async () => {
      const processingStarted = createDeferred<void>();
      const canFinish = createDeferred<void>();

      // Initial: 2 pending
      await client.enqueue("stats-queue", { id: 1 }, { key: "job-1" });
      await client.enqueue("stats-queue", { id: 2 }, { key: "job-2" });

      let stats = await client.stats("stats-queue");
      expect(stats.pending).toBe(2);
      expect(stats.processing).toBe(0);

      // Start worker - one job becomes processing
      worker = harness.createWorker(
        "stats-queue",
        async () => {
          processingStarted.resolve();
          await canFinish.promise;
        },
        { concurrency: 1 },
      );
      await worker.start();

      await processingStarted.promise;

      stats = await client.stats("stats-queue");
      expect(stats.processing).toBe(1);
      expect(stats.pending).toBe(1);

      // Let job complete
      canFinish.resolve();

      // Wait for all jobs to complete
      await eventually(async () => {
        const s = await client.stats("stats-queue");
        return s.completed === 2;
      });

      stats = await client.stats("stats-queue");
      expect(stats.completed).toBe(2);
      expect(stats.pending).toBe(0);
      expect(stats.processing).toBe(0);
    });
  });

  describe("Empty queue stats", () => {
    it("should return zeros for non-existent queue", async () => {
      const stats = await client.stats("non-existent-queue");

      expect(stats.pending).toBe(0);
      expect(stats.processing).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.retryPending).toBe(0);
    });
  });
});
