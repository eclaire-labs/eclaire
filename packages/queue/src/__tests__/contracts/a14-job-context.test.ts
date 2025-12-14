/**
 * A14: Job Context Methods
 *
 * Tests that the JobContext methods (heartbeat, log, progress) work correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import {
  DB_TEST_CONFIGS,
  TEST_TIMEOUTS,
  createQueueTestDatabase,
  createTestLogger,
  eventually,
  sleep,
  type QueueTestDatabase,
} from "../testkit/index.js";
import {
  createDbQueueClient,
  createDbWorker,
} from "../../driver-db/index.js";
import type { QueueClient, Worker } from "../../core/types.js";

describe.each(DB_TEST_CONFIGS)(
  "A14: Job Context Methods ($label)",
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
      if (worker?.isRunning()) {
        await worker.stop();
      }
      await client.close();
      await testDb.cleanup();
    });

    it("A14.1: ctx.heartbeat() extends the job lock", async () => {
      let jobId: string;
      let heartbeatCalled = false;
      let jobCompleted = false;

      // Create worker with short lock duration
      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          jobId = ctx.job.id;

          // Wait for half the lock duration
          await sleep(300);

          // Get initial expiresAt
          const { queueJobs } = testDb.schema;
          const [before] = await testDb.db
            .select({ expiresAt: queueJobs.expiresAt })
            .from(queueJobs)
            .where(eq(queueJobs.id, jobId))
            .limit(1);
          const expiresAtBefore = new Date(before.expiresAt).getTime();

          // Call heartbeat
          await ctx.heartbeat();
          heartbeatCalled = true;

          // Get expiresAt after heartbeat
          const [after] = await testDb.db
            .select({ expiresAt: queueJobs.expiresAt })
            .from(queueJobs)
            .where(eq(queueJobs.id, jobId))
            .limit(1);
          const expiresAtAfter = new Date(after.expiresAt).getTime();

          // expiresAt should have been extended
          expect(expiresAtAfter).toBeGreaterThan(expiresAtBefore);

          // Wait a bit more - total time > original lock duration
          await sleep(400);

          jobCompleted = true;
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
          lockDuration: 500, // 500ms lock - short enough to test heartbeat
          heartbeatInterval: 10000, // Disable automatic heartbeat
        },
      );

      const enqueuedJobId = await client.enqueue("test-queue", { value: "test" });
      await worker.start();

      // Wait for job to complete
      await eventually(
        async () => {
          const job = await client.getJob(enqueuedJobId);
          return job?.status === "completed";
        },
        { timeout: 3000, interval: 50 },
      );

      expect(heartbeatCalled).toBe(true);
      expect(jobCompleted).toBe(true);

      // Verify job completed successfully (not failed due to lock expiry)
      const job = await client.getJob(enqueuedJobId);
      expect(job?.status).toBe("completed");
    });

    it("A14.2: ctx.log() and ctx.progress() don't throw", async () => {
      let logCalled = false;
      let progressCalled = false;
      let jobCompleted = false;

      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          // These should not throw
          ctx.log("Processing job...");
          logCalled = true;

          ctx.progress(25);
          ctx.progress(50);
          ctx.progress(75);
          ctx.progress(100);
          progressCalled = true;

          jobCompleted = true;
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
          lockDuration: TEST_TIMEOUTS.lockDuration,
          heartbeatInterval: TEST_TIMEOUTS.heartbeatInterval,
        },
      );

      const jobId = await client.enqueue("test-queue", { value: "test" });
      await worker.start();

      // Wait for job to complete
      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      expect(logCalled).toBe(true);
      expect(progressCalled).toBe(true);

      // Job should have completed successfully
      const job = await client.getJob(jobId);
      expect(job?.status).toBe("completed");
    });

    it("A14.3: job context has correct job information", async () => {
      let receivedJob: any = null;

      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          receivedJob = ctx.job;
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
        },
      );

      const jobId = await client.enqueue(
        "test-queue",
        { value: "test-data", nested: { foo: "bar" } },
        { priority: 5, attempts: 3 },
      );
      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      // Verify job properties
      expect(receivedJob).not.toBeNull();
      expect(receivedJob.id).toBe(jobId);
      expect(receivedJob.name).toBe("test-queue");
      expect(receivedJob.data).toEqual({ value: "test-data", nested: { foo: "bar" } });
      expect(receivedJob.priority).toBe(5);
      expect(receivedJob.maxAttempts).toBe(3);
      expect(receivedJob.attempts).toBe(1);
      expect(receivedJob.status).toBe("processing");
      expect(receivedJob.createdAt).toBeInstanceOf(Date);
      expect(receivedJob.updatedAt).toBeInstanceOf(Date);
    });

    it("A14.4: job context with key is preserved", async () => {
      let receivedKey: string | undefined = undefined;

      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          receivedKey = ctx.job.key;
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
        },
      );

      await client.enqueue(
        "test-queue",
        { value: "test" },
        { key: "my-unique-key" },
      );
      await worker.start();

      await eventually(async () => {
        return receivedKey === "my-unique-key";
      });

      expect(receivedKey).toBe("my-unique-key");
    });
  },
);
