/**
 * A4, A5, A6, A7: Timing and Lease Tests
 *
 * Tests that verify timing-related behavior:
 * - A4: Priority ordering
 * - A5: Scheduled/delayed jobs
 * - A6: Lease expiration and stale job recovery
 * - A7: Heartbeat/lock extension
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

describe.each(DB_TEST_CONFIGS)("A4, A5, A6, A7: Timing and Lease ($label)", ({
  dbType,
}) => {
  let testDb: QueueTestDatabase;
  let client: QueueClient;
  let worker: Worker | null = null;
  let worker2: Worker | null = null;
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
    if (worker2) {
      await worker2.stop();
      worker2 = null;
    }
    await client.close();
    await testDb.cleanup();
  });

  // =========================================================================
  // A4: Priority Ordering Tests
  // =========================================================================

  describe("A4: Priority Ordering", () => {
    it("should process higher priority jobs first", async () => {
      const processedOrder: number[] = [];

      // Enqueue jobs with different priorities (all at once, order doesn't matter)
      const job1 = await client.enqueue(
        "test-queue",
        { priority: 1 },
        { priority: 1 },
      );
      const job2 = await client.enqueue(
        "test-queue",
        { priority: 5 },
        { priority: 5 },
      );
      const job3 = await client.enqueue(
        "test-queue",
        { priority: 10 },
        { priority: 10 },
      );

      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          processedOrder.push((ctx.job.data as { priority: number }).priority);
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

      // Wait for all jobs to complete
      await eventually(async () => {
        const j1 = await client.getJob(job1);
        const j2 = await client.getJob(job2);
        const j3 = await client.getJob(job3);
        return (
          j1?.status === "completed" &&
          j2?.status === "completed" &&
          j3?.status === "completed"
        );
      });

      // Higher priority (10) should be processed first
      expect(processedOrder).toEqual([10, 5, 1]);
    });

    it("should process same-priority jobs in FIFO order", async () => {
      const processedOrder: number[] = [];

      // Enqueue jobs with same priority, with slight delays to ensure different createdAt
      const job1 = await client.enqueue(
        "test-queue",
        { order: 1 },
        { priority: 5 },
      );
      await sleep(10); // Ensure different createdAt
      const job2 = await client.enqueue(
        "test-queue",
        { order: 2 },
        { priority: 5 },
      );
      await sleep(10);
      const job3 = await client.enqueue(
        "test-queue",
        { order: 3 },
        { priority: 5 },
      );

      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          processedOrder.push((ctx.job.data as { order: number }).order);
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
        const j1 = await client.getJob(job1);
        const j2 = await client.getJob(job2);
        const j3 = await client.getJob(job3);
        return (
          j1?.status === "completed" &&
          j2?.status === "completed" &&
          j3?.status === "completed"
        );
      });

      // Same priority: FIFO order (oldest first)
      expect(processedOrder).toEqual([1, 2, 3]);
    });

    it("should prioritize expired jobs over high-priority pending jobs", async () => {
      const processedOrder: string[] = [];

      // First, create a job and manually set it to expired "processing" state
      const expiredJobId = await client.enqueue(
        "test-queue",
        { type: "expired" },
        { priority: 1 }, // Low priority
      );

      // Simulate a worker that crashed - set job to processing with expired lock
      const { queueJobs } = testDb.schema;
      await testDb.db
        .update(queueJobs)
        .set({
          status: "processing",
          lockedBy: "dead-worker",
          lockedAt: new Date(Date.now() - 10000),
          expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
          attempts: 1,
        })
        .where(eq(queueJobs.id, expiredJobId));

      // Now enqueue a high-priority pending job
      const highPriorityJobId = await client.enqueue(
        "test-queue",
        { type: "high-priority" },
        { priority: 100 }, // Very high priority
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

      await eventually(async () => {
        const j1 = await client.getJob(expiredJobId);
        const j2 = await client.getJob(highPriorityJobId);
        return j1?.status === "completed" && j2?.status === "completed";
      });

      // Expired job should be processed first, despite lower priority
      expect(processedOrder).toEqual(["expired", "high-priority"]);
    });
  });

  // =========================================================================
  // A5: Scheduled/Delayed Jobs Tests
  // =========================================================================

  describe("A5: Scheduled/Delayed Jobs", () => {
    it("should not claim job before scheduledFor", async () => {
      // Enqueue job with 2 second delay (long enough to verify it's not claimed)
      const jobId = await client.enqueue(
        "test-queue",
        { value: 42 },
        { delay: 2000 },
      );

      let processed = false;

      worker = createDbWorker(
        "test-queue",
        async () => {
          processed = true;
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

      // Let worker poll a few times (should not claim the delayed job)
      await sleep(200);

      // Stop worker before job becomes available
      await worker.stop();
      worker = null;

      // Job should still be pending (not claimed)
      const job = await client.getJob(jobId);
      expect(job?.status).toBe("pending");
      expect(processed).toBe(false);
    });

    it("should claim job after scheduledFor passes", async () => {
      // Enqueue job with 100ms delay
      const jobId = await client.enqueue(
        "test-queue",
        { value: 42 },
        { delay: 100 },
      );

      worker = createDbWorker(
        "test-queue",
        async () => {
          // Job handler
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

      // Wait for job to be processed
      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      const job = await client.getJob(jobId);
      expect(job?.status).toBe("completed");
    });

    it("should claim job with runAt in past immediately", async () => {
      // Enqueue job with runAt 1 second in the past
      const jobId = await client.enqueue(
        "test-queue",
        { value: 42 },
        { runAt: new Date(Date.now() - 1000) },
      );

      let processedAt: number | null = null;
      const enqueueTime = Date.now();

      worker = createDbWorker(
        "test-queue",
        async () => {
          processedAt = Date.now();
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

      // Should be processed immediately (within reasonable time)
      expect(processedAt).not.toBeNull();
      expect(processedAt! - enqueueTime).toBeLessThan(500); // Within 500ms
    });
  });

  // =========================================================================
  // A6: Lease Expiration Tests
  // =========================================================================

  describe("A6: Lease Expiration", () => {
    it("should recover expired processing job", async () => {
      const jobId = await client.enqueue(
        "test-queue",
        { value: 42 },
        { attempts: 3 },
      );

      // Simulate a crashed worker - directly set job to expired processing state
      const { queueJobs } = testDb.schema;
      await testDb.db
        .update(queueJobs)
        .set({
          status: "processing",
          lockedBy: "dead-worker-123",
          lockedAt: new Date(Date.now() - 10000), // 10 seconds ago
          expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
          attempts: 1, // First attempt happened
        })
        .where(eq(queueJobs.id, jobId));

      let worker2Processed = false;

      // Worker 2 should now recover the expired job
      worker = createDbWorker(
        "test-queue",
        async () => {
          worker2Processed = true;
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

      expect(worker2Processed).toBe(true);

      const job = await client.getJob(jobId);
      expect(job?.status).toBe("completed");
      expect(job?.attempts).toBe(2); // Was 1, now 2 after recovery
    });

    it("should not recover job that exceeded maxAttempts", async () => {
      const shortLockDuration = 200;

      // Job with only 1 max attempt
      const jobId = await client.enqueue(
        "test-queue",
        { value: 42 },
        { attempts: 1 },
      );

      // Worker 1 claims and fails the job
      worker = createDbWorker(
        "test-queue",
        async () => {
          throw new Error("Intentional failure");
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
          lockDuration: shortLockDuration,
        },
      );

      await worker.start();

      // Wait for job to fail
      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "failed";
      });

      await worker.stop();
      worker = null;

      const job = await client.getJob(jobId);
      expect(job?.status).toBe("failed");
      expect(job?.attempts).toBe(1);

      // Even if we start another worker, job should stay failed (not recovered)
      let worker2Processed = false;

      worker2 = createDbWorker(
        "test-queue",
        async () => {
          worker2Processed = true;
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
        },
      );

      await worker2.start();
      await sleep(200); // Give worker time to poll

      // Job should still be failed, not recovered
      const jobAfter = await client.getJob(jobId);
      expect(jobAfter?.status).toBe("failed");
      expect(worker2Processed).toBe(false);
    });

    it("should increment attempts when recovering expired job", async () => {
      const shortLockDuration = 200;

      const jobId = await client.enqueue(
        "test-queue",
        { value: 42 },
        { attempts: 5 },
      );

      // Manually set job to expired processing state with 2 previous attempts
      const { queueJobs } = testDb.schema;
      await testDb.db
        .update(queueJobs)
        .set({
          status: "processing",
          lockedBy: "dead-worker",
          lockedAt: new Date(Date.now() - 10000),
          expiresAt: new Date(Date.now() - 1000),
          attempts: 2,
        })
        .where(eq(queueJobs.id, jobId));

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
          lockDuration: shortLockDuration,
        },
      );

      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      const job = await client.getJob(jobId);
      expect(job?.status).toBe("completed");
      expect(job?.attempts).toBe(3); // Was 2, now 3 after recovery
    });
  });

  // =========================================================================
  // A7: Heartbeat/Lock Extension Tests
  // =========================================================================

  describe("A7: Heartbeat/Lock Extension", () => {
    it("should extend lock on manual heartbeat", async () => {
      const shortLockDuration = 300;

      const jobId = await client.enqueue("test-queue", { value: 42 });

      let heartbeatCalled = false;

      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          // Wait a bit then call heartbeat
          await sleep(100);
          await ctx.heartbeat();
          heartbeatCalled = true;
          // Complete the job
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
          lockDuration: shortLockDuration,
          heartbeatInterval: 50000, // Very long - manual heartbeat only
        },
      );

      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      expect(heartbeatCalled).toBe(true);

      const job = await client.getJob(jobId);
      expect(job?.status).toBe("completed");
    });

    it("should keep job alive with automatic heartbeats", async () => {
      // Short lock duration but handler runs longer
      const shortLockDuration = 200;
      const shortHeartbeatInterval = 50;
      const handlerDuration = 400; // Longer than lockDuration

      const jobId = await client.enqueue("test-queue", { value: 42 });

      let handlerCompleted = false;

      worker = createDbWorker(
        "test-queue",
        async () => {
          // Handler runs longer than lockDuration
          // Automatic heartbeats should keep it alive
          await sleep(handlerDuration);
          handlerCompleted = true;
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
          lockDuration: shortLockDuration,
          heartbeatInterval: shortHeartbeatInterval,
        },
      );

      await worker.start();

      await eventually(
        async () => {
          const job = await client.getJob(jobId);
          return job?.status === "completed";
        },
        { timeout: 2000 }, // Longer timeout for this test
      );

      expect(handlerCompleted).toBe(true);

      const job = await client.getJob(jobId);
      expect(job?.status).toBe("completed");
      expect(job?.attempts).toBe(1); // Should complete on first attempt
    });
  });
});
