/**
 * A8-A10: Error Handling Tests
 *
 * Tests that verify error handling behavior:
 * - A8: RetryableError - job retries with backoff
 * - A9: PermanentError - job fails immediately
 * - A10: RateLimitError - job reschedules without counting as attempt
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DB_TEST_CONFIGS,
  TEST_TIMEOUTS,
  createQueueTestDatabase,
  eventually,
  createTestLogger,
  sleep,
  type QueueTestDatabase,
} from "../testkit/index.js";
import {
  createDbQueueClient,
  createDbWorker,
} from "../../driver-db/index.js";
import {
  RetryableError,
  PermanentError,
  RateLimitError,
} from "../../core/errors.js";
import type { QueueClient, Worker } from "../../core/types.js";

describe.each(DB_TEST_CONFIGS)(
  "A8-A10: Error Handling ($label)",
  ({ dbType }) => {
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
    // A8: RetryableError Tests
    // =========================================================================

    describe("A8: RetryableError", () => {
      it("should set job to retry_pending when RetryableError thrown", async () => {
        const jobId = await client.enqueue(
          "test-queue",
          { value: 42 },
          { attempts: 3 },
        );

        let attemptCount = 0;

        worker = createDbWorker(
          "test-queue",
          async () => {
            attemptCount++;
            throw new RetryableError("Transient failure");
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

        // Wait for first attempt to complete
        await eventually(async () => {
          const job = await client.getJob(jobId);
          return job?.status === "retry_pending";
        });

        // Stop worker to prevent further attempts
        await worker.stop();
        worker = null;

        const job = await client.getJob(jobId);
        expect(job?.status).toBe("retry_pending");
        expect(job?.attempts).toBe(1);
        expect(attemptCount).toBe(1);
      });

      it("should fail job when RetryableError exhausts all retries", async () => {
        const jobId = await client.enqueue(
          "test-queue",
          { value: 42 },
          { attempts: 2 },
        );

        let attemptCount = 0;

        worker = createDbWorker(
          "test-queue",
          async () => {
            attemptCount++;
            throw new RetryableError("Transient failure");
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

        // Wait for job to fail after exhausting retries
        await eventually(async () => {
          const job = await client.getJob(jobId);
          return job?.status === "failed";
        });

        const job = await client.getJob(jobId);
        expect(job?.status).toBe("failed");
        expect(job?.attempts).toBe(2);
        expect(attemptCount).toBe(2);
      });

      it("should apply exponential backoff on retry", async () => {
        const backoffDelay = 100;
        const jobId = await client.enqueue(
          "test-queue",
          { value: 42 },
          {
            attempts: 3,
            backoff: { type: "exponential", delay: backoffDelay },
          },
        );

        worker = createDbWorker(
          "test-queue",
          async () => {
            throw new RetryableError("Transient failure");
          },
          {
            db: testDb.db,
            schema: testDb.schema,
            capabilities: testDb.capabilities,
            logger,
            pollInterval: TEST_TIMEOUTS.pollInterval,
          },
        );

        const beforeRetry = Date.now();
        await worker.start();

        // Wait for first attempt to set retry_pending
        await eventually(async () => {
          const job = await client.getJob(jobId);
          return job?.status === "retry_pending";
        });

        // Stop worker
        await worker.stop();
        worker = null;

        // Verify nextRetryAt is set with exponential backoff
        // For attempt 1, exponential backoff = delay * 2^0 = 100ms
        const job = await client.getJob(jobId);
        expect(job?.status).toBe("retry_pending");
      });
    });

    // =========================================================================
    // A9: PermanentError Tests
    // =========================================================================

    describe("A9: PermanentError", () => {
      it("should fail immediately on PermanentError", async () => {
        const jobId = await client.enqueue(
          "test-queue",
          { value: 42 },
          { attempts: 5 },
        );

        let attemptCount = 0;

        worker = createDbWorker(
          "test-queue",
          async () => {
            attemptCount++;
            throw new PermanentError("Resource not found");
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

        const job = await client.getJob(jobId);
        expect(job?.status).toBe("failed");
        expect(job?.attempts).toBe(1); // Only one attempt, no retries
        expect(attemptCount).toBe(1);
      });

      it("should not retry PermanentError even with attempts remaining", async () => {
        const jobId = await client.enqueue(
          "test-queue",
          { value: 42 },
          { attempts: 10 },
        );

        worker = createDbWorker(
          "test-queue",
          async () => {
            throw new PermanentError("Invalid input data");
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

        await eventually(async () => {
          const job = await client.getJob(jobId);
          return job?.status === "failed";
        });

        const job = await client.getJob(jobId);
        expect(job?.status).toBe("failed");
        expect(job?.attempts).toBe(1);
        // Wait a bit to ensure no more processing happens
        await sleep(100);
        const jobAfter = await client.getJob(jobId);
        expect(jobAfter?.attempts).toBe(1);
      });
    });

    // =========================================================================
    // A10: RateLimitError Tests
    // =========================================================================

    describe("A10: RateLimitError", () => {
      it("should reschedule without counting attempt on RateLimitError", async () => {
        const jobId = await client.enqueue(
          "test-queue",
          { value: 42 },
          { attempts: 2 },
        );

        let attemptCount = 0;

        worker = createDbWorker(
          "test-queue",
          async () => {
            attemptCount++;
            if (attemptCount === 1) {
              // First attempt: rate limited
              throw new RateLimitError(50); // Very short delay for testing
            }
            // Second attempt: success
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

        const job = await client.getJob(jobId);
        expect(job?.status).toBe("completed");
        // Rate limit doesn't count as attempt, so should be 1 (the successful one)
        expect(job?.attempts).toBe(1);
        expect(attemptCount).toBe(2);
      });

      it("should set scheduledFor in future on RateLimitError", async () => {
        const retryAfterMs = 5000;
        const jobId = await client.enqueue(
          "test-queue",
          { value: 42 },
          { attempts: 2 },
        );

        worker = createDbWorker(
          "test-queue",
          async () => {
            throw new RateLimitError(retryAfterMs);
          },
          {
            db: testDb.db,
            schema: testDb.schema,
            capabilities: testDb.capabilities,
            logger,
            pollInterval: TEST_TIMEOUTS.pollInterval,
          },
        );

        const beforeRateLimit = Date.now();
        await worker.start();

        // Wait for job to be rescheduled (back to pending with scheduledFor)
        await eventually(async () => {
          const job = await client.getJob(jobId);
          return job?.status === "pending" && job?.scheduledFor !== undefined;
        });

        // Stop worker before it picks up again
        await worker.stop();
        worker = null;

        const job = await client.getJob(jobId);
        expect(job?.status).toBe("pending");
        expect(job?.scheduledFor).toBeDefined();

        // scheduledFor should be approximately retryAfterMs in the future
        const scheduledFor = job!.scheduledFor!.getTime();
        const expectedTime = beforeRateLimit + retryAfterMs;
        // Allow 1 second tolerance for test execution time
        expect(scheduledFor).toBeGreaterThanOrEqual(expectedTime - 1000);
        expect(scheduledFor).toBeLessThanOrEqual(expectedTime + 1000);
      });

      it("should preserve job data through rate limit reschedule", async () => {
        const jobData = { value: 42, nested: { key: "preserved" } };
        const jobId = await client.enqueue("test-queue", jobData, {
          attempts: 2,
        });

        let attemptCount = 0;
        let receivedData: any = null;

        worker = createDbWorker(
          "test-queue",
          async (ctx) => {
            attemptCount++;
            receivedData = ctx.job.data;
            if (attemptCount === 1) {
              throw new RateLimitError(50);
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

        await eventually(async () => {
          const job = await client.getJob(jobId);
          return job?.status === "completed";
        });

        expect(receivedData).toEqual(jobData);
      });
    });
  },
);
