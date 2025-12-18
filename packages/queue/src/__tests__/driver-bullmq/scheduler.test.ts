/**
 * BullMQ Scheduler Tests
 *
 * Tests basic scheduler operations: upsert, remove, list, setEnabled.
 *
 * Limitation: BullMQ scheduler only shows schedules from current process
 * (in-memory tracking). Schedules persist in Redis but list() won't see
 * schedules created by other processes.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createBullMQTestHarness,
  eventually,
  type QueueTestHarness,
} from "../testkit/index.js";
import type { QueueClient, Worker, Scheduler } from "../../core/types.js";

describe("BullMQ: Scheduler", () => {
  let harness: QueueTestHarness;
  let client: QueueClient;
  let scheduler: Scheduler | null = null;
  let worker: Worker | null = null;

  beforeEach(async () => {
    harness = await createBullMQTestHarness();
    client = harness.createClient();
  });

  afterEach(async () => {
    if (worker) {
      await worker.stop();
      worker = null;
    }
    if (scheduler) {
      await scheduler.stop();
      scheduler = null;
    }
    await harness.cleanup();
  });

  describe("upsert", () => {
    it("should create a new schedule", async () => {
      scheduler = harness.createScheduler();
      await scheduler.start();

      const key = await scheduler.upsert({
        key: "test-schedule",
        name: "scheduled-queue",
        cron: "0 0 * * *", // Daily at midnight
        data: { type: "daily" },
      });

      expect(key).toBe("test-schedule");

      const schedules = await scheduler.list();
      expect(schedules).toHaveLength(1);
      expect(schedules[0].key).toBe("test-schedule");
      expect(schedules[0].name).toBe("scheduled-queue");
      expect(schedules[0].cron).toBe("0 0 * * *");
    });

    it("should update an existing schedule", async () => {
      scheduler = harness.createScheduler();
      await scheduler.start();

      // Create initial schedule
      await scheduler.upsert({
        key: "update-schedule",
        name: "scheduled-queue",
        cron: "0 0 * * *",
        data: { version: 1 },
      });

      // Update with new data
      await scheduler.upsert({
        key: "update-schedule",
        name: "scheduled-queue",
        cron: "0 12 * * *", // Changed to noon
        data: { version: 2 },
      });

      const schedules = await scheduler.list();
      expect(schedules).toHaveLength(1);
      expect(schedules[0].cron).toBe("0 12 * * *");
      expect(schedules[0].data).toEqual({ version: 2 });
    });

    it("should create schedule with enabled: false without activating", async () => {
      scheduler = harness.createScheduler();
      await scheduler.start();

      await scheduler.upsert({
        key: "disabled-schedule",
        name: "scheduled-queue",
        cron: "* * * * * *", // Every second
        data: { type: "disabled" },
        enabled: false,
      });

      const schedules = await scheduler.list();
      expect(schedules).toHaveLength(1);
      expect(schedules[0].enabled).toBe(false);
    });
  });

  describe("remove", () => {
    it("should remove an existing schedule", async () => {
      scheduler = harness.createScheduler();
      await scheduler.start();

      await scheduler.upsert({
        key: "to-remove",
        name: "scheduled-queue",
        cron: "0 0 * * *",
        data: {},
      });

      let schedules = await scheduler.list();
      expect(schedules).toHaveLength(1);

      const removed = await scheduler.remove("to-remove");
      expect(removed).toBe(true);

      schedules = await scheduler.list();
      expect(schedules).toHaveLength(0);
    });

    it("should return false when removing non-existent schedule", async () => {
      scheduler = harness.createScheduler();
      await scheduler.start();

      const removed = await scheduler.remove("non-existent");
      expect(removed).toBe(false);
    });
  });

  describe("list", () => {
    it("should list all schedules", async () => {
      scheduler = harness.createScheduler();
      await scheduler.start();

      await scheduler.upsert({
        key: "schedule-1",
        name: "queue-a",
        cron: "0 0 * * *",
        data: {},
      });
      await scheduler.upsert({
        key: "schedule-2",
        name: "queue-b",
        cron: "0 12 * * *",
        data: {},
      });
      await scheduler.upsert({
        key: "schedule-3",
        name: "queue-a",
        cron: "0 6 * * *",
        data: {},
      });

      const all = await scheduler.list();
      expect(all).toHaveLength(3);
    });

    it("should filter by queue name", async () => {
      scheduler = harness.createScheduler();
      await scheduler.start();

      await scheduler.upsert({
        key: "schedule-1",
        name: "queue-a",
        cron: "0 0 * * *",
        data: {},
      });
      await scheduler.upsert({
        key: "schedule-2",
        name: "queue-b",
        cron: "0 12 * * *",
        data: {},
      });

      const filtered = await scheduler.list("queue-a");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].key).toBe("schedule-1");
    });

    it("should return empty array when no schedules", async () => {
      scheduler = harness.createScheduler();
      await scheduler.start();

      const schedules = await scheduler.list();
      expect(schedules).toEqual([]);
    });
  });

  describe("setEnabled", () => {
    it("should disable an active schedule", async () => {
      scheduler = harness.createScheduler();
      await scheduler.start();

      await scheduler.upsert({
        key: "toggle-schedule",
        name: "scheduled-queue",
        cron: "0 0 * * *",
        data: {},
        enabled: true,
      });

      await scheduler.setEnabled("toggle-schedule", false);

      const schedules = await scheduler.list();
      expect(schedules[0].enabled).toBe(false);
    });

    it("should enable a disabled schedule", async () => {
      scheduler = harness.createScheduler();
      await scheduler.start();

      await scheduler.upsert({
        key: "toggle-schedule",
        name: "scheduled-queue",
        cron: "0 0 * * *",
        data: {},
        enabled: false,
      });

      await scheduler.setEnabled("toggle-schedule", true);

      const schedules = await scheduler.list();
      expect(schedules[0].enabled).toBe(true);
    });

    it("should throw when schedule not found", async () => {
      scheduler = harness.createScheduler();
      await scheduler.start();

      await expect(
        scheduler.setEnabled("non-existent", true),
      ).rejects.toThrow("Schedule not found");
    });
  });

  describe("job creation", () => {
    it("should trigger jobs according to schedule", async () => {
      const processedJobs: unknown[] = [];

      // Create worker first
      worker = harness.createWorker("scheduled-queue", async (ctx) => {
        processedJobs.push(ctx.job.data);
      });
      await worker.start();

      // Create scheduler with every-second cron
      scheduler = harness.createScheduler();
      await scheduler.start();

      await scheduler.upsert({
        key: "frequent-schedule",
        name: "scheduled-queue",
        cron: "* * * * * *", // Every second (6-field cron)
        data: { scheduled: true },
      });

      // Wait for at least one job to be processed
      await eventually(async () => processedJobs.length >= 1, {
        timeout: 5000,
      });

      expect(processedJobs.length).toBeGreaterThanOrEqual(1);
      expect(processedJobs[0]).toEqual({ scheduled: true });
    });

    it("should not create jobs when schedule is disabled", async () => {
      const processedJobs: unknown[] = [];

      worker = harness.createWorker("scheduled-queue", async (ctx) => {
        processedJobs.push(ctx.job.data);
      });
      await worker.start();

      scheduler = harness.createScheduler();
      await scheduler.start();

      await scheduler.upsert({
        key: "disabled-schedule",
        name: "scheduled-queue",
        cron: "* * * * * *",
        data: { scheduled: true },
        enabled: false,
      });

      // Wait a bit and verify no jobs were created
      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(processedJobs).toHaveLength(0);
    });
  });
});
