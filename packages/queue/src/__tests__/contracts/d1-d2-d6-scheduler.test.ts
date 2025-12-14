/**
 * D1, D2, D6: Scheduler/Cron Tests
 *
 * Tests for cron-based recurring job scheduling:
 * - D1: Schedule creation and management
 * - D2: Schedule recurrence (job enqueuing)
 * - D6: Enable/disable schedules
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
  type QueueTestDatabase,
} from "../testkit/index.js";
import {
  createDbQueueClient,
  createDbScheduler,
} from "../../driver-db/index.js";
import type { QueueClient, Scheduler } from "../../core/types.js";

describe.each(DB_TEST_CONFIGS)(
  "D1, D2, D6: Scheduler ($label)",
  ({ dbType }) => {
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
    // D1: Schedule Creation/Management Tests
    // =========================================================================

    describe("D1: Schedule Management", () => {
      it("should create a schedule with upsert", async () => {
        scheduler = createTestScheduler();

        const key = await scheduler.upsert({
          key: "daily-cleanup",
          name: "cleanup-queue",
          cron: "0 0 * * *", // Daily at midnight
          data: { type: "cleanup" },
        });

        expect(key).toBe("daily-cleanup");

        const schedules = await scheduler.list();
        expect(schedules).toHaveLength(1);
        expect(schedules[0].key).toBe("daily-cleanup");
        expect(schedules[0].name).toBe("cleanup-queue");
        expect(schedules[0].cron).toBe("0 0 * * *");
        expect(schedules[0].data).toEqual({ type: "cleanup" });
      });

      it("should update existing schedule with same key", async () => {
        scheduler = createTestScheduler();

        // Create initial schedule
        await scheduler.upsert({
          key: "my-schedule",
          name: "queue-a",
          cron: "0 * * * *", // Hourly
          data: { version: 1 },
        });

        // Update with same key
        await scheduler.upsert({
          key: "my-schedule",
          name: "queue-b", // Changed
          cron: "*/5 * * * *", // Changed to every 5 minutes
          data: { version: 2 }, // Changed
        });

        const schedules = await scheduler.list();
        expect(schedules).toHaveLength(1); // Not duplicated
        expect(schedules[0].key).toBe("my-schedule");
        expect(schedules[0].name).toBe("queue-b");
        expect(schedules[0].cron).toBe("*/5 * * * *");
        expect(schedules[0].data).toEqual({ version: 2 });
      });

      it("should remove a schedule", async () => {
        scheduler = createTestScheduler();

        await scheduler.upsert({
          key: "to-remove",
          name: "test-queue",
          cron: "* * * * *",
          data: {},
        });

        let schedules = await scheduler.list();
        expect(schedules).toHaveLength(1);

        const removed = await scheduler.remove("to-remove");
        expect(removed).toBe(true);

        schedules = await scheduler.list();
        expect(schedules).toHaveLength(0);

        // Removing again returns false
        const removedAgain = await scheduler.remove("to-remove");
        expect(removedAgain).toBe(false);
      });

      it("should list schedules filtered by queue name", async () => {
        scheduler = createTestScheduler();

        await scheduler.upsert({
          key: "schedule-a",
          name: "queue-a",
          cron: "* * * * *",
          data: { queue: "a" },
        });

        await scheduler.upsert({
          key: "schedule-b",
          name: "queue-b",
          cron: "* * * * *",
          data: { queue: "b" },
        });

        await scheduler.upsert({
          key: "schedule-a2",
          name: "queue-a",
          cron: "*/5 * * * *",
          data: { queue: "a2" },
        });

        // List all
        const all = await scheduler.list();
        expect(all).toHaveLength(3);

        // Filter by queue-a
        const queueA = await scheduler.list("queue-a");
        expect(queueA).toHaveLength(2);
        expect(queueA.every((s) => s.name === "queue-a")).toBe(true);

        // Filter by queue-b
        const queueB = await scheduler.list("queue-b");
        expect(queueB).toHaveLength(1);
        expect(queueB[0].key).toBe("schedule-b");
      });
    });

    // =========================================================================
    // D2: Schedule Recurrence Tests
    // =========================================================================

    describe("D2: Schedule Recurrence", () => {
      it("should enqueue job when schedule is due (immediately)", async () => {
        scheduler = createTestScheduler();

        // Create schedule that runs immediately
        await scheduler.upsert({
          key: "immediate-job",
          name: "test-queue",
          cron: "* * * * *", // Every minute
          data: { scheduled: true },
          immediately: true,
        });

        await scheduler.start();

        // Wait for job to be enqueued
        await eventually(async () => {
          const stats = await client.stats("test-queue");
          return stats.pending > 0;
        });

        const stats = await client.stats("test-queue");
        expect(stats.pending).toBeGreaterThanOrEqual(1);
      });

      it("should respect runLimit and auto-disable", async () => {
        scheduler = createTestScheduler();
        const { queueSchedules } = testDb.schema;

        // Create schedule with limit of 1 run, starting immediately
        // This way it will disable after the very first run
        await scheduler.upsert({
          key: "limited-schedule",
          name: "test-queue",
          cron: "* * * * *",
          data: { run: true },
          limit: 1,
          immediately: true,
        });

        await scheduler.start();

        // Wait for first job to be enqueued
        await eventually(async () => {
          const stats = await client.stats("test-queue");
          return stats.pending >= 1;
        });

        // After first run, runCount becomes 1 which equals limit
        // The scheduler should disable it on the next check when it sees runCount >= runLimit
        // Manually set nextRunAt to past to trigger the check immediately
        await testDb.db
          .update(queueSchedules)
          .set({
            nextRunAt: new Date(Date.now() - 1000),
          })
          .where(eq(queueSchedules.key, "limited-schedule"));

        // Wait for schedule to be disabled
        await eventually(
          async () => {
            const schedules = await scheduler!.list();
            const schedule = schedules.find((s) => s.key === "limited-schedule");
            return schedule?.enabled === false;
          },
          { timeout: 2000 },
        );

        const schedules = await scheduler.list();
        const schedule = schedules.find((s) => s.key === "limited-schedule");
        expect(schedule?.enabled).toBe(false);

        // Should have created exactly 1 job
        const stats = await client.stats("test-queue");
        expect(stats.pending).toBe(1);
      });
    });

    // =========================================================================
    // D6: Enable/Disable Tests
    // =========================================================================

    describe("D6: Enable/Disable", () => {
      it("should not enqueue jobs for disabled schedules", async () => {
        scheduler = createTestScheduler();

        // Create disabled schedule
        await scheduler.upsert({
          key: "disabled-schedule",
          name: "test-queue",
          cron: "* * * * *",
          data: { disabled: true },
          enabled: false,
          immediately: true, // Would run immediately if enabled
        });

        await scheduler.start();

        // Wait a bit for scheduler to run
        await sleep(checkInterval * 3);

        // No jobs should be enqueued
        const stats = await client.stats("test-queue");
        expect(stats.pending).toBe(0);
      });

      it("should enable/disable via setEnabled()", async () => {
        scheduler = createTestScheduler();

        // Create enabled schedule
        await scheduler.upsert({
          key: "toggle-schedule",
          name: "test-queue",
          cron: "* * * * *",
          data: { toggle: true },
          enabled: true,
          immediately: true,
        });

        // Disable before starting scheduler
        await scheduler.setEnabled("toggle-schedule", false);

        await scheduler.start();

        // Wait for scheduler to run
        await sleep(checkInterval * 3);

        // Should not have enqueued because we disabled it
        const stats = await client.stats("test-queue");
        expect(stats.pending).toBe(0);

        // Verify it's disabled in the list
        const schedules = await scheduler.list();
        const schedule = schedules.find((s) => s.key === "toggle-schedule");
        expect(schedule?.enabled).toBe(false);
      });

      it("should resume processing when re-enabled", async () => {
        scheduler = createTestScheduler();

        // Create disabled schedule
        await scheduler.upsert({
          key: "resume-schedule",
          name: "test-queue",
          cron: "* * * * *",
          data: { resume: true },
          enabled: false,
          immediately: true,
        });

        await scheduler.start();

        // Wait and verify no jobs
        await sleep(checkInterval * 2);
        let stats = await client.stats("test-queue");
        expect(stats.pending).toBe(0);

        // Re-enable the schedule
        await scheduler.setEnabled("resume-schedule", true);

        // Wait for job to be enqueued
        await eventually(async () => {
          const s = await client.stats("test-queue");
          return s.pending > 0;
        });

        stats = await client.stats("test-queue");
        expect(stats.pending).toBeGreaterThanOrEqual(1);
      });
    });
  },
);
