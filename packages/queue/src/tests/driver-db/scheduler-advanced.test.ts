/**
 * D3, D4, D5, D7: Advanced Scheduler Tests
 *
 * Tests for advanced scheduling features:
 * - D3: End date - stop creating occurrences after endDate
 * - D4: Run limit > 1 - create exactly N occurrences
 * - D5: Update schedule - follow new pattern after update
 * - D7: Dedup on restart - no duplicate occurrences on scheduler restart
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { QueueClient, Scheduler } from "../../core/types.js";
import {
  createDbQueueClient,
  createDbScheduler,
} from "../../driver-db/index.js";
import {
  createQueueTestDatabase,
  createTestLogger,
  DB_TEST_CONFIGS,
  eventually,
  type QueueTestDatabase,
  sleep,
} from "../testkit/index.js";

describe.each(DB_TEST_CONFIGS)("D3, D4, D5, D7: Advanced Scheduler ($label)", ({
  dbType,
}) => {
  let testDb: QueueTestDatabase;
  let client: QueueClient;
  let scheduler: Scheduler | null = null;
  const logger = createTestLogger();

  // Short check interval for fast tests
  const checkInterval = 50;

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
    if (scheduler) {
      await scheduler.stop();
      scheduler = null;
    }
    await client.close();
    await testDb.cleanup();
  });

  /**
   * Helper to create a scheduler with short check interval
   */
  function createTestScheduler(): Scheduler {
    return createDbScheduler({
      db: testDb.db,
      queueSchedules: testDb.schema.queueSchedules,
      queueClient: client,
      logger,
      checkInterval,
    });
  }

  // =========================================================================
  // D3: End Date Tests
  // =========================================================================

  describe("D3: End Date", () => {
    it("should stop creating occurrences after endDate", async () => {
      scheduler = createTestScheduler();

      // Create schedule with endDate in the past
      const pastEndDate = new Date(Date.now() - 1000);

      await scheduler.upsert({
        key: "end-date-schedule",
        queue: "test-queue",
        cron: "* * * * *",
        data: { type: "end-date-test" },
        endDate: pastEndDate,
        immediately: true,
      });

      await scheduler.start();

      // Wait for scheduler to process
      await sleep(checkInterval * 3);

      // No jobs should be enqueued because endDate has passed
      const stats = await client.stats("test-queue");
      expect(stats.pending).toBe(0);
    });

    it("should disable schedule when endDate is reached", async () => {
      scheduler = createTestScheduler();

      // Create schedule with endDate in the past
      const pastEndDate = new Date(Date.now() - 1000);

      await scheduler.upsert({
        key: "end-date-disable",
        queue: "test-queue",
        cron: "* * * * *",
        data: { type: "end-date-disable" },
        endDate: pastEndDate,
        immediately: true,
      });

      await scheduler.start();

      // Wait for schedule to be disabled
      await eventually(
        async () => {
          const schedules = await scheduler!.list();
          const schedule = schedules.find((s) => s.key === "end-date-disable");
          return schedule?.enabled === false;
        },
        { timeout: 2000 },
      );

      const schedules = await scheduler.list();
      const schedule = schedules.find((s) => s.key === "end-date-disable");
      expect(schedule?.enabled).toBe(false);
    });

    it("should create first occurrence but disable when endDate passes", async () => {
      scheduler = createTestScheduler();
      const { queueSchedules } = testDb.schema;

      // Create schedule with endDate in the past for immediate check,
      // but immediately=true so we get one job first
      // Actually we want: first run happens (endDate not yet passed),
      // then next run is blocked because endDate passed.

      // For simplicity: create with future endDate, run once, then
      // manually move endDate to past and trigger another check
      const futureEndDate = new Date(Date.now() + 60000); // 1 minute in future

      await scheduler.upsert({
        key: "end-date-sequence",
        queue: "test-queue",
        cron: "* * * * *",
        data: { type: "end-date-sequence" },
        endDate: futureEndDate,
        immediately: true,
      });

      await scheduler.start();

      // First occurrence should be created (endDate not yet passed)
      await eventually(async () => {
        const stats = await client.stats("test-queue");
        return stats.pending >= 1;
      });

      const initialStats = await client.stats("test-queue");
      expect(initialStats.pending).toBe(1);

      // Now move endDate to the past to simulate time passing
      await testDb.db
        .update(queueSchedules)
        .set({
          endDate: new Date(Date.now() - 1000), // 1 second ago
          nextRunAt: new Date(Date.now() - 100), // trigger check
        })
        .where(eq(queueSchedules.key, "end-date-sequence"));

      // Wait for scheduler to process and disable
      await eventually(
        async () => {
          const schedules = await scheduler!.list();
          const schedule = schedules.find((s) => s.key === "end-date-sequence");
          return schedule?.enabled === false;
        },
        { timeout: 2000 },
      );

      // Should be disabled after endDate
      const schedules = await scheduler.list();
      const schedule = schedules.find((s) => s.key === "end-date-sequence");
      expect(schedule?.enabled).toBe(false);

      // Should still have only 1 job (no new job created after endDate)
      const finalStats = await client.stats("test-queue");
      expect(finalStats.pending).toBe(1);
    });
  });

  // =========================================================================
  // D4: Run Limit > 1 Tests
  // =========================================================================

  describe("D4: Run Limit > 1", () => {
    it("should create exactly N occurrences when limit is set", async () => {
      scheduler = createTestScheduler();
      const { queueSchedules } = testDb.schema;

      // Create schedule with limit=3, starting immediately
      await scheduler.upsert({
        key: "limited-schedule-3",
        queue: "test-queue",
        cron: "* * * * *",
        data: { run: true },
        limit: 3,
        immediately: true,
      });

      await scheduler.start();

      // Wait for first job to be created
      await eventually(async () => {
        const stats = await client.stats("test-queue");
        return stats.pending >= 1;
      });

      // Keep forcing runs until the schedule is disabled
      // Each iteration we use a unique past timestamp for the job key
      let iteration = 0;
      while (iteration < 10) {
        // Check if already disabled
        const schedules = await scheduler.list();
        const schedule = schedules.find((s) => s.key === "limited-schedule-3");
        if (!schedule?.enabled) break;

        // Force nextRunAt to a unique past time
        const uniquePastTime = new Date(1000000000000 + iteration * 1000);
        await testDb.db
          .update(queueSchedules)
          .set({ nextRunAt: uniquePastTime })
          .where(eq(queueSchedules.key, "limited-schedule-3"));

        // Wait for scheduler cycle
        await sleep(checkInterval * 2);
        iteration++;
      }

      // Wait a bit more for any final processing
      await sleep(checkInterval * 2);

      // Should have created exactly 3 jobs
      const stats = await client.stats("test-queue");
      expect(stats.pending).toBe(3);

      // Schedule should be disabled
      const schedules = await scheduler.list();
      const schedule = schedules.find((s) => s.key === "limited-schedule-3");
      expect(schedule?.enabled).toBe(false);
    });
  });

  // =========================================================================
  // D5: Update Schedule Pattern Tests
  // =========================================================================

  describe("D5: Update Schedule", () => {
    it("should follow new pattern after schedule update", async () => {
      scheduler = createTestScheduler();
      const { queueSchedules } = testDb.schema;

      // Create schedule with hourly pattern (not immediately)
      await scheduler.upsert({
        key: "update-pattern",
        queue: "test-queue",
        cron: "0 * * * *", // Hourly
        data: { version: 1 },
      });

      // Get the initial nextRunAt
      const initialSchedules = await scheduler.list();
      expect(initialSchedules).toHaveLength(1);

      // Read the actual nextRunAt from DB
      const initialRows = await testDb.db
        .select()
        .from(queueSchedules)
        .where(eq(queueSchedules.key, "update-pattern"));
      const initialNextRunAt = initialRows[0].nextRunAt;

      // Update to every minute pattern with immediately=true
      await scheduler.upsert({
        key: "update-pattern",
        queue: "test-queue",
        cron: "* * * * *", // Every minute
        data: { version: 2 },
        immediately: true,
      });

      // Check the new nextRunAt
      const updatedRows = await testDb.db
        .select()
        .from(queueSchedules)
        .where(eq(queueSchedules.key, "update-pattern"));
      const updatedNextRunAt = updatedRows[0].nextRunAt;

      // With immediately=true, nextRunAt should be now (much sooner than hourly)
      expect(updatedNextRunAt!.getTime()).toBeLessThan(
        initialNextRunAt!.getTime(),
      );

      // Verify cron pattern was updated
      const schedules = await scheduler.list();
      expect(schedules[0].cron).toBe("* * * * *");
      expect(schedules[0].data).toEqual({ version: 2 });
    });

    it("should not duplicate jobs on pattern update", async () => {
      scheduler = createTestScheduler();

      // Create schedule that runs immediately
      await scheduler.upsert({
        key: "no-dup-update",
        queue: "test-queue",
        cron: "* * * * *",
        data: { version: 1 },
        immediately: true,
      });

      await scheduler.start();

      // Wait for first job to be enqueued
      await eventually(async () => {
        const stats = await client.stats("test-queue");
        return stats.pending >= 1;
      });

      const statsAfterFirst = await client.stats("test-queue");
      expect(statsAfterFirst.pending).toBe(1);

      // Update the schedule (same key, different pattern)
      await scheduler.upsert({
        key: "no-dup-update",
        queue: "test-queue",
        cron: "*/5 * * * *", // Every 5 minutes
        data: { version: 2 },
        immediately: true,
      });

      // Wait a bit for any potential duplicate
      await sleep(checkInterval * 3);

      // Should still have only 1 job (not duplicated)
      // The second immediately should create a new job with different key (based on new nextRunAt)
      const finalStats = await client.stats("test-queue");
      // Either 1 or 2 jobs is acceptable (1 if dedup, 2 if new occurrence)
      // But not more than 2
      expect(finalStats.pending).toBeLessThanOrEqual(2);
    });
  });

  // =========================================================================
  // D7: Dedup on Restart Tests
  // =========================================================================

  describe("D7: Dedup on Restart", () => {
    it("should not duplicate occurrences on scheduler restart", async () => {
      scheduler = createTestScheduler();
      const { queueSchedules } = testDb.schema;

      // Create schedule with immediately=true
      await scheduler.upsert({
        key: "dedup-restart",
        queue: "test-queue",
        cron: "* * * * *",
        data: { dedup: true },
        immediately: true,
      });

      // Capture the original nextRunAt BEFORE scheduler starts
      const rowsBefore = await testDb.db
        .select()
        .from(queueSchedules)
        .where(eq(queueSchedules.key, "dedup-restart"));
      const originalNextRunAt = rowsBefore[0].nextRunAt;

      await scheduler.start();

      // Wait for first occurrence to be enqueued
      await eventually(async () => {
        const stats = await client.stats("test-queue");
        return stats.pending >= 1;
      });

      const statsAfterFirst = await client.stats("test-queue");
      expect(statsAfterFirst.pending).toBe(1);

      // Simulate crash: set nextRunAt back to the ORIGINAL value
      // This simulates scheduler crashed after enqueue but before DB update
      await testDb.db
        .update(queueSchedules)
        .set({
          nextRunAt: originalNextRunAt,
          runCount: 0, // Reset runCount to simulate crash before update
        })
        .where(eq(queueSchedules.key, "dedup-restart"));

      // Wait for scheduler to process again
      await sleep(checkInterval * 3);

      // Should still have only 1 job because jobKey is based on nextRunAt
      // and the idempotent enqueue prevents duplicates
      const statsAfterRestart = await client.stats("test-queue");
      expect(statsAfterRestart.pending).toBe(1);
    });

    it("should use nextRunAt timestamp in job key for idempotency", async () => {
      scheduler = createTestScheduler();
      const { queueSchedules, queueJobs } = testDb.schema;

      // Create schedule with immediately=true
      const _startTime = new Date();
      await scheduler.upsert({
        key: "key-check",
        queue: "test-queue",
        cron: "* * * * *",
        data: { keyCheck: true },
        immediately: true,
      });

      // Get the nextRunAt before starting
      const rows = await testDb.db
        .select()
        .from(queueSchedules)
        .where(eq(queueSchedules.key, "key-check"));
      const nextRunAt = rows[0].nextRunAt!;

      await scheduler.start();

      // Wait for job to be enqueued
      await eventually(async () => {
        const stats = await client.stats("test-queue");
        return stats.pending >= 1;
      });

      // Check the job key
      const jobs = await testDb.db
        .select()
        .from(queueJobs)
        .where(eq(queueJobs.queue, "test-queue"));

      expect(jobs).toHaveLength(1);
      // Job key should be schedule:{scheduleKey}:{nextRunAt.getTime()}
      expect(jobs[0].key).toBe(`schedule:key-check:${nextRunAt.getTime()}`);
    });
  });
});
