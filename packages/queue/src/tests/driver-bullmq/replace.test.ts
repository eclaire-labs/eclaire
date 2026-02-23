/**
 * BullMQ Replace Tests
 *
 * Tests the `replace: 'if_not_active'` option for enqueue.
 * Verifies JobAlreadyActiveError is thrown when replacing active jobs.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JobAlreadyActiveError, PermanentError } from "../../core/errors.js";
import type { QueueClient, Worker } from "../../core/types.js";
import {
  createBullMQTestHarness,
  createDeferred,
  eventually,
  type QueueTestHarness,
} from "../testkit/index.js";

describe("BullMQ: Replace Semantics", () => {
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

  describe("replace: 'if_not_active'", () => {
    it("should create job when no existing job with key", async () => {
      const jobId = await client.enqueue(
        "test-queue",
        { value: 1 },
        { key: "unique-key", replace: "if_not_active" },
      );

      expect(jobId).toBeDefined();

      const job = await client.getJob(jobId);
      expect(job).not.toBeNull();
      expect(job?.data).toEqual({ value: 1 });
      expect(job?.status).toBe("pending");
    });

    it("should replace pending (waiting) job with new data", async () => {
      // Create initial job
      const _jobId1 = await client.enqueue(
        "test-queue",
        { value: 1 },
        { key: "replace-key" },
      );

      // Replace with new data
      const jobId2 = await client.enqueue(
        "test-queue",
        { value: 2 },
        { key: "replace-key", replace: "if_not_active" },
      );

      // BullMQ removes and recreates, so ID should be the same (key is used as ID)
      expect(jobId2).toBe("replace-key");

      const job = await client.getJob(jobId2);
      expect(job).not.toBeNull();
      expect(job?.data).toEqual({ value: 2 });
    });

    it("should replace delayed job with new data", async () => {
      // Create delayed job
      await client.enqueue(
        "test-queue",
        { value: 1 },
        { key: "delayed-key", delay: 60000 }, // 1 minute delay
      );

      // Verify it's delayed
      const initialJob = await client.getJob("delayed-key");
      expect(initialJob?.status).toBe("pending");

      // Replace with new data
      const jobId2 = await client.enqueue(
        "test-queue",
        { value: 2 },
        { key: "delayed-key", replace: "if_not_active" },
      );

      const job = await client.getJob(jobId2);
      expect(job?.data).toEqual({ value: 2 });
    });

    it("should replace completed job (creates fresh job)", async () => {
      const processedData: unknown[] = [];

      // Create and process a job
      const jobId1 = await client.enqueue(
        "test-queue",
        { value: 1 },
        { key: "complete-key" },
      );

      worker = harness.createWorker("test-queue", async (ctx) => {
        processedData.push(ctx.job.data);
      });
      await worker.start();

      // Wait for completion
      await eventually(async () => {
        const job = await client.getJob(jobId1);
        return job?.status === "completed";
      });

      // Replace completed job
      const jobId2 = await client.enqueue(
        "test-queue",
        { value: 2 },
        { key: "complete-key", replace: "if_not_active" },
      );

      // Wait for new job to process
      await eventually(async () => {
        const job = await client.getJob(jobId2);
        return job?.status === "completed";
      });

      // Both values should have been processed
      expect(processedData).toContainEqual({ value: 1 });
      expect(processedData).toContainEqual({ value: 2 });
    });

    it("should replace failed job (creates fresh job)", async () => {
      let attemptCount = 0;

      // Create job that will fail
      const jobId1 = await client.enqueue(
        "test-queue",
        { value: 1 },
        { key: "fail-key", attempts: 1 },
      );

      worker = harness.createWorker("test-queue", async (ctx) => {
        attemptCount++;
        if ((ctx.job.data as { value: number }).value === 1) {
          throw new PermanentError("Intentional failure");
        }
        // Second value succeeds
      });
      await worker.start();

      // Wait for failure
      await eventually(async () => {
        const job = await client.getJob(jobId1);
        return job?.status === "failed";
      });

      expect(attemptCount).toBe(1);

      // Replace failed job with new data
      const jobId2 = await client.enqueue(
        "test-queue",
        { value: 2 },
        { key: "fail-key", replace: "if_not_active" },
      );

      // Wait for new job to complete
      await eventually(async () => {
        const job = await client.getJob(jobId2);
        return job?.status === "completed";
      });

      expect(attemptCount).toBe(2);
    });

    it("should throw JobAlreadyActiveError when job is processing", async () => {
      const processingStarted = createDeferred<void>();
      const canFinishProcessing = createDeferred<void>();

      // Create a job
      await client.enqueue("test-queue", { value: 1 }, { key: "active-key" });

      worker = harness.createWorker("test-queue", async () => {
        // Signal that processing has started
        processingStarted.resolve();
        // Wait for test to complete before finishing
        await canFinishProcessing.promise;
      });
      await worker.start();

      // Wait for job to start processing
      await processingStarted.promise;

      // Verify job is active
      await eventually(async () => {
        const job = await client.getJob("active-key");
        return job?.status === "processing";
      });

      // Try to replace the active job
      await expect(
        client.enqueue(
          "test-queue",
          { value: 2 },
          { key: "active-key", replace: "if_not_active" },
        ),
      ).rejects.toThrow(JobAlreadyActiveError);

      // Let the worker finish
      canFinishProcessing.resolve();
    });

    it("should preserve job key in returned job", async () => {
      const jobId = await client.enqueue(
        "test-queue",
        { value: 1 },
        { key: "my-custom-key", replace: "if_not_active" },
      );

      expect(jobId).toBe("my-custom-key");

      const job = await client.getJob("my-custom-key");
      expect(job).not.toBeNull();
      expect(job?.key).toBe("my-custom-key");
    });
  });

  describe("default behavior (without replace option)", () => {
    it("should return existing job ID when job with same key exists", async () => {
      // Create initial job
      const jobId1 = await client.enqueue(
        "test-queue",
        { value: 1 },
        { key: "default-key" },
      );

      // BullMQ's default behavior is idempotent - adding a job with
      // the same jobId returns the existing job's ID without error
      // (unlike with replace: 'if_not_active' which removes and recreates)
      const jobId2 = await client.enqueue(
        "test-queue",
        { value: 2 },
        { key: "default-key" }, // No replace option
      );

      // Same ID returned (existing job)
      expect(jobId2).toBe(jobId1);

      // Data should NOT be updated (original data preserved)
      const job = await client.getJob(jobId1);
      expect(job?.data).toEqual({ value: 1 }); // Original data, not { value: 2 }
    });
  });
});
