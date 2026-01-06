/**
 * A12: Manual Reprocess Primitive
 *
 * Tests that verify the ability to manually retry/reprocess jobs:
 * - Retry failed jobs via client.retry()
 * - Re-enqueue completed jobs with same key
 * - Edge cases (non-existent jobs, processing jobs)
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PermanentError } from "../../core/errors.js";
import type { QueueClient, Worker } from "../../core/types.js";
import { createDbQueueClient, createDbWorker } from "../../driver-db/index.js";
import {
  createQueueTestDatabase,
  createTestLogger,
  DB_TEST_CONFIGS,
  eventually,
  type QueueTestDatabase,
  sleep,
  TEST_TIMEOUTS,
} from "../testkit/index.js";

describe.each(DB_TEST_CONFIGS)("A12: Manual Reprocess ($label)", ({
  dbType,
}) => {
  let testDb: QueueTestDatabase;
  let client: QueueClient;
  let worker: Worker | null = null;
  const logger = createTestLogger();

  beforeEach(async () => {
    testDb = await createQueueTestDatabase(dbType);

    client = createDbQueueClient({
      db: testDb.db,
      schema: testDb.schema,
      capabilities: testDb.capabilities,
      logger,
    });
  });

  afterEach(async () => {
    if (worker) {
      await worker.stop();
      worker = null;
    }
    await client.close();
    await testDb.cleanup();
  });

  // =========================================================================
  // Retry Failed Jobs
  // =========================================================================

  describe("Retry failed jobs", () => {
    it("should retry failed job via client.retry() by ID", async () => {
      let attempts = 0;

      const jobId = await client.enqueue(
        "test-queue",
        { value: 42 },
        { attempts: 1 },
      );

      // First worker will fail the job
      worker = createDbWorker(
        "test-queue",
        async () => {
          attempts++;
          if (attempts === 1) {
            throw new PermanentError("Intentional failure");
          }
          // Second attempt succeeds
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
        },
      );

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

      worker = createDbWorker(
        "test-queue",
        async () => {
          attempts++;
          if (attempts === 1) {
            throw new PermanentError("Intentional failure");
          }
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
        },
      );

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

      worker = createDbWorker(
        "test-queue",
        async () => {
          attempts++;
          if (attempts <= 2) {
            throw new Error("Intentional failure");
          }
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
        },
      );

      await worker.start();

      // Wait for job to fail after exhausting attempts
      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "failed";
      });

      const failedJob = await client.getJob(jobId);
      expect(failedJob?.attempts).toBe(2);

      // Retry the job
      await client.retry(jobId);

      // Wait for job to complete (now on attempt 3)
      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      // Job should have been processed again
      expect(attempts).toBe(3);
    });
  });

  // =========================================================================
  // Re-enqueue Completed Jobs
  // =========================================================================

  describe("Re-enqueue completed jobs", () => {
    /**
     * Re-enqueueing with the same key on a completed job:
     * - Updates the existing job (resets to pending) via onConflictDoUpdate
     * - Returns the SAME job ID (the existing one, not a new one)
     */

    it("should reset completed job to pending when re-enqueueing with same key", async () => {
      const key = "reprocess-completed";
      let processCount = 0;

      // First enqueue and process
      const jobId1 = await client.enqueue("test-queue", { value: 1 }, { key });

      worker = createDbWorker(
        "test-queue",
        async () => {
          processCount++;
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
        },
      );

      await worker.start();

      // Wait for first job to complete
      await eventually(async () => {
        const job = await client.getJob(jobId1);
        return job?.status === "completed";
      });

      expect(processCount).toBe(1);

      // Re-enqueue with same key - this updates the existing job
      const jobId2 = await client.enqueue("test-queue", { value: 2 }, { key });

      // Returns the SAME job ID (upsert returns actual ID via RETURNING)
      expect(jobId2).toBe(jobId1);

      // Verify the job was updated
      const job = await client.getJob(jobId2);
      expect(job).toBeDefined();
      expect(job?.id).toBe(jobId1);
      expect(job?.status).toBe("pending"); // Reset to pending
      expect(job?.data).toEqual({ value: 2 }); // Updated data

      // Wait for the job to complete again
      await eventually(async () => {
        const j = await client.getJob(jobId2);
        return j?.status === "completed";
      });

      // Job was processed twice (once for original, once for re-enqueue)
      expect(processCount).toBe(2);
    });

    it("should allow re-processing with a different key", async () => {
      let processCount = 0;

      // First job with key1
      const jobId1 = await client.enqueue(
        "test-queue",
        { value: 1 },
        { key: "key-v1" },
      );

      worker = createDbWorker(
        "test-queue",
        async () => {
          processCount++;
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
        },
      );

      await worker.start();

      // Wait for first job to complete
      await eventually(async () => {
        const job = await client.getJob(jobId1);
        return job?.status === "completed";
      });

      expect(processCount).toBe(1);

      // Enqueue with different key - creates new job
      const jobId2 = await client.enqueue(
        "test-queue",
        { value: 2 },
        { key: "key-v2" },
      );

      // Different key = different job
      expect(jobId2).not.toBe(jobId1);

      // Wait for second job to complete
      await eventually(async () => {
        const job = await client.getJob(jobId2);
        return job?.status === "completed";
      });

      // Should have processed both
      expect(processCount).toBe(2);
    });

    it("should allow re-processing without a key (no deduplication)", async () => {
      let processCount = 0;

      // First job without key
      const jobId1 = await client.enqueue("test-queue", { value: 1 });

      worker = createDbWorker(
        "test-queue",
        async () => {
          processCount++;
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
        },
      );

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

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe("Edge cases", () => {
    it("should return false when retrying non-existent job", async () => {
      const result = await client.retry("non-existent-job-id");
      expect(result).toBe(false);
    });

    it("should return false when retrying completed job", async () => {
      const jobId = await client.enqueue("test-queue", { value: 42 });

      worker = createDbWorker(
        "test-queue",
        async () => {
          // Complete successfully
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
        },
      );

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

      worker = createDbWorker(
        "test-queue",
        async () => {
          // While processing, try to retry
          retryResult = await client.retry(jobId);
          // Give time for the retry call to complete
          await sleep(50);
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
        },
      );

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
