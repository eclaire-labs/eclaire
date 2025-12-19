/**
 * Suite F: Operational / Shutdown Tests
 *
 * F1. Graceful shutdown: Workers finish active jobs before stopping
 * F2. Resource cleanup: close() shuts down timers, connections properly
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import {
  DB_TEST_CONFIGS,
  TEST_TIMEOUTS,
  createQueueTestDatabase,
  eventually,
  createTestLogger,
  sleep,
  createDeferred,
  type QueueTestDatabase,
} from "../testkit/index.js";
import {
  createDbQueueClient,
  createDbWorker,
  createDbScheduler,
} from "../../driver-db/index.js";
import type { QueueClient, Worker, Scheduler } from "../../core/types.js";

describe.each(DB_TEST_CONFIGS)(
  "Suite F: Shutdown ($label)",
  ({ dbType }) => {
    let testDb: QueueTestDatabase;
    let client: QueueClient;
    let workers: Worker[] = [];
    let scheduler: Scheduler | null = null;
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
      // Stop all workers
      await Promise.all(workers.map((w) => w.stop()));
      workers = [];

      // Stop scheduler if started
      if (scheduler) {
        await scheduler.stop();
        scheduler = null;
      }

      await client.close();
      await testDb.cleanup();
    });

    // =========================================================================
    // F1: Graceful Shutdown
    // =========================================================================

    describe("F1: Graceful Shutdown", () => {
      it("F1.1: Worker completes active jobs before stopping", async () => {
        const deferred = createDeferred<void>();
        let jobStarted = false;
        let jobCompleted = false;

        // 1. Enqueue a job
        const jobId = await client.enqueue("test-queue", { value: "test" });

        // 2. Create worker with blocking handler
        const worker = createDbWorker(
          "test-queue",
          async () => {
            jobStarted = true;
            await deferred.promise; // Block until we release
            jobCompleted = true;
          },
          {
            db: testDb.db,
            schema: testDb.schema,
            capabilities: testDb.capabilities,
            logger,
            pollInterval: TEST_TIMEOUTS.pollInterval,
          },
        );
        workers.push(worker);
        await worker.start();

        // 3. Wait for job to start processing
        await eventually(() => jobStarted);

        // 4. Request stop while job is processing
        const stopPromise = worker.stop();

        // Give a moment for stop to register
        await sleep(50);

        // 5. Verify worker hasn't completed stop yet
        expect(worker.isRunning()).toBe(true);
        expect(jobCompleted).toBe(false);

        // 6. Now release the job
        deferred.resolve();

        // 7. Wait for stop to complete
        await stopPromise;

        // 8. Verify job completed and worker stopped
        expect(jobCompleted).toBe(true);
        expect(worker.isRunning()).toBe(false);

        const job = await client.getJob(jobId);
        expect(job?.status).toBe("completed");
      });

      it("F1.2: Worker stops polling for new jobs after stop requested", async () => {
        const processedJobs: string[] = [];
        const firstJobDeferred = createDeferred<void>();

        // 1. Enqueue multiple jobs
        const jobId1 = await client.enqueue("test-queue", { index: 1 });
        const jobId2 = await client.enqueue("test-queue", { index: 2 });
        const jobId3 = await client.enqueue("test-queue", { index: 3 });

        // 2. Create worker that blocks on first job
        const worker = createDbWorker(
          "test-queue",
          async (ctx) => {
            processedJobs.push(ctx.job.id);
            if (processedJobs.length === 1) {
              await firstJobDeferred.promise; // Block on first job
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
        workers.push(worker);
        await worker.start();

        // 3. Wait for first job to start
        await eventually(() => processedJobs.length === 1);

        // 4. Request stop while first job is processing
        const stopPromise = worker.stop();

        // 5. Release first job
        firstJobDeferred.resolve();

        // 6. Wait for worker to stop
        await stopPromise;

        // 7. Verify only first job was processed
        expect(processedJobs).toHaveLength(1);
        expect(processedJobs[0]).toBe(jobId1);

        // 8. Verify remaining jobs are still pending
        const job2 = await client.getJob(jobId2);
        const job3 = await client.getJob(jobId3);
        expect(job2?.status).toBe("pending");
        expect(job3?.status).toBe("pending");
      });

      it("F1.3: Jobs from crashed worker can be reclaimed", async () => {
        const processedJobs = new Set<string>();

        // 1. Enqueue jobs
        const jobIds: string[] = [];
        for (let i = 0; i < 3; i++) {
          const id = await client.enqueue(
            "test-queue",
            { index: i },
            { attempts: 3 },
          );
          jobIds.push(id);
        }

        // 2. Simulate crashed worker by setting jobs to processing with expired leases
        const { queueJobs } = testDb.schema;
        for (const jobId of jobIds) {
          await testDb.db
            .update(queueJobs)
            .set({
              status: "processing",
              lockedBy: "dead-worker",
              lockedAt: new Date(Date.now() - 60000),
              expiresAt: new Date(Date.now() - 10000), // Expired
              attempts: 1,
            })
            .where(eq(queueJobs.id, jobId));
        }

        // 3. Start new worker to recover jobs
        const recoveryWorker = createDbWorker(
          "test-queue",
          async (ctx) => {
            processedJobs.add(ctx.job.id);
          },
          {
            db: testDb.db,
            schema: testDb.schema,
            capabilities: testDb.capabilities,
            logger,
            pollInterval: TEST_TIMEOUTS.pollInterval,
          },
        );
        workers.push(recoveryWorker);
        await recoveryWorker.start();

        // 4. Wait for all jobs to complete
        await eventually(
          async () => {
            for (const id of jobIds) {
              const job = await client.getJob(id);
              if (job?.status !== "completed") return false;
            }
            return true;
          },
          { timeout: 10000 },
        );

        // 5. Verify all jobs were recovered and completed
        expect(processedJobs.size).toBe(3);
        for (const id of jobIds) {
          expect(processedJobs.has(id)).toBe(true);
        }
      });

      it("F1.4: Multiple workers graceful shutdown", async () => {
        const processedJobs = new Set<string>();
        const deferreds = new Map<string, ReturnType<typeof createDeferred<void>>>();

        // 1. Enqueue jobs
        const jobIds: string[] = [];
        for (let i = 0; i < 4; i++) {
          const id = await client.enqueue("test-queue", { index: i });
          jobIds.push(id);
          deferreds.set(id, createDeferred<void>());
        }

        // 2. Start multiple workers
        for (let w = 0; w < 2; w++) {
          const worker = createDbWorker(
            "test-queue",
            async (ctx) => {
              processedJobs.add(ctx.job.id);
              const d = deferreds.get(ctx.job.id);
              if (d) await d.promise;
            },
            {
              db: testDb.db,
              schema: testDb.schema,
              capabilities: testDb.capabilities,
              logger,
              pollInterval: TEST_TIMEOUTS.pollInterval,
            },
          );
          workers.push(worker);
          await worker.start();
        }

        // 3. Wait for at least 2 jobs to be picked up
        await eventually(() => processedJobs.size >= 2);

        // 4. Request stop on all workers
        const stopPromises = workers.map((w) => w.stop());

        // 5. Release all blocking jobs
        for (const d of deferreds.values()) {
          d.resolve();
        }

        // 6. Wait for all workers to stop
        await Promise.all(stopPromises);

        // 7. Verify all workers stopped
        for (const w of workers) {
          expect(w.isRunning()).toBe(false);
        }

        // 8. Verify jobs in processing state should complete
        const stats = await client.stats("test-queue");
        // Some jobs completed, some might still be pending (not picked up before stop)
        expect(stats.processing).toBe(0); // No jobs stuck in processing
        expect(stats.completed + stats.pending).toBe(4);
      });
    });

    // =========================================================================
    // F2: Resource Cleanup
    // =========================================================================

    describe("F2: Resource Cleanup", () => {
      it("F2.1: Client close() works correctly", async () => {
        // 1. Enqueue some jobs
        await client.enqueue("test-queue", { value: 1 });
        await client.enqueue("test-queue", { value: 2 });

        // 2. Close client - should not throw
        await expect(client.close()).resolves.not.toThrow();

        // 3. Close again - should be idempotent (no error)
        await expect(client.close()).resolves.not.toThrow();
      });

      it("F2.2: Scheduler stop() works correctly", async () => {
        // 1. Create scheduler
        scheduler = createDbScheduler({
          db: testDb.db,
          queueSchedules: testDb.schema.queueSchedules,
          queueClient: client,
          logger,
          checkInterval: 10000, // Long interval to avoid interference
        });

        // 2. Upsert a schedule
        await scheduler.upsert({
          key: "test-schedule",
          queue: "test-queue",
          cron: "0 * * * *", // Every hour
          data: { type: "test" },
        });

        // 3. Start scheduler
        await scheduler.start();

        // 4. Stop scheduler - should not throw
        await expect(scheduler.stop()).resolves.not.toThrow();

        // 5. Stop again - should be idempotent
        await expect(scheduler.stop()).resolves.not.toThrow();
      });

      it("F2.3: Worker stop() clears timers and isRunning returns false", async () => {
        // 1. Enqueue a job
        await client.enqueue("test-queue", { value: "test" });

        // 2. Create and start worker
        const worker = createDbWorker(
          "test-queue",
          async () => {
            // Quick handler
          },
          {
            db: testDb.db,
            schema: testDb.schema,
            capabilities: testDb.capabilities,
            logger,
            pollInterval: TEST_TIMEOUTS.pollInterval,
          },
        );
        workers.push(worker);

        expect(worker.isRunning()).toBe(false);
        await worker.start();
        expect(worker.isRunning()).toBe(true);

        // 3. Wait for job to complete
        await eventually(async () => {
          const stats = await client.stats("test-queue");
          return stats.completed >= 1;
        });

        // 4. Stop worker
        await worker.stop();

        // 5. Verify worker stopped
        expect(worker.isRunning()).toBe(false);

        // 6. Stop again - should be idempotent
        await expect(worker.stop()).resolves.not.toThrow();
        expect(worker.isRunning()).toBe(false);
      });

      it("F2.4: Full lifecycle cleanup", async () => {
        // 1. Create scheduler
        scheduler = createDbScheduler({
          db: testDb.db,
          queueSchedules: testDb.schema.queueSchedules,
          queueClient: client,
          logger,
          checkInterval: 60000,
        });

        // 2. Create multiple workers
        const worker1 = createDbWorker(
          "queue-1",
          async () => {},
          {
            db: testDb.db,
            schema: testDb.schema,
            capabilities: testDb.capabilities,
            logger,
            pollInterval: TEST_TIMEOUTS.pollInterval,
          },
        );
        workers.push(worker1);

        const worker2 = createDbWorker(
          "queue-2",
          async () => {},
          {
            db: testDb.db,
            schema: testDb.schema,
            capabilities: testDb.capabilities,
            logger,
            pollInterval: TEST_TIMEOUTS.pollInterval,
          },
        );
        workers.push(worker2);

        // 3. Enqueue jobs
        await client.enqueue("queue-1", { value: 1 });
        await client.enqueue("queue-2", { value: 2 });

        // 4. Create schedule
        await scheduler.upsert({
          key: "lifecycle-test",
          queue: "queue-1",
          cron: "0 0 * * *",
          data: {},
        });

        // 5. Start all components
        await worker1.start();
        await worker2.start();
        await scheduler.start();

        // 6. Wait for jobs to process
        await eventually(async () => {
          const stats1 = await client.stats("queue-1");
          const stats2 = await client.stats("queue-2");
          return stats1.completed >= 1 && stats2.completed >= 1;
        });

        // 7. Stop all components in order
        await worker1.stop();
        await worker2.stop();
        await scheduler.stop();
        await client.close();

        // 8. Verify all stopped
        expect(worker1.isRunning()).toBe(false);
        expect(worker2.isRunning()).toBe(false);
      });
    });
  },
);
