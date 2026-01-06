/**
 * H1: Multi-process worker tests for BullMQ/Redis
 *
 * These tests spawn actual separate worker processes to validate
 * distributed worker scenarios with Redis/BullMQ backend.
 *
 * Requirements:
 * - Redis server running
 * - Set REDIS_URL environment variable (or uses default localhost)
 *
 * Run with: QUEUE_DRIVER=bullmq pnpm vitest run H1
 */

import type Redis from "ioredis";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  createBullMQClient,
  createRedisConnection,
} from "../../driver-bullmq/index.js";
import {
  collectResults,
  killAllWorkers,
  spawnWorker,
  type WorkerProcess,
  waitForAllReady,
  waitForJobsProcessed,
} from "../testkit/index.js";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

// Only run if QUEUE_DRIVER=bullmq is set
const shouldRun = process.env.QUEUE_DRIVER === "bullmq";
const describeIfBullMQ = shouldRun ? describe : describe.skip;

describeIfBullMQ("H1: Multi-process workers (BullMQ)", () => {
  const queueName = `test-multiprocess-${Date.now()}`;
  let redis: Redis;
  let client: ReturnType<typeof createBullMQClient>;
  let workers: WorkerProcess[] = [];

  // No-op logger
  const noopLogger = {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
    child: () => noopLogger,
  };

  beforeAll(async () => {
    redis = createRedisConnection({
      url: REDIS_URL,
      logger: noopLogger,
    });

    client = createBullMQClient({
      redis: { connection: redis },
      logger: noopLogger,
    });
  });

  afterAll(async () => {
    // Clean up Redis keys for this queue
    const keys = await redis.keys(`bull:${queueName}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.quit();
  });

  beforeEach(async () => {
    // Clean up any jobs from previous tests
    const keys = await redis.keys(`bull:${queueName}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    workers = [];
  });

  afterEach(async () => {
    // Kill any remaining workers
    await killAllWorkers(workers);
  });

  describe("H1: Job distribution across processes", () => {
    it("H1.1: jobs are distributed across 2 worker processes", async () => {
      const jobCount = 10;

      // Spawn 2 worker processes first (they need to be ready to receive jobs)
      const worker1 = spawnWorker({
        workerId: "worker-1",
        queueName,
        backend: "redis",
        redisUrl: REDIS_URL,
        maxJobs: 5,
      });
      const worker2 = spawnWorker({
        workerId: "worker-2",
        queueName,
        backend: "redis",
        redisUrl: REDIS_URL,
        maxJobs: 5,
      });
      workers = [worker1, worker2];

      // Wait for workers to be ready
      await waitForAllReady(workers);

      // Small delay to ensure workers are polling
      await new Promise((r) => setTimeout(r, 200));

      // Enqueue jobs
      for (let i = 0; i < jobCount; i++) {
        await client.enqueue(queueName, { value: i });
      }

      // Wait for all jobs to be processed
      await waitForJobsProcessed(workers, jobCount, 30000);

      // Collect results
      const results = collectResults(workers);

      // Verify each job was processed exactly once
      expect(results.size).toBe(jobCount);
      for (const [jobId, workerIds] of results) {
        expect(workerIds.length).toBe(1);
      }

      // Verify both workers got some jobs (distribution happened)
      expect(worker1.processed.length).toBeGreaterThan(0);
      expect(worker2.processed.length).toBeGreaterThan(0);

      // Total should equal job count
      expect(worker1.processed.length + worker2.processed.length).toBe(
        jobCount,
      );
    }, 60000);
  });
});
