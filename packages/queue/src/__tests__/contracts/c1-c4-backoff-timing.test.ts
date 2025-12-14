/**
 * C1-C4: Backoff and Timing Tests
 *
 * Tests that verify actual wall-clock timing behavior:
 * - C1: Fixed backoff timing - verify delay between retry attempts
 * - C2: Exponential backoff timing - verify increasing delays
 * - C3: Ready vs scheduled ordering - ready jobs processed before scheduled
 * - C4: Rate-limit reschedule timing - job respects rate-limit delay
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DB_TEST_CONFIGS,
  TEST_TIMEOUTS,
  createQueueTestDatabase,
  eventually,
  createTestLogger,
  type QueueTestDatabase,
} from "../testkit/index.js";
import {
  createDbQueueClient,
  createDbWorker,
} from "../../driver-db/index.js";
import { RetryableError, RateLimitError } from "../../core/errors.js";
import type { QueueClient, Worker } from "../../core/types.js";

describe.each(DB_TEST_CONFIGS)(
  "C1-C4: Backoff Timing ($label)",
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
    // C1: Fixed Backoff Timing
    // =========================================================================

    describe("C1: Fixed Backoff Timing", () => {
      it("should wait at least backoffMs between retry attempts", async () => {
        const backoffDelay = 100; // 100ms fixed backoff
        const attemptTimestamps: number[] = [];

        const jobId = await client.enqueue(
          "test-queue",
          { value: 42 },
          {
            attempts: 2,
            backoff: { type: "fixed", delay: backoffDelay },
          },
        );

        worker = createDbWorker(
          "test-queue",
          async () => {
            const now = Date.now();
            attemptTimestamps.push(now);

            if (attemptTimestamps.length === 1) {
              // First attempt: fail to trigger retry
              throw new RetryableError("Transient failure");
            }
            // Second attempt: succeed
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

        // Verify we had 2 attempts
        expect(attemptTimestamps.length).toBe(2);

        // Verify the gap between attempts is at least the backoff delay
        const gap = attemptTimestamps[1] - attemptTimestamps[0];
        // Allow for poll interval variance but expect at least backoffDelay
        expect(gap).toBeGreaterThanOrEqual(backoffDelay);
      });
    });

    // =========================================================================
    // C2: Exponential Backoff Timing
    // =========================================================================

    describe("C2: Exponential Backoff Timing", () => {
      it("should increase delay exponentially between retries", async () => {
        const baseDelay = 50; // 50ms base delay
        const attemptTimestamps: number[] = [];

        const jobId = await client.enqueue(
          "test-queue",
          { value: 42 },
          {
            attempts: 3,
            backoff: { type: "exponential", delay: baseDelay },
          },
        );

        worker = createDbWorker(
          "test-queue",
          async () => {
            const now = Date.now();
            attemptTimestamps.push(now);

            if (attemptTimestamps.length < 3) {
              // Fail first 2 attempts
              throw new RetryableError("Transient failure");
            }
            // Third attempt: succeed
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
        await eventually(
          async () => {
            const job = await client.getJob(jobId);
            return job?.status === "completed";
          },
          { timeout: 3000 }, // Longer timeout due to multiple retries
        );

        // Verify we had 3 attempts
        expect(attemptTimestamps.length).toBe(3);

        // Calculate gaps between attempts
        const gap1 = attemptTimestamps[1] - attemptTimestamps[0]; // After attempt 1
        const gap2 = attemptTimestamps[2] - attemptTimestamps[1]; // After attempt 2

        // Verify delays are non-decreasing (gap2 >= gap1)
        // With exponential backoff: attempt1 -> 50ms delay, attempt2 -> 100ms delay
        expect(gap1).toBeGreaterThanOrEqual(baseDelay);
        expect(gap2).toBeGreaterThanOrEqual(gap1);

        // Verify exponential growth: second gap should be approximately 2x first
        // Use lower bound assertion for flake resistance
        expect(gap2).toBeGreaterThanOrEqual(baseDelay * 2);
      });
    });

    // =========================================================================
    // C3: Ready vs Scheduled Ordering
    // =========================================================================

    describe("C3: Ready vs Scheduled Ordering", () => {
      it("should process ready jobs before scheduled jobs", async () => {
        const processedOrder: string[] = [];

        // Enqueue scheduled job FIRST (will be ready in 2 seconds)
        // NOTE: SQLite stores timestamps as seconds, so we need >1 second delay
        // to reliably test scheduling behavior
        const scheduledJobId = await client.enqueue(
          "test-queue",
          { type: "scheduled" },
          { delay: 2000 },
        );

        // Enqueue ready job SECOND
        const readyJobId = await client.enqueue(
          "test-queue",
          { type: "ready" },
        );

        worker = createDbWorker(
          "test-queue",
          async (ctx) => {
            processedOrder.push((ctx.job.data as { type: string }).type);
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

        // Wait for both jobs to complete
        await eventually(
          async () => {
            const readyJob = await client.getJob(readyJobId);
            const scheduledJob = await client.getJob(scheduledJobId);
            return (
              readyJob?.status === "completed" &&
              scheduledJob?.status === "completed"
            );
          },
          { timeout: 5000 },
        );

        // Ready job should be processed first despite being enqueued second
        expect(processedOrder[0]).toBe("ready");
        expect(processedOrder[1]).toBe("scheduled");
      });
    });

    // =========================================================================
    // C4: Rate-Limit Reschedule Timing
    // =========================================================================

    describe("C4: Rate-Limit Reschedule Timing", () => {
      it("should not claim job before rate-limit delay expires", async () => {
        // NOTE: SQLite stores timestamps as seconds, so we need >1 second delay
        // to reliably test scheduling behavior
        const rateLimitDelay = 1500; // 1.5 seconds
        const attemptTimestamps: number[] = [];

        const jobId = await client.enqueue(
          "test-queue",
          { value: 42 },
          { attempts: 2 },
        );

        worker = createDbWorker(
          "test-queue",
          async () => {
            const now = Date.now();
            attemptTimestamps.push(now);

            if (attemptTimestamps.length === 1) {
              // First attempt: rate limited
              throw new RateLimitError(rateLimitDelay);
            }
            // Second attempt: succeed
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
        await eventually(
          async () => {
            const job = await client.getJob(jobId);
            return job?.status === "completed";
          },
          { timeout: 5000 },
        );

        // Verify we had 2 attempts
        expect(attemptTimestamps.length).toBe(2);

        // Verify the gap between attempts respects the rate-limit delay
        // Allow some tolerance for second-level granularity in SQLite
        const gap = attemptTimestamps[1] - attemptTimestamps[0];
        expect(gap).toBeGreaterThanOrEqual(rateLimitDelay - 1000); // Allow 1 second tolerance for rounding
      });
    });
  },
);
