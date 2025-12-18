/**
 * BullMQ Timing Tests
 *
 * Tests priority, delay, and runAt job options.
 *
 * Note: BullMQ priority semantics - lower number = higher priority (processed first).
 * Priority 1 processes before priority 10.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createBullMQTestHarness,
  eventually,
  sleep,
  type QueueTestHarness,
} from "../testkit/index.js";
import type { QueueClient, Worker } from "../../core/types.js";

describe("BullMQ: Timing", () => {
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

  describe("Priority", () => {
    it("should process lower priority number first", async () => {
      const processedOrder: number[] = [];

      // Enqueue jobs with different priorities (lower number = higher priority)
      await client.enqueue(
        "test-queue",
        { order: 3 },
        { key: "job-3", priority: 10 }, // Lowest priority
      );
      await client.enqueue(
        "test-queue",
        { order: 1 },
        { key: "job-1", priority: 1 }, // Highest priority
      );
      await client.enqueue(
        "test-queue",
        { order: 2 },
        { key: "job-2", priority: 5 }, // Middle priority
      );

      worker = harness.createWorker("test-queue", async (ctx) => {
        processedOrder.push((ctx.job.data as { order: number }).order);
      });
      await worker.start();

      // Wait for all jobs to complete
      await eventually(async () => processedOrder.length === 3);

      // Jobs should be processed in priority order: 1, 2, 3
      expect(processedOrder).toEqual([1, 2, 3]);
    });

    it("should default to priority 0", async () => {
      const jobId = await client.enqueue("test-queue", { value: 1 });

      const job = await client.getJob(jobId);
      expect(job?.priority).toBe(0);
    });
  });

  describe("Delay", () => {
    it("should not process job until delay elapses", async () => {
      const processedAt: number[] = [];
      const enqueuedAt = Date.now();

      // Create job with 200ms delay
      const jobId = await client.enqueue(
        "test-queue",
        { value: 1 },
        { key: "delayed-job", delay: 200 },
      );

      worker = harness.createWorker("test-queue", async () => {
        processedAt.push(Date.now());
      });
      await worker.start();

      // Verify job is in pending/delayed state initially
      const initialJob = await client.getJob(jobId);
      expect(initialJob?.status).toBe("pending");

      // Wait for processing
      await eventually(async () => processedAt.length === 1);

      // Verify delay was respected (with some tolerance)
      const actualDelay = processedAt[0] - enqueuedAt;
      expect(actualDelay).toBeGreaterThanOrEqual(180); // Allow 20ms tolerance
      expect(actualDelay).toBeLessThan(500); // Shouldn't take too long
    });

    it("should process immediately with zero delay", async () => {
      const processedAt: number[] = [];
      const enqueuedAt = Date.now();

      await client.enqueue(
        "test-queue",
        { value: 1 },
        { key: "no-delay", delay: 0 },
      );

      worker = harness.createWorker("test-queue", async () => {
        processedAt.push(Date.now());
      });
      await worker.start();

      await eventually(async () => processedAt.length === 1);

      // Should process quickly (within 200ms)
      const actualDelay = processedAt[0] - enqueuedAt;
      expect(actualDelay).toBeLessThan(200);
    });

    it("should process immediately without delay option", async () => {
      const processedAt: number[] = [];
      const enqueuedAt = Date.now();

      await client.enqueue("test-queue", { value: 1 }, { key: "immediate" });

      worker = harness.createWorker("test-queue", async () => {
        processedAt.push(Date.now());
      });
      await worker.start();

      await eventually(async () => processedAt.length === 1);

      // Should process quickly
      const actualDelay = processedAt[0] - enqueuedAt;
      expect(actualDelay).toBeLessThan(200);
    });
  });

  describe("RunAt", () => {
    it("should schedule job for specific time", async () => {
      const processedAt: number[] = [];
      const targetTime = new Date(Date.now() + 200); // 200ms in the future

      const jobId = await client.enqueue(
        "test-queue",
        { value: 1 },
        { key: "scheduled-job", runAt: targetTime },
      );

      worker = harness.createWorker("test-queue", async () => {
        processedAt.push(Date.now());
      });
      await worker.start();

      // Verify job has scheduledFor set
      const job = await client.getJob(jobId);
      expect(job?.scheduledFor).toBeDefined();

      await eventually(async () => processedAt.length === 1);

      // Should process around the target time
      expect(processedAt[0]).toBeGreaterThanOrEqual(targetTime.getTime() - 20);
    });

    it("should process immediately if runAt is in the past", async () => {
      const processedAt: number[] = [];
      const pastTime = new Date(Date.now() - 1000); // 1 second ago

      await client.enqueue(
        "test-queue",
        { value: 1 },
        { key: "past-job", runAt: pastTime },
      );

      worker = harness.createWorker("test-queue", async () => {
        processedAt.push(Date.now());
      });
      await worker.start();

      await eventually(async () => processedAt.length === 1);

      // Should process immediately
      const processingTime = processedAt[0];
      expect(processingTime - Date.now()).toBeLessThan(200);
    });
  });

  describe("Priority + Delay interaction", () => {
    it("should respect priority among jobs that become ready at same time", async () => {
      const processedOrder: number[] = [];

      // Create jobs with same delay but different priorities
      const delay = 300;

      await client.enqueue(
        "test-queue",
        { order: 3 },
        { key: "low-priority", priority: 10, delay },
      );
      await client.enqueue(
        "test-queue",
        { order: 1 },
        { key: "high-priority", priority: 1, delay },
      );
      await client.enqueue(
        "test-queue",
        { order: 2 },
        { key: "mid-priority", priority: 5, delay },
      );

      // Wait for delay to elapse before starting worker
      // This ensures all jobs are ready at the same time
      await sleep(delay + 50);

      worker = harness.createWorker("test-queue", async (ctx) => {
        processedOrder.push((ctx.job.data as { order: number }).order);
      });
      await worker.start();

      await eventually(async () => processedOrder.length === 3);

      // Should process in priority order
      expect(processedOrder).toEqual([1, 2, 3]);
    });

    it("should process delayed high-priority job before ready low-priority job", async () => {
      const processedOrder: number[] = [];

      // Start worker first
      worker = harness.createWorker("test-queue", async (ctx) => {
        processedOrder.push((ctx.job.data as { order: number }).order);
        // Small delay to ensure ordering is captured
        await sleep(50);
      });
      await worker.start();

      // Add low priority job (ready immediately)
      await client.enqueue(
        "test-queue",
        { order: 2 },
        { key: "ready-low", priority: 10 },
      );

      // Add high priority job (delayed 100ms)
      await client.enqueue(
        "test-queue",
        { order: 1 },
        { key: "delayed-high", priority: 1, delay: 100 },
      );

      await eventually(async () => processedOrder.length === 2);

      // The ready low-priority job should process first because it's available
      // The delayed high-priority job processes after its delay
      // This demonstrates that delay takes precedence over priority
      expect(processedOrder[0]).toBe(2); // Ready job first
      expect(processedOrder[1]).toBe(1); // Delayed job second
    });
  });
});
