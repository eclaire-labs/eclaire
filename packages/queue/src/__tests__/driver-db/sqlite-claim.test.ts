/**
 * B6: SQLite Claim Concurrency + Token Invariants
 *
 * SQLite-specific tests for claim contention. Unlike PostgreSQL's SKIP LOCKED,
 * SQLite uses a different claim strategy (UPDATE with random token + SELECT).
 * These tests ensure the SQLite implementation maintains the same safety properties.
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

describe.skipIf(!sqliteConfig)(
  "B6: SQLite Claim Concurrency + Token Invariants",
  () => {
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

    it("B6.1: under contention, only one claim succeeds for a single job", async () => {
      // 1. Enqueue 1 job
      const jobId = await client.enqueue("test-queue", { value: "contested" });

      // 2. Race N parallel claimJobSqlite calls with different workerIds
      const claimPromises = Array(10)
        .fill(null)
        .map((_, i) =>
          claimJobSqlite(
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

      // 4. Exactly one should succeed
      expect(claimed.length).toBe(1);

      // 5. Verify the claimed job has correct properties
      const winner = claimed[0]!;
      expect(winner.id).toBe(jobId);
      expect(winner.lockToken).toBeDefined();
      expect(winner.lockToken).not.toBe("");
      expect(winner.lockedBy).toMatch(/^worker-\d+$/);
      expect(winner.status).toBe("processing");
    });

    it("B6.2: multiple jobs, multiple claimers → unique claims", async () => {
      // 1. Enqueue M jobs
      const jobCount = 5;
      const jobIds: string[] = [];
      for (let i = 0; i < jobCount; i++) {
        const id = await client.enqueue("test-queue", { index: i });
        jobIds.push(id);
      }

      // 2. Race N claimers in parallel (more claimers than jobs)
      const claimPromises = Array(15)
        .fill(null)
        .map((_, i) =>
          claimJobSqlite(
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

      // 4. Should have at most jobCount successful claims
      expect(claimed.length).toBeLessThanOrEqual(jobCount);
      expect(claimed.length).toBeGreaterThan(0);

      // 5. All claimed job IDs should be unique (no duplicates)
      const claimedIds = claimed.map((j) => j!.id);
      const uniqueIds = new Set(claimedIds);
      expect(uniqueIds.size).toBe(claimedIds.length);

      // 6. All claimed IDs should be from our original job set
      for (const id of claimedIds) {
        expect(jobIds).toContain(id);
      }
    });

    it("B6.3: follow-up SELECT returns the claimed row correctly", async () => {
      // This tests the SQLite claim pattern: UPDATE + SELECT-by-token
      // Ensures the returned job matches what was claimed

      const jobId = await client.enqueue("test-queue", { value: "test-data" });

      const claimed = await claimJobSqlite(
        testDb.db,
        testDb.schema.queueJobs,
        "test-queue",
        {
          workerId: "test-worker",
          lockDuration: 5000,
        },
        logger,
      );

      // Verify strict invariants
      expect(claimed).not.toBeNull();
      expect(claimed!.id).toBe(jobId);
      expect(claimed!.status).toBe("processing");
      expect(claimed!.lockedBy).toBe("test-worker");
      expect(claimed!.lockToken).toBeDefined();
      expect(typeof claimed!.lockToken).toBe("string");
      expect(claimed!.lockToken!.length).toBeGreaterThan(0);

      // Verify timestamps are present
      expect(claimed!.lockedAt).toBeDefined();
      expect(claimed!.expiresAt).toBeDefined();

      // Verify the data was preserved
      expect(claimed!.data).toEqual({ value: "test-data" });

      // Verify attempts was incremented
      expect(claimed!.attempts).toBe(1);
    });

    it("B6.4: each claim generates a unique lockToken", async () => {
      // Enqueue jobs and claim them, verifying each gets a unique token
      const tokens: string[] = [];

      for (let i = 0; i < 5; i++) {
        await client.enqueue("test-queue", { index: i });
      }

      // Claim all jobs sequentially
      for (let i = 0; i < 5; i++) {
        const claimed = await claimJobSqlite(
          testDb.db,
          testDb.schema.queueJobs,
          "test-queue",
          {
            workerId: `worker-${i}`,
            lockDuration: TEST_TIMEOUTS.lockDuration,
          },
          logger,
        );

        expect(claimed).not.toBeNull();
        expect(claimed!.lockToken).toBeDefined();
        tokens.push(claimed!.lockToken!);
      }

      // All tokens should be unique
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(tokens.length);
    });

    it("B6.5: claim returns null when no jobs available", async () => {
      // Try to claim from empty queue
      const result = await claimJobSqlite(
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

    it("B6.6: claim only returns jobs for specified queue", async () => {
      // Enqueue jobs to different queues
      const queueAId = await client.enqueue("queue-a", { queue: "a" });
      await client.enqueue("queue-b", { queue: "b" });

      // Try to claim from queue-a
      const claimed = await claimJobSqlite(
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
    });
  },
);
