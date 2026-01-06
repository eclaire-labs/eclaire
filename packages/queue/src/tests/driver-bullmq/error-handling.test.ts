/**
 * BullMQ Error Handling Tests
 *
 * Tests RetryableError, PermanentError, and RateLimitError behavior.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PermanentError,
  RateLimitError,
  RetryableError,
} from "../../core/errors.js";
import type { QueueClient, Worker } from "../../core/types.js";
import {
  createBullMQTestHarness,
  eventually,
  type QueueTestHarness,
} from "../testkit/index.js";

describe("BullMQ: Error Handling", () => {
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

  describe("RetryableError", () => {
    it("should retry job when RetryableError is thrown", async () => {
      let attemptCount = 0;

      const jobId = await client.enqueue(
        "test-queue",
        { value: 1 },
        { attempts: 3 },
      );

      worker = harness.createWorker("test-queue", async () => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new RetryableError("Transient failure");
        }
        // Success on second attempt
      });

      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      expect(attemptCount).toBe(2);
      const job = await client.getJob(jobId);
      expect(job?.status).toBe("completed");
    });

    it("should fail job when RetryableError exhausts all retries", async () => {
      let attemptCount = 0;

      const jobId = await client.enqueue(
        "test-queue",
        { value: 1 },
        { attempts: 2 },
      );

      worker = harness.createWorker("test-queue", async () => {
        attemptCount++;
        throw new RetryableError("Always fails");
      });

      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "failed";
      });

      expect(attemptCount).toBe(2);
      const job = await client.getJob(jobId);
      expect(job?.status).toBe("failed");
    });
  });

  describe("PermanentError", () => {
    it("should fail job immediately when PermanentError is thrown", async () => {
      let attemptCount = 0;

      const jobId = await client.enqueue(
        "test-queue",
        { value: 1 },
        { attempts: 5 }, // Many attempts allowed
      );

      worker = harness.createWorker("test-queue", async () => {
        attemptCount++;
        throw new PermanentError("Invalid data - do not retry");
      });

      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "failed";
      });

      // Should only try once despite having 5 attempts
      expect(attemptCount).toBe(1);
      const job = await client.getJob(jobId);
      expect(job?.status).toBe("failed");
    });
  });

  describe("RateLimitError", () => {
    it("should reschedule job without consuming attempt when RateLimitError is thrown", async () => {
      let attemptCount = 0;
      const rateLimitDelay = 200; // 200ms

      const jobId = await client.enqueue(
        "test-queue",
        { value: 1 },
        { attempts: 2 },
      );

      worker = harness.createWorker("test-queue", async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new RateLimitError(rateLimitDelay);
        }
        // Success on retry
      });

      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      // Both runs should succeed: rate limit doesn't count as attempt
      expect(attemptCount).toBe(2);
      const job = await client.getJob(jobId);
      expect(job?.status).toBe("completed");
    });

    it("should delay job processing by rate limit duration", async () => {
      const startTime = Date.now();
      let processedAt = 0;
      const rateLimitDelay = 150;

      const jobId = await client.enqueue("test-queue", { value: 1 });

      let firstRun = true;
      worker = harness.createWorker("test-queue", async () => {
        if (firstRun) {
          firstRun = false;
          throw new RateLimitError(rateLimitDelay);
        }
        processedAt = Date.now();
      });

      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      // Should have waited at least the rate limit duration
      const elapsed = processedAt - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(rateLimitDelay - 50); // Allow some tolerance
    });
  });

  describe("Generic errors", () => {
    it("should treat unrecognized errors as retryable", async () => {
      let attemptCount = 0;

      const jobId = await client.enqueue(
        "test-queue",
        { value: 1 },
        { attempts: 3 },
      );

      worker = harness.createWorker("test-queue", async () => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error("Generic error");
        }
      });

      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      expect(attemptCount).toBe(2);
    });
  });
});
