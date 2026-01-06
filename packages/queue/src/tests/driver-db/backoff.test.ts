/**
 * C1-C4: Backoff and Timing Tests
 *
 * Tests that verify actual wall-clock timing behavior:
 * - C1: Fixed backoff timing - verify delay between retry attempts
 * - C2: Exponential backoff timing - verify increasing delays
 * - C3: Ready vs scheduled ordering - ready jobs processed before scheduled
 * - C4: Rate-limit reschedule timing - job respects rate-limit delay
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RateLimitError, RetryableError } from "../../core/errors.js";
import type { QueueClient, Worker } from "../../core/types.js";
import { createDbQueueClient, createDbWorker } from "../../driver-db/index.js";
import {
  createQueueTestDatabase,
  createTestLogger,
  DB_TEST_CONFIGS,
  eventually,
  type QueueTestDatabase,
  TEST_TIMEOUTS,
} from "../testkit/index.js";

describe.each(DB_TEST_CONFIGS)("C1-C4: Backoff Timing ($label)", ({
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
  // C1: Fixed Backoff Timing
  // =========================================================================

  describe("C1: Fixed Backoff Timing", () => {
    it("should wait at least backoffMs between retry attempts", async () => {
      const backoffDelay = 200; // 200ms fixed backoff
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
      // Allow 50ms tolerance for poll interval variance
      expect(gap).toBeGreaterThanOrEqual(backoffDelay - 50);
    });
  });

  // =========================================================================
  // C2: Exponential Backoff Timing
  // =========================================================================

  describe("C2: Exponential Backoff Timing", () => {
    it("should increase delay exponentially between retries", async () => {
      const baseDelay = 150; // 150ms base delay
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
      // With exponential backoff: attempt1 -> 150ms delay, attempt2 -> 300ms delay
      // Allow 50ms tolerance for poll interval variance
      expect(gap1).toBeGreaterThanOrEqual(baseDelay - 50);
      expect(gap2).toBeGreaterThanOrEqual(gap1);

      // Verify exponential growth: second gap should be approximately 2x first
      expect(gap2).toBeGreaterThanOrEqual(baseDelay * 2 - 50);
    });
  });

  // =========================================================================
  // C3: Ready vs Scheduled Ordering
  // =========================================================================

  describe("C3: Ready vs Scheduled Ordering", () => {
    it("should process ready jobs before scheduled jobs", async () => {
      const processedOrder: string[] = [];

      // Enqueue scheduled job FIRST (will be ready in 500ms)
      const scheduledJobId = await client.enqueue(
        "test-queue",
        { type: "scheduled" },
        { delay: 500 },
      );

      // Enqueue ready job SECOND
      const readyJobId = await client.enqueue("test-queue", { type: "ready" });

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
        { timeout: 2000 },
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
      const rateLimitDelay = 500; // 500ms
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
        { timeout: 2000 },
      );

      // Verify we had 2 attempts
      expect(attemptTimestamps.length).toBe(2);

      // Verify the gap between attempts respects the rate-limit delay
      const gap = attemptTimestamps[1] - attemptTimestamps[0];
      // Allow 100ms tolerance for poll interval variance
      expect(gap).toBeGreaterThanOrEqual(rateLimitDelay - 100);
    });
  });
});
