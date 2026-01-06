/**
 * B9: SQLite Priority Ordering
 *
 * SQLite-specific test mirroring B4's priority test. Ensures that
 * jobs are claimed in the correct order: priority DESC, createdAt ASC.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { QueueClient } from "../../core/types.js";
import { claimJobSqlite, createDbQueueClient } from "../../driver-db/index.js";
import {
  createQueueTestDatabase,
  createTestLogger,
  DB_TEST_CONFIGS,
  type QueueTestDatabase,
  TEST_TIMEOUTS,
} from "../testkit/index.js";

// Only run for SQLite
const sqliteConfig = DB_TEST_CONFIGS.find((c) => c.dbType === "sqlite");

describe.skipIf(!sqliteConfig)("B9: SQLite Priority Ordering", () => {
  let testDb: QueueTestDatabase;
  let client: QueueClient;
  const logger = createTestLogger();

  beforeEach(async () => {
    testDb = await createQueueTestDatabase("sqlite");

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

  it("B9.1: jobs are claimed in priority order (priority DESC, createdAt ASC)", async () => {
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
    const claim1 = await claimJobSqlite(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      { workerId: "w1", lockDuration: TEST_TIMEOUTS.lockDuration },
      logger,
    );
    const claim2 = await claimJobSqlite(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      { workerId: "w2", lockDuration: TEST_TIMEOUTS.lockDuration },
      logger,
    );
    const claim3 = await claimJobSqlite(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      { workerId: "w3", lockDuration: TEST_TIMEOUTS.lockDuration },
      logger,
    );

    // Should be claimed in priority order (high -> medium -> low)
    expect(claim1).not.toBeNull();
    expect(claim2).not.toBeNull();
    expect(claim3).not.toBeNull();

    expect(claim1!.id).toBe(highPriorityId);
    expect(claim2!.id).toBe(medPriorityId);
    expect(claim3!.id).toBe(lowPriorityId);
  });

  it("B9.2: jobs with same priority are claimed in FIFO order", async () => {
    // Enqueue jobs with same priority
    const job1Id = await client.enqueue(
      "test-queue",
      { order: 1 },
      { priority: 5 },
    );

    // Small delay to ensure different createdAt timestamps
    await new Promise((r) => setTimeout(r, 10));

    const job2Id = await client.enqueue(
      "test-queue",
      { order: 2 },
      { priority: 5 },
    );

    await new Promise((r) => setTimeout(r, 10));

    const job3Id = await client.enqueue(
      "test-queue",
      { order: 3 },
      { priority: 5 },
    );

    // Claim jobs
    const claim1 = await claimJobSqlite(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      { workerId: "w1", lockDuration: TEST_TIMEOUTS.lockDuration },
      logger,
    );
    const claim2 = await claimJobSqlite(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      { workerId: "w2", lockDuration: TEST_TIMEOUTS.lockDuration },
      logger,
    );
    const claim3 = await claimJobSqlite(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      { workerId: "w3", lockDuration: TEST_TIMEOUTS.lockDuration },
      logger,
    );

    // Should be claimed in FIFO order (createdAt ASC)
    expect(claim1!.id).toBe(job1Id);
    expect(claim2!.id).toBe(job2Id);
    expect(claim3!.id).toBe(job3Id);
  });

  it("B9.3: default priority (0) jobs are claimed after higher priority", async () => {
    // Enqueue jobs with default and explicit priority
    const defaultPriorityId = await client.enqueue(
      "test-queue",
      { priority: "default" },
      // No priority option - uses default (0)
    );
    const highPriorityId = await client.enqueue(
      "test-queue",
      { priority: "high" },
      { priority: 10 },
    );

    // Claim jobs
    const claim1 = await claimJobSqlite(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      { workerId: "w1", lockDuration: TEST_TIMEOUTS.lockDuration },
      logger,
    );
    const claim2 = await claimJobSqlite(
      testDb.db,
      testDb.schema.queueJobs,
      "test-queue",
      { workerId: "w2", lockDuration: TEST_TIMEOUTS.lockDuration },
      logger,
    );

    // High priority should be claimed first
    expect(claim1!.id).toBe(highPriorityId);
    expect(claim2!.id).toBe(defaultPriorityId);
  });
});
