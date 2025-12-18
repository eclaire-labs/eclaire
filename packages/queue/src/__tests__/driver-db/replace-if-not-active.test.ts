/**
 * A3: Conditional Replace (replace='if_not_active')
 *
 * Tests that enqueue with replace='if_not_active' correctly:
 * - Throws JobAlreadyActiveError when job is processing
 * - Allows replacement of pending/retry_pending jobs
 * - Creates fresh job when previous was completed/failed
 * - Does not interrupt active job handlers
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import {
  DB_TEST_CONFIGS,
  TEST_TIMEOUTS,
  createQueueTestDatabase,
  eventually,
  createTestLogger,
  createDeferred,
  type QueueTestDatabase,
  type Deferred,
} from "../testkit/index.js";
import {
  createDbQueueClient,
  createDbWorker,
} from "../../driver-db/index.js";
import {
  JobAlreadyActiveError,
  isJobAlreadyActiveError,
} from "../../core/errors.js";
import type { QueueClient, Worker, Job } from "../../core/types.js";

describe.each(DB_TEST_CONFIGS)(
  "A3: Conditional Replace ($label)",
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
    // A3.1: Throws when job is actively processing
    // =========================================================================

    it("A3.1: should throw JobAlreadyActiveError when replacing active job", async () => {
      const key = "active-job-key";
      const handlerStarted = createDeferred<void>();
      const continueHandler = createDeferred<void>();

      // 1. Enqueue initial job
      await client.enqueue("test-queue", { value: "original" }, { key });

      // 2. Start worker with blocking handler
      worker = createDbWorker(
        "test-queue",
        async () => {
          handlerStarted.resolve();
          await continueHandler.promise;
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

      // 3. Wait for handler to start processing
      await handlerStarted.promise;

      // 4. Try to replace with if_not_active - should throw
      await expect(
        client.enqueue(
          "test-queue",
          { value: "replacement" },
          { key, replace: "if_not_active" },
        ),
      ).rejects.toThrow(JobAlreadyActiveError);

      // 5. Verify the error has correct properties
      try {
        await client.enqueue(
          "test-queue",
          { value: "replacement" },
          { key, replace: "if_not_active" },
        );
      } catch (error) {
        expect(isJobAlreadyActiveError(error)).toBe(true);
        if (isJobAlreadyActiveError(error)) {
          expect(error.queueName).toBe("test-queue");
          expect(error.key).toBe(key);
          expect(error.code).toBe("JOB_ALREADY_ACTIVE");
        }
      }

      // 6. Release handler
      continueHandler.resolve();

      // 7. Wait for job to complete
      await eventually(async () => {
        const job = await client.getJob(key);
        return job?.status === "completed";
      });
    });

    // =========================================================================
    // A3.2: Does not interrupt active job handler
    // =========================================================================

    it("A3.2: should not interrupt active job handler (sees original payload)", async () => {
      const key = "no-interrupt-key";
      const handlerStarted = createDeferred<void>();
      const continueHandler = createDeferred<void>();
      let handlerPayload: unknown = null;
      let handlerCompleted = false;

      // 1. Enqueue initial job
      await client.enqueue("test-queue", { value: "original" }, { key });

      // 2. Start worker that captures payload and blocks
      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          handlerPayload = ctx.job.data;
          handlerStarted.resolve();
          await continueHandler.promise;
          handlerCompleted = true;
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
      await handlerStarted.promise;

      // 3. Try replacement - should throw
      try {
        await client.enqueue(
          "test-queue",
          { value: "replacement" },
          { key, replace: "if_not_active" },
        );
      } catch {
        // Expected
      }

      // 4. Handler should still be running (not interrupted)
      expect(handlerCompleted).toBe(false);

      // 5. Complete handler
      continueHandler.resolve();
      await eventually(async () => handlerCompleted);

      // 6. Verify handler saw original payload (not replacement)
      expect(handlerPayload).toEqual({ value: "original" });
    });

    // =========================================================================
    // A3.3: Updates pending job with new payload and options
    // =========================================================================

    it("A3.3: should update pending job with new payload and options", async () => {
      const key = "pending-replace-key";

      // 1. Enqueue initial job (no worker running)
      const originalId = await client.enqueue(
        "test-queue",
        { value: "original", count: 1 },
        { key, priority: 5 },
      );

      // 2. Replace with if_not_active
      const newId = await client.enqueue(
        "test-queue",
        { value: "replacement", count: 2 },
        { key, priority: 10, replace: "if_not_active" },
      );

      // 3. Should return the same job ID (updated, not new)
      expect(newId).toBe(originalId);

      // 4. Verify only one job exists
      const stats = await client.stats("test-queue");
      expect(stats.pending).toBe(1);

      // 5. Verify job has updated payload and options
      const job = await client.getJob(key);
      expect(job).toBeDefined();
      expect(job!.data).toEqual({ value: "replacement", count: 2 });
      expect(job!.priority).toBe(10);
    });

    // =========================================================================
    // A3.4: Updates retry_pending job, resets to pending state
    // =========================================================================

    it("A3.4: should update retry_pending job and reset to pending", async () => {
      const key = "retry-replace-key";

      // 1. Enqueue and manually set to retry_pending
      const jobId = await client.enqueue(
        "test-queue",
        { value: "original" },
        { key },
      );

      // Manually update to retry_pending state
      const { queueJobs } = testDb.schema;
      await testDb.db
        .update(queueJobs)
        .set({
          status: "retry_pending",
          attempts: 2,
          nextRetryAt: new Date(Date.now() + 60000),
          errorMessage: "Previous error",
        })
        .where(eq(queueJobs.id, jobId));

      // Verify state change
      const beforeJob = await client.getJob(key);
      expect(beforeJob!.status).toBe("retry_pending");
      expect(beforeJob!.attempts).toBe(2);

      // 2. Replace with if_not_active
      const newId = await client.enqueue(
        "test-queue",
        { value: "replacement" },
        { key, replace: "if_not_active" },
      );

      // 3. Should return the same job ID
      expect(newId).toBe(jobId);

      // 4. Verify job updated and reset to pending
      const job = await client.getJob(key);
      expect(job!.data).toEqual({ value: "replacement" });
      expect(job!.status).toBe("pending");
      expect(job!.attempts).toBe(0); // Reset
    });

    // =========================================================================
    // A3.5: Creates fresh job when previous was completed
    // =========================================================================

    it("A3.5: should create fresh job when previous was completed", async () => {
      const key = "completed-replace-key";
      const processedPayloads: unknown[] = [];

      // 1. Enqueue and process first job
      const firstId = await client.enqueue(
        "test-queue",
        { value: "first" },
        { key },
      );

      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          processedPayloads.push(ctx.job.data);
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
        const job = await client.getJob(firstId);
        return job?.status === "completed";
      });

      // 2. Enqueue new job with same key (previous completed)
      const secondId = await client.enqueue(
        "test-queue",
        { value: "second" },
        { key, replace: "if_not_active" },
      );

      // 3. Should create a new job (different ID)
      expect(secondId).not.toBe(firstId);

      // 4. Wait for second job to complete
      await eventually(async () => {
        return processedPayloads.length >= 2;
      });

      // 5. Verify both payloads were processed
      expect(processedPayloads).toHaveLength(2);
      expect(processedPayloads[0]).toEqual({ value: "first" });
      expect(processedPayloads[1]).toEqual({ value: "second" });
    });

    // =========================================================================
    // A3.6: Creates fresh job when previous was failed
    // =========================================================================

    it("A3.6: should create fresh job when previous was failed", async () => {
      const key = "failed-replace-key";

      // 1. Enqueue and manually set to failed
      const oldId = await client.enqueue(
        "test-queue",
        { value: "original" },
        { key },
      );

      const { queueJobs } = testDb.schema;
      await testDb.db
        .update(queueJobs)
        .set({
          status: "failed",
          errorMessage: "Previous failure",
          completedAt: new Date(),
        })
        .where(eq(queueJobs.id, oldId));

      // Verify state change
      const beforeJob = await client.getJob(oldId);
      expect(beforeJob!.status).toBe("failed");

      // 2. Enqueue new job with same key
      const newId = await client.enqueue(
        "test-queue",
        { value: "retry" },
        { key, replace: "if_not_active" },
      );

      // 3. Should create a new job (different ID)
      expect(newId).not.toBe(oldId);

      // 4. Verify new job is pending
      const job = await client.getJob(newId);
      expect(job!.status).toBe("pending");
      expect(job!.data).toEqual({ value: "retry" });
    });

    // =========================================================================
    // A3.7: Backward compat - no replace option maintains current behavior
    // =========================================================================

    it("A3.7: should maintain backward compatibility without replace option", async () => {
      const key = "backward-compat-key";
      const handlerStarted = createDeferred<void>();
      const continueHandler = createDeferred<void>();

      // 1. Enqueue initial job
      await client.enqueue("test-queue", { value: "original" }, { key });

      // 2. Start worker
      worker = createDbWorker(
        "test-queue",
        async () => {
          handlerStarted.resolve();
          await continueHandler.promise;
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
      await handlerStarted.promise;

      // 3. Without replace option - should NOT throw (current behavior)
      // Note: Current implementation blindly replaces, which is the documented default
      await expect(
        client.enqueue("test-queue", { value: "replacement" }, { key }),
      ).resolves.toBeDefined();

      continueHandler.resolve();
    });
  },
);
