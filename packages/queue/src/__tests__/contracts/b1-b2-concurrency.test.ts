/**
 * B1-B2: Concurrency & Safety
 *
 * B1: No double-processing under concurrency
 * B2: Claim under contention
 *
 * These tests verify that the queue system correctly handles multiple workers
 * competing for jobs without double-processing.
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
import type { QueueClient, Worker } from "../../core/types.js";

describe.each(DB_TEST_CONFIGS)(
  "B1-B2: Concurrency ($label)",
  ({ dbType }) => {
    let testDb: QueueTestDatabase;
    let client: QueueClient;
    let workers: Worker[] = [];
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
      await client.close();
      await testDb.cleanup();
    });

    describe("B1: No double-processing under concurrency", () => {
      it("should process each job exactly once with multiple workers", async () => {
        const processedJobs = new Map<string, string[]>(); // jobId -> workerIds that processed it
        const jobCount = 20;
        const workerCount = 3;

        // 1. Enqueue M jobs
        const jobIds: string[] = [];
        for (let i = 0; i < jobCount; i++) {
          const id = await client.enqueue("test-queue", { index: i });
          jobIds.push(id);
          processedJobs.set(id, []);
        }

        // 2. Start N workers with concurrency > 1
        for (let w = 0; w < workerCount; w++) {
          const workerId = `worker-${w}`;
          const worker = createDbWorker(
            "test-queue",
            async (ctx) => {
              // Track which worker processed this job
              const existing = processedJobs.get(ctx.job.id) || [];
              existing.push(workerId);
              processedJobs.set(ctx.job.id, existing);
              await sleep(10); // Simulate work
            },
            {
              db: testDb.db,
              schema: testDb.schema,
              capabilities: testDb.capabilities,
              logger,
              pollInterval: TEST_TIMEOUTS.pollInterval,
            },
            { concurrency: 2 },
          );
          workers.push(worker);
          await worker.start();
        }

        // 3. Wait for all jobs to complete
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

        // 4. Assert: each job processed exactly once
        for (const [jobId, workerIds] of processedJobs) {
          expect(
            workerIds.length,
            `Job ${jobId} was processed ${workerIds.length} times`,
          ).toBe(1);
        }

        // Verify all jobs completed
        for (const id of jobIds) {
          const job = await client.getJob(id);
          expect(job?.status).toBe("completed");
        }
      });

      it("should not process same job concurrently even with high concurrency", async () => {
        const concurrentProcessing = new Map<string, number>(); // jobId -> current concurrent count
        const maxConcurrentPerJob = new Map<string, number>(); // jobId -> max concurrent count seen
        const jobCount = 5;

        // 1. Enqueue jobs
        const jobIds: string[] = [];
        for (let i = 0; i < jobCount; i++) {
          const id = await client.enqueue("test-queue", { index: i });
          jobIds.push(id);
          concurrentProcessing.set(id, 0);
          maxConcurrentPerJob.set(id, 0);
        }

        // 2. Start workers that track concurrent processing
        const workerCount = 3;
        for (let w = 0; w < workerCount; w++) {
          const worker = createDbWorker(
            "test-queue",
            async (ctx) => {
              const jobId = ctx.job.id;

              // Increment concurrent count
              const current = (concurrentProcessing.get(jobId) || 0) + 1;
              concurrentProcessing.set(jobId, current);

              // Track max
              const maxSeen = maxConcurrentPerJob.get(jobId) || 0;
              if (current > maxSeen) {
                maxConcurrentPerJob.set(jobId, current);
              }

              // Simulate work
              await sleep(50);

              // Decrement
              concurrentProcessing.set(
                jobId,
                (concurrentProcessing.get(jobId) || 1) - 1,
              );
            },
            {
              db: testDb.db,
              schema: testDb.schema,
              capabilities: testDb.capabilities,
              logger,
              pollInterval: TEST_TIMEOUTS.pollInterval,
            },
            { concurrency: 5 }, // High concurrency
          );
          workers.push(worker);
          await worker.start();
        }

        // 3. Wait for all jobs to complete
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

        // 4. Assert: no job was processed concurrently more than once
        for (const [jobId, maxConcurrent] of maxConcurrentPerJob) {
          expect(
            maxConcurrent,
            `Job ${jobId} had max ${maxConcurrent} concurrent processing`,
          ).toBe(1);
        }
      });
    });

    describe("B2: Claim under contention", () => {
      it("should allow only one worker to process a single job", async () => {
        const claimResults: string[] = []; // workerIds that processed the job

        // 1. Enqueue 1 job
        const jobId = await client.enqueue("test-queue", {
          value: "contested",
        });

        // 2. Start multiple workers racing to process
        const workerCount = 5;
        for (let i = 0; i < workerCount; i++) {
          const workerId = `worker-${i}`;
          const worker = createDbWorker(
            "test-queue",
            async () => {
              claimResults.push(workerId);
              await sleep(50); // Hold the job briefly
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

        // 3. Wait for job to complete
        await eventually(async () => {
          const job = await client.getJob(jobId);
          return job?.status === "completed";
        });

        // 4. Assert: only one worker processed the job
        expect(claimResults.length).toBe(1);

        // Verify job is completed
        const job = await client.getJob(jobId);
        expect(job?.status).toBe("completed");
      });

      it("should distribute jobs evenly across workers under load", async () => {
        const processedByWorker = new Map<string, number>(); // workerId -> count
        const jobCount = 30;
        const workerCount = 3;

        // Initialize counters
        for (let w = 0; w < workerCount; w++) {
          processedByWorker.set(`worker-${w}`, 0);
        }

        // 1. Enqueue many jobs
        const jobIds: string[] = [];
        for (let i = 0; i < jobCount; i++) {
          const id = await client.enqueue("test-queue", { index: i });
          jobIds.push(id);
        }

        // 2. Start workers
        for (let w = 0; w < workerCount; w++) {
          const workerId = `worker-${w}`;
          const worker = createDbWorker(
            "test-queue",
            async () => {
              processedByWorker.set(
                workerId,
                (processedByWorker.get(workerId) || 0) + 1,
              );
              await sleep(5); // Small delay to allow distribution
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

        // 3. Wait for all jobs to complete
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

        // 4. Assert: total processed equals job count
        let totalProcessed = 0;
        for (const count of processedByWorker.values()) {
          totalProcessed += count;
        }
        expect(totalProcessed).toBe(jobCount);

        // Each worker should have processed at least some jobs
        // (exact distribution depends on timing, but shouldn't be 0)
        for (const [workerId, count] of processedByWorker) {
          expect(
            count,
            `Worker ${workerId} processed ${count} jobs`,
          ).toBeGreaterThan(0);
        }
      });

      it("should handle workers starting at different times", async () => {
        const processedJobs = new Map<string, string>(); // jobId -> workerId
        const jobCount = 10;

        // 1. Enqueue jobs
        const jobIds: string[] = [];
        for (let i = 0; i < jobCount; i++) {
          const id = await client.enqueue("test-queue", { index: i });
          jobIds.push(id);
        }

        // 2. Start first worker
        const worker1 = createDbWorker(
          "test-queue",
          async (ctx) => {
            processedJobs.set(ctx.job.id, "worker-1");
            await sleep(20);
          },
          {
            db: testDb.db,
            schema: testDb.schema,
            capabilities: testDb.capabilities,
            logger,
            pollInterval: TEST_TIMEOUTS.pollInterval,
          },
        );
        workers.push(worker1);
        await worker1.start();

        // Wait a bit for first worker to claim some jobs
        await sleep(50);

        // 3. Start second worker
        const worker2 = createDbWorker(
          "test-queue",
          async (ctx) => {
            processedJobs.set(ctx.job.id, "worker-2");
            await sleep(20);
          },
          {
            db: testDb.db,
            schema: testDb.schema,
            capabilities: testDb.capabilities,
            logger,
            pollInterval: TEST_TIMEOUTS.pollInterval,
          },
        );
        workers.push(worker2);
        await worker2.start();

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

        // 5. Assert: all jobs processed exactly once
        expect(processedJobs.size).toBe(jobCount);

        // Both workers should have processed at least one job
        const worker1Count = [...processedJobs.values()].filter(
          (w) => w === "worker-1",
        ).length;
        const worker2Count = [...processedJobs.values()].filter(
          (w) => w === "worker-2",
        ).length;

        expect(worker1Count).toBeGreaterThan(0);
        expect(worker2Count).toBeGreaterThan(0);
        expect(worker1Count + worker2Count).toBe(jobCount);
      });
    });
  },
);
