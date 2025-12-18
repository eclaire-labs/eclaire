/**
 * BullMQ Scheduler Advanced Tests
 *
 * Tests advanced scheduler options: limit, endDate, immediately.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createBullMQTestHarness,
  eventually,
  sleep,
  type QueueTestHarness,
} from "../testkit/index.js";
import type { Worker, Scheduler } from "../../core/types.js";

describe("BullMQ: Scheduler Advanced", () => {
  let harness: QueueTestHarness;
  let scheduler: Scheduler | null = null;
  let worker: Worker | null = null;

  beforeEach(async () => {
    harness = await createBullMQTestHarness();
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

  describe("limit option", () => {
    it("should stop after specified number of executions", async () => {
      const processedJobs: unknown[] = [];

      worker = harness.createWorker("limited-queue", async (ctx) => {
        processedJobs.push(ctx.job.data);
      });
      await worker.start();

      scheduler = harness.createScheduler();
      await scheduler.start();

      // Schedule with limit of 2 executions
      await scheduler.upsert({
        key: "limited-schedule",
        name: "limited-queue",
        cron: "* * * * * *", // Every second
        data: { limited: true },
        limit: 2,
      });

      // Wait for the limit to be reached
      await eventually(async () => processedJobs.length >= 2, {
        timeout: 5000,
      });

      // Wait a bit more to ensure no additional jobs are created
      await sleep(2000);

      // Should have exactly 2 jobs (or close to it due to timing)
      expect(processedJobs.length).toBeLessThanOrEqual(3); // Allow some tolerance
      expect(processedJobs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("endDate option", () => {
    it("should stop scheduling after endDate", async () => {
      const processedJobs: unknown[] = [];

      worker = harness.createWorker("ending-queue", async (ctx) => {
        processedJobs.push(ctx.job.data);
      });
      await worker.start();

      scheduler = harness.createScheduler();
      await scheduler.start();

      // Schedule with endDate 2 seconds in the future
      const endDate = new Date(Date.now() + 2000);

      await scheduler.upsert({
        key: "ending-schedule",
        name: "ending-queue",
        cron: "* * * * * *", // Every second
        data: { ending: true },
        endDate,
      });

      // Wait for some jobs to process
      await eventually(async () => processedJobs.length >= 1, {
        timeout: 3000,
      });

      // Wait past the endDate
      await sleep(3000);

      const countAtEnd = processedJobs.length;

      // Wait a bit more to ensure no new jobs
      await sleep(1500);

      // Should not have created more jobs after endDate
      expect(processedJobs.length).toBe(countAtEnd);
    });
  });

  describe("immediately option", () => {
    it("should trigger job immediately on upsert", async () => {
      const processedJobs: Array<{ timestamp: number; data: unknown }> = [];

      worker = harness.createWorker("immediate-queue", async (ctx) => {
        processedJobs.push({
          timestamp: Date.now(),
          data: ctx.job.data,
        });
      });
      await worker.start();

      scheduler = harness.createScheduler();
      await scheduler.start();

      const beforeUpsert = Date.now();

      // Schedule with immediately: true
      await scheduler.upsert({
        key: "immediate-schedule",
        name: "immediate-queue",
        cron: "0 0 1 1 *", // January 1st at midnight (won't trigger naturally)
        data: { immediate: true },
        immediately: true,
      });

      // Job should be created immediately
      await eventually(async () => processedJobs.length >= 1, {
        timeout: 2000,
      });

      expect(processedJobs[0].data).toEqual({ immediate: true });

      // Should have been processed quickly after upsert
      const processingDelay = processedJobs[0].timestamp - beforeUpsert;
      expect(processingDelay).toBeLessThan(1000);
    });

    it("should not trigger immediately when option is false", async () => {
      const processedJobs: unknown[] = [];

      worker = harness.createWorker("no-immediate-queue", async (ctx) => {
        processedJobs.push(ctx.job.data);
      });
      await worker.start();

      scheduler = harness.createScheduler();
      await scheduler.start();

      // Schedule without immediately (cron won't trigger in test timeframe)
      await scheduler.upsert({
        key: "not-immediate-schedule",
        name: "no-immediate-queue",
        cron: "0 0 1 1 *", // January 1st at midnight
        data: { notImmediate: true },
        immediately: false,
      });

      // Wait and verify no jobs are created
      await sleep(1500);

      expect(processedJobs).toHaveLength(0);
    });
  });

  describe("combined options", () => {
    it("should support limit + immediately", async () => {
      const processedJobs: unknown[] = [];

      worker = harness.createWorker("combo-queue", async (ctx) => {
        processedJobs.push(ctx.job.data);
      });
      await worker.start();

      scheduler = harness.createScheduler();
      await scheduler.start();

      // Schedule with both immediately and limit
      await scheduler.upsert({
        key: "combo-schedule",
        name: "combo-queue",
        cron: "* * * * * *", // Every second
        data: { combo: true },
        immediately: true,
        limit: 3,
      });

      // Wait for jobs to process (immediate + cron triggers)
      await eventually(async () => processedJobs.length >= 3, {
        timeout: 5000,
      });

      // Wait a bit more to ensure limit is respected
      await sleep(2000);

      // Should have at most limit jobs (immediate counts toward limit)
      expect(processedJobs.length).toBeLessThanOrEqual(4); // Small tolerance
    });

    it("should support endDate + immediately", async () => {
      const processedJobs: Array<{ timestamp: number }> = [];

      worker = harness.createWorker("end-immediate-queue", async () => {
        processedJobs.push({ timestamp: Date.now() });
      });
      await worker.start();

      scheduler = harness.createScheduler();
      await scheduler.start();

      const endDate = new Date(Date.now() + 2000); // 2 seconds from now

      await scheduler.upsert({
        key: "end-immediate-schedule",
        name: "end-immediate-queue",
        cron: "* * * * * *",
        data: {},
        immediately: true,
        endDate,
      });

      // Wait for immediate job
      await eventually(async () => processedJobs.length >= 1, {
        timeout: 1500,
      });

      // Wait past endDate
      await sleep(3000);

      const countAtEnd = processedJobs.length;

      // Wait more to ensure no new jobs
      await sleep(1500);

      expect(processedJobs.length).toBe(countAtEnd);
    });
  });

  describe("job data template", () => {
    it("should pass data to each triggered job", async () => {
      const processedJobs: unknown[] = [];

      worker = harness.createWorker("data-queue", async (ctx) => {
        processedJobs.push(ctx.job.data);
      });
      await worker.start();

      scheduler = harness.createScheduler();
      await scheduler.start();

      const jobData = {
        type: "scheduled",
        config: {
          mode: "batch",
          batchSize: 100,
        },
      };

      await scheduler.upsert({
        key: "data-schedule",
        name: "data-queue",
        cron: "* * * * * *",
        data: jobData,
      });

      await eventually(async () => processedJobs.length >= 2, {
        timeout: 5000,
      });

      // All jobs should have the same data template
      for (const job of processedJobs) {
        expect(job).toEqual(jobData);
      }
    });
  });
});
