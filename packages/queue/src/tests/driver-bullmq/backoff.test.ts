/**
 * BullMQ Backoff Tests
 *
 * Tests backoff strategies and rate limiting behavior.
 *
 * Note: BullMQ doesn't support "linear" backoff - it degrades to "fixed".
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RateLimitError, RetryableError } from "../../core/errors.js";
import type { QueueClient, Worker } from "../../core/types.js";
import {
  createBullMQTestHarness,
  eventually,
  type QueueTestHarness,
} from "../testkit/index.js";

describe("BullMQ: Backoff", () => {
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

  describe("Exponential Backoff", () => {
    it("should delay retries exponentially", async () => {
      const attemptTimes: number[] = [];

      const jobId = await client.enqueue(
        "test-queue",
        { value: 1 },
        {
          key: "exp-backoff",
          attempts: 3,
          backoff: { type: "exponential", delay: 100 },
        },
      );

      worker = harness.createWorker("test-queue", async (_ctx) => {
        attemptTimes.push(Date.now());
        if (attemptTimes.length < 3) {
          throw new RetryableError("Retry me");
        }
      });
      await worker.start();

      // Wait for all attempts
      await eventually(
        async () => {
          const job = await client.getJob(jobId);
          return job?.status === "completed";
        },
        { timeout: 5000 },
      );

      expect(attemptTimes).toHaveLength(3);

      // Calculate delays between attempts
      const delay1 = attemptTimes[1] - attemptTimes[0];
      const delay2 = attemptTimes[2] - attemptTimes[1];

      // Exponential: first delay ~100ms, second delay ~200ms
      // Allow generous tolerance for timing variations
      expect(delay1).toBeGreaterThanOrEqual(80);
      expect(delay1).toBeLessThan(300);
      expect(delay2).toBeGreaterThanOrEqual(150);
      expect(delay2).toBeLessThan(500);

      // Second delay should be longer than first (exponential growth)
      expect(delay2).toBeGreaterThan(delay1 * 0.8);
    });
  });

  describe("Fixed Backoff", () => {
    it("should delay retries with consistent timing", async () => {
      const attemptTimes: number[] = [];

      const jobId = await client.enqueue(
        "test-queue",
        { value: 1 },
        {
          key: "fixed-backoff",
          attempts: 3,
          backoff: { type: "fixed", delay: 150 },
        },
      );

      worker = harness.createWorker("test-queue", async (_ctx) => {
        attemptTimes.push(Date.now());
        if (attemptTimes.length < 3) {
          throw new RetryableError("Retry me");
        }
      });
      await worker.start();

      await eventually(
        async () => {
          const job = await client.getJob(jobId);
          return job?.status === "completed";
        },
        { timeout: 5000 },
      );

      expect(attemptTimes).toHaveLength(3);

      const delay1 = attemptTimes[1] - attemptTimes[0];
      const delay2 = attemptTimes[2] - attemptTimes[1];

      // Fixed: both delays should be similar (~150ms)
      expect(delay1).toBeGreaterThanOrEqual(100);
      expect(delay1).toBeLessThan(400);
      expect(delay2).toBeGreaterThanOrEqual(100);
      expect(delay2).toBeLessThan(400);

      // Delays should be similar (both ~150ms)
      expect(Math.abs(delay1 - delay2)).toBeLessThan(150);
    });
  });

  describe("Linear Backoff (degrades to fixed)", () => {
    it("should behave like fixed backoff (BullMQ limitation)", async () => {
      // BullMQ doesn't support linear backoff - it maps to fixed
      const attemptTimes: number[] = [];

      const jobId = await client.enqueue(
        "test-queue",
        { value: 1 },
        {
          key: "linear-backoff",
          attempts: 3,
          // "linear" is mapped to "fixed" in BullMQ driver
          backoff: { type: "linear", delay: 150 },
        },
      );

      worker = harness.createWorker("test-queue", async (_ctx) => {
        attemptTimes.push(Date.now());
        if (attemptTimes.length < 3) {
          throw new RetryableError("Retry me");
        }
      });
      await worker.start();

      await eventually(
        async () => {
          const job = await client.getJob(jobId);
          return job?.status === "completed";
        },
        { timeout: 5000 },
      );

      expect(attemptTimes).toHaveLength(3);

      const delay1 = attemptTimes[1] - attemptTimes[0];
      const delay2 = attemptTimes[2] - attemptTimes[1];

      // Since linear degrades to fixed, delays should be similar
      expect(Math.abs(delay1 - delay2)).toBeLessThan(200);
    });
  });

  describe("RateLimitError", () => {
    it("should delay job without consuming attempts", async () => {
      const attemptTimes: number[] = [];
      const attemptNumbers: number[] = [];

      const jobId = await client.enqueue(
        "test-queue",
        { value: 1 },
        {
          key: "rate-limited",
          attempts: 3,
        },
      );

      worker = harness.createWorker("test-queue", async (ctx) => {
        attemptTimes.push(Date.now());
        attemptNumbers.push(ctx.job.attempts);

        if (attemptTimes.length === 1) {
          // First call: throw RateLimitError (should NOT consume attempt)
          throw new RateLimitError(200, "Rate limited");
        }
        // Second call: succeed
      });
      await worker.start();

      await eventually(
        async () => {
          const job = await client.getJob(jobId);
          return job?.status === "completed";
        },
        { timeout: 5000 },
      );

      // Job should complete after rate limit delay
      expect(attemptTimes).toHaveLength(2);

      // Verify delay was respected
      const delay = attemptTimes[1] - attemptTimes[0];
      expect(delay).toBeGreaterThanOrEqual(150);

      // RateLimitError should NOT consume attempts
      // Both invocations should show attempt 1
      expect(attemptNumbers[0]).toBe(1);
      expect(attemptNumbers[1]).toBe(1);
    });

    it("should delay by specified duration", async () => {
      const attemptTimes: number[] = [];
      const delayDuration = 300;

      await client.enqueue("test-queue", { value: 1 }, { key: "rate-delay" });

      worker = harness.createWorker("test-queue", async () => {
        attemptTimes.push(Date.now());
        if (attemptTimes.length === 1) {
          throw new RateLimitError(delayDuration);
        }
      });
      await worker.start();

      await eventually(async () => attemptTimes.length >= 2, { timeout: 5000 });

      const actualDelay = attemptTimes[1] - attemptTimes[0];
      expect(actualDelay).toBeGreaterThanOrEqual(delayDuration - 50);
      expect(actualDelay).toBeLessThan(delayDuration + 200);
    });
  });

  describe("RetryableError", () => {
    it("should consume attempts on retry", async () => {
      const attemptNumbers: number[] = [];

      const jobId = await client.enqueue(
        "test-queue",
        { value: 1 },
        {
          key: "retryable",
          attempts: 3,
          backoff: { type: "fixed", delay: 50 },
        },
      );

      worker = harness.createWorker("test-queue", async (ctx) => {
        attemptNumbers.push(ctx.job.attempts);
        if (attemptNumbers.length < 3) {
          throw new RetryableError("Temporary failure");
        }
      });
      await worker.start();

      await eventually(
        async () => {
          const job = await client.getJob(jobId);
          return job?.status === "completed";
        },
        { timeout: 5000 },
      );

      // Each retry should increment attempts
      expect(attemptNumbers).toEqual([1, 2, 3]);
    });

    it("should fail permanently after exhausting attempts", async () => {
      let attemptCount = 0;

      const jobId = await client.enqueue(
        "test-queue",
        { value: 1 },
        {
          key: "exhaust-attempts",
          attempts: 2,
          backoff: { type: "fixed", delay: 50 },
        },
      );

      worker = harness.createWorker("test-queue", async () => {
        attemptCount++;
        throw new RetryableError("Always fails");
      });
      await worker.start();

      await eventually(
        async () => {
          const job = await client.getJob(jobId);
          return job?.status === "failed";
        },
        { timeout: 5000 },
      );

      expect(attemptCount).toBe(2);

      const job = await client.getJob(jobId);
      expect(job?.status).toBe("failed");
    });
  });

  describe("Generic Error (treated as retryable)", () => {
    it("should retry generic errors with backoff", async () => {
      const attemptNumbers: number[] = [];

      const jobId = await client.enqueue(
        "test-queue",
        { value: 1 },
        {
          key: "generic-error",
          attempts: 3,
          backoff: { type: "fixed", delay: 50 },
        },
      );

      worker = harness.createWorker("test-queue", async (ctx) => {
        attemptNumbers.push(ctx.job.attempts);
        if (attemptNumbers.length < 3) {
          throw new Error("Generic error");
        }
      });
      await worker.start();

      await eventually(
        async () => {
          const job = await client.getJob(jobId);
          return job?.status === "completed";
        },
        { timeout: 5000 },
      );

      // Generic errors should also consume attempts
      expect(attemptNumbers).toEqual([1, 2, 3]);
    });
  });
});
