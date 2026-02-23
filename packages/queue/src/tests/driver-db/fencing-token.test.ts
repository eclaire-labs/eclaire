/**
 * B5: Fencing Token / Ownership Guards
 *
 * Tests that the lockToken (fencing token) correctly prevents stale workers
 * from completing, failing, or extending locks on jobs that have been
 * reclaimed by another worker.
 *
 * These are critical safety properties that prevent data corruption when
 * workers crash and jobs are recovered by other workers.
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { QueueClient } from "../../core/types.js";
import {
  claimJobPostgres,
  claimJobSqlite,
  createDbQueueClient,
  extendJobLock,
  markJobCompleted,
  markJobFailed,
} from "../../driver-db/index.js";
import {
  createQueueTestDatabase,
  createTestLogger,
  DB_TEST_CONFIGS,
  type QueueTestDatabase,
  TEST_TIMEOUTS,
} from "../testkit/index.js";

describe.each(
  DB_TEST_CONFIGS,
)("B5: Fencing Token / Ownership Guards ($label)", ({ dbType }) => {
  let testDb: QueueTestDatabase;
  let client: QueueClient;
  const logger = createTestLogger();

  // Select claim function based on database type
  const claimJob = (
    db: any,
    queueJobs: any,
    name: string,
    options: { workerId: string; lockDuration: number },
  ) => {
    if (dbType === "pglite") {
      return claimJobPostgres(db, queueJobs, name, options, logger);
    } else {
      return claimJobSqlite(db, queueJobs, name, options, logger);
    }
  };

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
    await client.close();
    await testDb.cleanup();
  });

  /**
   * Helper to force-expire a job so it can be reclaimed
   */
  async function forceExpireJob(jobId: string): Promise<void> {
    const { queueJobs } = testDb.schema;
    await testDb.db
      .update(queueJobs)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(queueJobs.id, jobId));
  }

  /**
   * Helper to get job from database
   */
  async function getJobFromDb(jobId: string): Promise<any> {
    const { queueJobs } = testDb.schema;
    const [job] = await testDb.db
      .select()
      .from(queueJobs)
      .where(eq(queueJobs.id, jobId))
      .limit(1);
    return job;
  }

  it("B5.1: stale worker cannot complete a reclaimed job", async () => {
    // 1. Enqueue 1 job
    const jobId = await client.enqueue(
      "test-queue",
      { value: "test" },
      { attempts: 3 },
    );

    // 2. Claim as worker A
    const claimA = await claimJob(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      { workerId: "worker-a", lockDuration: TEST_TIMEOUTS.lockDuration },
    );
    expect(claimA).not.toBeNull();
    const workerIdA = "worker-a";
    const lockTokenA = claimA!.lockToken!;
    expect(lockTokenA).toBeDefined();

    // 3. Force expire the job
    await forceExpireJob(jobId);

    // 4. Re-claim as worker B
    const claimB = await claimJob(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      { workerId: "worker-b", lockDuration: TEST_TIMEOUTS.lockDuration },
    );
    expect(claimB).not.toBeNull();
    expect(claimB!.id).toBe(jobId);
    const lockTokenB = claimB!.lockToken!;

    // 5. Lock tokens must differ
    expect(lockTokenB).not.toBe(lockTokenA);

    // 6. Worker A tries to complete with stale credentials
    const completed = await markJobCompleted(
      testDb.db,
      testDb.schema.queueJobs,
      jobId,
      workerIdA,
      lockTokenA,
      logger,
    );

    // 7. Should return false (ownership lost)
    expect(completed).toBe(false);

    // 8. Job should still be processing under worker B
    const job = await getJobFromDb(jobId);
    expect(job.status).toBe("processing");
    expect(job.lockedBy).toBe("worker-b");
    expect(job.lockToken).toBe(lockTokenB);
  });

  it("B5.2: stale worker cannot fail a reclaimed job", async () => {
    // 1. Enqueue 1 job
    const jobId = await client.enqueue(
      "test-queue",
      { value: "test" },
      { attempts: 3 },
    );

    // 2. Claim as worker A
    const claimA = await claimJob(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      { workerId: "worker-a", lockDuration: TEST_TIMEOUTS.lockDuration },
    );
    expect(claimA).not.toBeNull();
    const workerIdA = "worker-a";
    const lockTokenA = claimA!.lockToken!;

    // 3. Force expire the job
    await forceExpireJob(jobId);

    // 4. Re-claim as worker B
    const claimB = await claimJob(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      { workerId: "worker-b", lockDuration: TEST_TIMEOUTS.lockDuration },
    );
    expect(claimB).not.toBeNull();
    const lockTokenB = claimB!.lockToken!;

    // 5. Worker A tries to fail with stale credentials
    const failed = await markJobFailed(
      testDb.db,
      testDb.schema.queueJobs,
      jobId,
      workerIdA,
      lockTokenA,
      new Error("Stale failure attempt"),
      logger,
    );

    // 6. Should return false (ownership lost)
    expect(failed).toBe(false);

    // 7. Job should still be processing under worker B (not failed)
    const job = await getJobFromDb(jobId);
    expect(job.status).toBe("processing");
    expect(job.lockedBy).toBe("worker-b");
    expect(job.lockToken).toBe(lockTokenB);
    expect(job.errorMessage).toBeNull();
  });

  it("B5.3: stale worker cannot heartbeat/extend lock after reclaim", async () => {
    // 1. Enqueue 1 job
    const jobId = await client.enqueue(
      "test-queue",
      { value: "test" },
      { attempts: 3 },
    );

    // 2. Claim as worker A
    const claimA = await claimJob(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      { workerId: "worker-a", lockDuration: TEST_TIMEOUTS.lockDuration },
    );
    expect(claimA).not.toBeNull();
    const workerIdA = "worker-a";
    const lockTokenA = claimA!.lockToken!;

    // 3. Force expire the job
    await forceExpireJob(jobId);

    // 4. Re-claim as worker B
    const claimB = await claimJob(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      { workerId: "worker-b", lockDuration: TEST_TIMEOUTS.lockDuration },
    );
    expect(claimB).not.toBeNull();
    const lockTokenB = claimB!.lockToken!;

    // 5. Worker A tries to extend lock with stale credentials
    const extended = await extendJobLock(
      testDb.db,
      testDb.schema.queueJobs,
      jobId,
      workerIdA,
      lockTokenA,
      60000, // Try to extend by 1 minute
      logger,
    );

    // 6. Should return false (ownership lost)
    expect(extended).toBe(false);

    // 7. Job should still be owned by worker B (ownership unchanged)
    const job = await getJobFromDb(jobId);
    expect(job.lockedBy).toBe("worker-b");
    expect(job.lockToken).toBe(lockTokenB);
    // Job should still be processing (not modified by stale worker)
    expect(job.status).toBe("processing");
  });

  it("B5.4: valid worker can complete with correct token", async () => {
    // Sanity check: verify that correct credentials work
    const jobId = await client.enqueue("test-queue", { value: "test" });

    const claimed = await claimJob(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      { workerId: "worker-a", lockDuration: TEST_TIMEOUTS.lockDuration },
    );
    expect(claimed).not.toBeNull();

    const completed = await markJobCompleted(
      testDb.db,
      testDb.schema.queueJobs,
      jobId,
      "worker-a",
      claimed!.lockToken!,
      logger,
    );

    expect(completed).toBe(true);

    const job = await getJobFromDb(jobId);
    expect(job.status).toBe("completed");
  });

  it("B5.5: valid worker can fail with correct token", async () => {
    // Sanity check: verify that correct credentials work for failure
    const jobId = await client.enqueue(
      "test-queue",
      { value: "test" },
      { attempts: 1 }, // Only 1 attempt so it fails permanently
    );

    const claimed = await claimJob(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      { workerId: "worker-a", lockDuration: TEST_TIMEOUTS.lockDuration },
    );
    expect(claimed).not.toBeNull();

    const failed = await markJobFailed(
      testDb.db,
      testDb.schema.queueJobs,
      jobId,
      "worker-a",
      claimed!.lockToken!,
      new Error("Expected failure"),
      logger,
    );

    expect(failed).toBe(true);

    const job = await getJobFromDb(jobId);
    expect(job.status).toBe("failed");
    expect(job.errorMessage).toBe("Expected failure");
  });

  it("B5.6: valid worker can extend lock with correct token", async () => {
    // Sanity check: verify that correct credentials work for lock extension
    const jobId = await client.enqueue("test-queue", { value: "test" });

    const claimed = await claimJob(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      { workerId: "worker-a", lockDuration: 5000 },
    );
    expect(claimed).not.toBeNull();

    // Record timestamp before extension
    const beforeExtend = Date.now();

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 100));

    const extended = await extendJobLock(
      testDb.db,
      testDb.schema.queueJobs,
      jobId,
      "worker-a",
      claimed!.lockToken!,
      60000, // Extend by 1 minute
      logger,
    );

    expect(extended).toBe(true);

    const job = await getJobFromDb(jobId);
    const newExpiresAt = new Date(job.expiresAt).getTime();

    // New expiry should be at least 50 seconds from before the extension
    // (60 seconds lock minus some overhead)
    expect(newExpiresAt).toBeGreaterThan(beforeExtend + 50000);
  });
});
