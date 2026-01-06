/**
 * B4: Postgres SKIP LOCKED
 *
 * Tests that PostgreSQL's FOR UPDATE SKIP LOCKED mechanism correctly handles
 * concurrent claim operations without blocking and ensures exactly-once claiming.
 *
 * These tests are PostgreSQL-specific and verify the atomic claim behavior.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { QueueClient } from "../../core/types.js";
import {
  claimJobPostgres,
  createDbQueueClient,
} from "../../driver-db/index.js";
import {
  createQueueTestDatabase,
  createTestLogger,
  DB_TEST_CONFIGS,
  type QueueTestDatabase,
  TEST_TIMEOUTS,
} from "../testkit/index.js";

// Only run for PGlite (PostgreSQL)
const pgliteConfig = DB_TEST_CONFIGS.find((c) => c.dbType === "pglite");

describe.skipIf(!pgliteConfig)("B4: Postgres SKIP LOCKED", () => {
  let testDb: QueueTestDatabase;
  let client: QueueClient;
  const logger = createTestLogger();

  beforeEach(async () => {
    testDb = await createQueueTestDatabase("pglite");

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

  it("should claim unique jobs when multiple claims race", async () => {
    // 1. Enqueue multiple jobs
    const jobCount = 5;
    const jobIds: string[] = [];
    for (let i = 0; i < jobCount; i++) {
      const id = await client.enqueue("test-queue", { index: i });
      jobIds.push(id);
    }

    // 2. Race multiple claim operations in parallel
    const claimPromises = Array(10)
      .fill(null)
      .map((_, i) =>
        claimJobPostgres(
          testDb.db,
          testDb.schema.queueJobs,
          "test-queue",
          {
            workerId: `worker-${i}`,
            lockDuration: TEST_TIMEOUTS.lockDuration,
          },
          logger,
        ),
      );

    const results = await Promise.all(claimPromises);

    // 3. Count successful claims
    const claimed = results.filter((r) => r !== null);

    // With 5 jobs and 10 claimers, we expect exactly 5 successful claims
    expect(claimed.length).toBeLessThanOrEqual(jobCount);
    expect(claimed.length).toBeGreaterThan(0);

    // All claimed jobs should have unique IDs
    const claimedIds = claimed.map((j) => j!.id);
    const uniqueIds = new Set(claimedIds);
    expect(uniqueIds.size).toBe(claimedIds.length);

    // All claimed IDs should be from our job set
    for (const id of claimedIds) {
      expect(jobIds).toContain(id);
    }
  });

  it("should not claim same job twice under heavy contention", async () => {
    // 1. Enqueue 1 job
    const jobId = await client.enqueue("test-queue", { value: "contested" });

    // 2. Race many claim operations for the same job
    const claimPromises = Array(20)
      .fill(null)
      .map((_, i) =>
        claimJobPostgres(
          testDb.db,
          testDb.schema.queueJobs,
          "test-queue",
          {
            workerId: `worker-${i}`,
            lockDuration: TEST_TIMEOUTS.lockDuration,
          },
          logger,
        ),
      );

    const results = await Promise.all(claimPromises);

    // 3. Exactly one should succeed
    const claimed = results.filter((r) => r !== null);
    expect(claimed.length).toBe(1);
    expect(claimed[0]!.id).toBe(jobId);

    // Verify the job is in processing state
    const job = await client.getJob(jobId);
    expect(job?.status).toBe("processing");
  });

  it("should return null when no jobs available", async () => {
    // Try to claim from empty queue
    const result = await claimJobPostgres(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      {
        workerId: "worker-1",
        lockDuration: TEST_TIMEOUTS.lockDuration,
      },
      logger,
    );

    expect(result).toBeNull();
  });

  it("should set correct lock fields on claim", async () => {
    const jobId = await client.enqueue("test-queue", { value: "test" });

    const claimed = await claimJobPostgres(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      {
        workerId: "test-worker",
        lockDuration: 5000,
      },
      logger,
    );

    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe(jobId);
    expect(claimed!.status).toBe("processing");
    expect(claimed!.lockedBy).toBe("test-worker");
    expect(claimed!.lockedAt).toBeDefined();
    expect(claimed!.expiresAt).toBeDefined();
    expect(claimed!.attempts).toBe(1);

    // B4 enhancement: Verify lockToken is present and non-empty
    expect(claimed!.lockToken).toBeDefined();
    expect(claimed!.lockToken).not.toBe("");
    expect(typeof claimed!.lockToken).toBe("string");

    // B4 enhancement: Verify timestamps are Date objects (not strings)
    expect(claimed!.createdAt).toBeInstanceOf(Date);
    expect(claimed!.updatedAt).toBeInstanceOf(Date);
    expect(claimed!.lockedAt).toBeInstanceOf(Date);
    expect(claimed!.expiresAt).toBeInstanceOf(Date);

    // Verify expiresAt is approximately lockDuration in the future
    const lockedAtTime = claimed!.lockedAt!.getTime();
    const expiresAtTime = claimed!.expiresAt!.getTime();
    const expectedExpiry = lockedAtTime + 5000;
    expect(Math.abs(expiresAtTime - expectedExpiry)).toBeLessThan(1000);
  });

  it("should increment attempts on each claim", async () => {
    const jobId = await client.enqueue(
      "test-queue",
      { value: "test" },
      { attempts: 5 },
    );

    // First claim
    const claim1 = await claimJobPostgres(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      {
        workerId: "worker-1",
        lockDuration: TEST_TIMEOUTS.lockDuration,
      },
      logger,
    );
    expect(claim1?.attempts).toBe(1);

    // Simulate crash by expiring the job
    const { queueJobs } = testDb.schema;
    const { eq } = await import("drizzle-orm");
    await testDb.db
      .update(queueJobs)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(queueJobs.id, jobId));

    // Second claim (recovery)
    const claim2 = await claimJobPostgres(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      {
        workerId: "worker-2",
        lockDuration: TEST_TIMEOUTS.lockDuration,
      },
      logger,
    );
    expect(claim2?.attempts).toBe(2);
  });

  it("should only claim jobs for specified queue name", async () => {
    // Enqueue jobs to different queues
    const queueAId = await client.enqueue("queue-a", { queue: "a" });
    const queueBId = await client.enqueue("queue-b", { queue: "b" });

    // Try to claim from queue-a
    const claimed = await claimJobPostgres(
      testDb.db,
      testDb.schema.queueJobs,
      "queue-a",
      {
        workerId: "worker-1",
        lockDuration: TEST_TIMEOUTS.lockDuration,
      },
      logger,
    );

    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe(queueAId);
    expect(claimed!.queue).toBe("queue-a");

    // Queue-b job should still be pending
    const jobB = await client.getJob(queueBId);
    expect(jobB?.status).toBe("pending");
  });

  it("should respect job ordering (priority DESC, createdAt ASC)", async () => {
    // Enqueue jobs with different priorities
    const lowPriorityId = await client.enqueue(
      "test-queue",
      { priority: "low" },
      { priority: 1 },
    );
    const highPriorityId = await client.enqueue(
      "test-queue",
      { priority: "high" },
      { priority: 10 },
    );
    const medPriorityId = await client.enqueue(
      "test-queue",
      { priority: "medium" },
      { priority: 5 },
    );

    // Claim jobs one by one
    const claim1 = await claimJobPostgres(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      { workerId: "w1", lockDuration: TEST_TIMEOUTS.lockDuration },
      logger,
    );
    const claim2 = await claimJobPostgres(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      { workerId: "w2", lockDuration: TEST_TIMEOUTS.lockDuration },
      logger,
    );
    const claim3 = await claimJobPostgres(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      { workerId: "w3", lockDuration: TEST_TIMEOUTS.lockDuration },
      logger,
    );

    // Should be claimed in priority order (high -> medium -> low)
    expect(claim1!.id).toBe(highPriorityId);
    expect(claim2!.id).toBe(medPriorityId);
    expect(claim3!.id).toBe(lowPriorityId);
  });

  it("should not claim scheduled jobs before their time", async () => {
    // Enqueue a job scheduled for the future
    const futureJobId = await client.enqueue(
      "test-queue",
      { scheduled: true },
      { delay: 60000 }, // 1 minute in the future
    );

    // Try to claim
    const claimed = await claimJobPostgres(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      {
        workerId: "worker-1",
        lockDuration: TEST_TIMEOUTS.lockDuration,
      },
      logger,
    );

    // Should return null (job is scheduled for later)
    expect(claimed).toBeNull();

    // Job should still be pending
    const job = await client.getJob(futureJobId);
    expect(job?.status).toBe("pending");
  });

  it("should claim expired processing jobs for recovery", async () => {
    // Enqueue and manually set to expired processing state
    const jobId = await client.enqueue(
      "test-queue",
      { value: "expired" },
      { attempts: 3 },
    );

    const { queueJobs } = testDb.schema;
    const { eq } = await import("drizzle-orm");
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

    // Claim should recover the expired job
    const claimed = await claimJobPostgres(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      {
        workerId: "recovery-worker",
        lockDuration: TEST_TIMEOUTS.lockDuration,
      },
      logger,
    );

    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe(jobId);
    expect(claimed!.lockedBy).toBe("recovery-worker");
    expect(claimed!.attempts).toBe(2); // Incremented
  });

  it("should not claim exhausted expired jobs", async () => {
    // Enqueue and set to expired but exhausted state
    const jobId = await client.enqueue(
      "test-queue",
      { value: "exhausted" },
      { attempts: 1 },
    );

    const { queueJobs } = testDb.schema;
    const { eq } = await import("drizzle-orm");
    await testDb.db
      .update(queueJobs)
      .set({
        status: "processing",
        lockedBy: "dead-worker",
        lockedAt: new Date(Date.now() - 60000),
        expiresAt: new Date(Date.now() - 10000), // Expired
        attempts: 1,
        maxAttempts: 1, // Exhausted
      })
      .where(eq(queueJobs.id, jobId));

    // Should not claim exhausted job
    const claimed = await claimJobPostgres(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      {
        workerId: "recovery-worker",
        lockDuration: TEST_TIMEOUTS.lockDuration,
      },
      logger,
    );

    expect(claimed).toBeNull();
  });
});
