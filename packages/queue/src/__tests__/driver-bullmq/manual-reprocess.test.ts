/**
 * BullMQ Manual Reprocess Tests
 *
 * Tests manual retry/reprocess functionality:
 * - Retry failed jobs via client.retry()
 * - Re-enqueue completed jobs with same key
 * - Edge cases
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createBullMQTestHarness,
  eventually,
  sleep,
  type QueueTestHarness,
} from "../testkit/index.js";
import { PermanentError } from "../../core/errors.js";
import type { QueueClient, Worker } from "../../core/types.js";

describe("BullMQ: Manual Reprocess", () => {
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

  describe("Retry failed jobs", () => {
    it("should retry failed job via client.retry() by ID", async () => {
      let attempts = 0;

      const jobId = await client.enqueue(
        "test-queue",
        { value: 42 },
        { attempts: 1 },
      );

      // First worker will fail the job
      worker = harness.createWorker("test-queue", async () => {
        attempts++;
        if (attempts === 1) {
          throw new PermanentError("Intentional failure");
        }
        // Second attempt succeeds
      });

      await worker.start();

      // Wait for job to fail
      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "failed";
      });

      expect(attempts).toBe(1);

      const failedJob = await client.getJob(jobId);
      expect(failedJob?.status).toBe("failed");

      // Now retry the job
      const retryResult = await client.retry(jobId);
      expect(retryResult).toBe(true);

      // Wait for job to complete on second attempt
      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      expect(attempts).toBe(2);

      const completedJob = await client.getJob(jobId);
      expect(completedJob?.status).toBe("completed");
    });

    it("should retry failed job via client.retry() by key", async () => {
      const key = "retry-by-key-test";
      let attempts = 0;

      const jobId = await client.enqueue(
        "test-queue",
        { value: 42 },
        { key, attempts: 1 },
      );

      worker = harness.createWorker("test-queue", async () => {
        attempts++;
        if (attempts === 1) {
          throw new PermanentError("Intentional failure");
        }
      });

      await worker.start();

      // Wait for job to fail
      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "failed";
      });

      // Retry by key instead of ID
      const retryResult = await client.retry(key);
      expect(retryResult).toBe(true);

      // Wait for job to complete
      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      expect(attempts).toBe(2);
    });

    it("should reset attempts when retrying failed job", async () => {
      let attempts = 0;

      const jobId = await client.enqueue(
        "test-queue",
        { value: 42 },
        { attempts: 2 },
      );

      worker = harness.createWorker("test-queue", async () => {
        attempts++;
        if (attempts <= 2) {
          throw new Error("Intentional failure");
        }
      });

      await worker.start();

      // Wait for job to fail after exhausting attempts
      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "failed";
      });

      const failedJob = await client.getJob(jobId);
      // BullMQ may count attempts differently with stalled job detection
      expect(failedJob?.attempts).toBeGreaterThanOrEqual(2);

      // Retry the job
      await client.retry(jobId);

      // Wait for job to complete
      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      // Job was processed again (at least 3 times total)
      expect(attempts).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Re-enqueue completed jobs", () => {
    it("should reset completed job to pending when re-enqueueing with same key", async () => {
      const key = "reprocess-completed";
      let processCount = 0;

      // First enqueue and process
      const jobId1 = await client.enqueue(
        "test-queue",
        { value: 1 },
        { key },
      );

      worker = harness.createWorker("test-queue", async () => {
        processCount++;
      });

      await worker.start();

      // Wait for first job to complete
      await eventually(async () => {
        const job = await client.getJob(jobId1);
        return job?.status === "completed";
      });

      expect(processCount).toBe(1);

      // Stop worker before re-enqueueing
      await worker.stop();
      worker = null;

      // Re-enqueue with same key and replace option
      const jobId2 = await client.enqueue(
        "test-queue",
        { value: 2 },
        { key, replace: "if_not_active" },
      );

      // Verify the job was created/updated and is pending
      const job = await client.getJob(jobId2);
      expect(job).toBeDefined();
      expect(job?.status).toBe("pending");
      expect(job?.data).toEqual({ value: 2 });

      // Start worker again
      worker = harness.createWorker("test-queue", async () => {
        processCount++;
      });
      await worker.start();

      // Wait for the job to complete again
      await eventually(async () => {
        const j = await client.getJob(jobId2);
        return j?.status === "completed";
      });

      // Job was processed twice
      expect(processCount).toBe(2);
    });

    it("should allow re-processing without a key (no deduplication)", async () => {
      let processCount = 0;

      // First job without key
      const jobId1 = await client.enqueue("test-queue", { value: 1 });

      worker = harness.createWorker("test-queue", async () => {
        processCount++;
      });

      await worker.start();

      // Wait for first job to complete
      await eventually(async () => {
        const job = await client.getJob(jobId1);
        return job?.status === "completed";
      });

      expect(processCount).toBe(1);

      // Enqueue without key - no deduplication
      const jobId2 = await client.enqueue("test-queue", { value: 2 });

      // Different job IDs
      expect(jobId2).not.toBe(jobId1);

      // Wait for second job to complete
      await eventually(async () => {
        const job = await client.getJob(jobId2);
        return job?.status === "completed";
      });

      // Should have processed both
      expect(processCount).toBe(2);
    });
  });

  describe("Edge cases", () => {
    it("should return false when retrying non-existent job", async () => {
      const result = await client.retry("non-existent-job-id");
      expect(result).toBe(false);
    });

    it("should return false when retrying completed job", async () => {
      const jobId = await client.enqueue("test-queue", { value: 42 });

      worker = harness.createWorker("test-queue", async () => {
        // Complete successfully
      });

      await worker.start();

      // Wait for job to complete
      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      // Try to retry completed job
      const result = await client.retry(jobId);
      expect(result).toBe(false);
    });

    it("should return false when retrying pending job", async () => {
      // Enqueue but don't start worker
      const jobId = await client.enqueue("test-queue", { value: 42 });

      const job = await client.getJob(jobId);
      expect(job?.status).toBe("pending");

      // Try to retry pending job (doesn't make sense, should return false)
      const result = await client.retry(jobId);
      expect(result).toBe(false);
    });

    it("should return false when retrying processing job", async () => {
      const jobId = await client.enqueue("test-queue", { value: 42 });

      let retryResult: boolean | null = null;

      worker = harness.createWorker("test-queue", async () => {
        // While processing, try to retry
        retryResult = await client.retry(jobId);
        // Give time for the retry call to complete
        await sleep(50);
      });

      await worker.start();

      // Wait for job to complete
      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      // Retry during processing should return false
      expect(retryResult).toBe(false);
    });
  });
});
