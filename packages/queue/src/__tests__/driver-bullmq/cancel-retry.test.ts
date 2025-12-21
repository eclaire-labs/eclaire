/**
 * A11: BullMQ Cancel and Retry Tests
 *
 * Tests job cancellation and manual retry functionality.
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

describe("BullMQ: Cancel and Retry", () => {
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

  describe("Cancel", () => {
    it("should cancel a pending job", async () => {
      const jobId = await client.enqueue("test-queue", { value: 1 });

      const cancelled = await client.cancel(jobId);
      expect(cancelled).toBe(true);

      // After cancellation, job should either:
      // - Be removed (returns null)
      // - Or be in a terminal state (failed/completed) and not processable
      const job = await client.getJob(jobId);
      if (job !== null) {
        // If job still exists, it should be in a terminal state
        expect(["failed", "completed"]).toContain(job.status);
      }
    });

    it("should return false when cancelling non-existent job", async () => {
      const cancelled = await client.cancel("non-existent-id");
      expect(cancelled).toBe(false);
    });

    it("should not cancel a job that is being processed", async () => {
      const deferred = createDeferred<void>();

      const jobId = await client.enqueue("test-queue", { value: 1 });

      worker = harness.createWorker("test-queue", async () => {
        // Signal that we're processing
        setTimeout(() => deferred.resolve(), 10);
        // Block until test is done
        await new Promise((resolve) => setTimeout(resolve, 2000));
      });

      await worker.start();

      // Wait for processing to start
      await deferred.promise;

      // Try to cancel - should fail since job is active
      const cancelled = await client.cancel(jobId);
      expect(cancelled).toBe(false);
    });
  });

  describe("Retry", () => {
    it("should retry a failed job", async () => {
      let attemptCount = 0;

      const jobId = await client.enqueue(
        "test-queue",
        { value: 1 },
        { attempts: 1 }, // Only 1 attempt so it fails permanently
      );

      worker = harness.createWorker("test-queue", async () => {
        attemptCount++;
        throw new PermanentError("Intentional failure");
      });

      await worker.start();

      // Wait for job to fail
      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "failed";
      });

      expect(attemptCount).toBe(1);

      // Retry the failed job
      const retried = await client.retry(jobId);
      expect(retried).toBe(true);

      // Wait for job to fail again (since we still throw error)
      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "failed" && attemptCount === 2;
      });

      expect(attemptCount).toBe(2);
    });

    it("should return false when retrying non-existent job", async () => {
      const retried = await client.retry("non-existent-id");
      expect(retried).toBe(false);
    });

    it("should return false when retrying pending job", async () => {
      const jobId = await client.enqueue("test-queue", { value: 1 });

      // Try to retry a pending job
      const retried = await client.retry(jobId);
      expect(retried).toBe(false);
    });
  });
});
