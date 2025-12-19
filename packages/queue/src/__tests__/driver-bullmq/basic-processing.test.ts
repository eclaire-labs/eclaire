/**
 * BullMQ Basic Processing Tests
 *
 * Tests that a job can be enqueued and processed by a worker.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createBullMQTestHarness,
  eventually,
  type QueueTestHarness,
} from "../testkit/index.js";
import type { QueueClient, Worker, Job } from "../../core/types.js";

describe("BullMQ: Basic Processing", () => {
  let harness: QueueTestHarness;
  let client: QueueClient;
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
    await harness.cleanup();
  });

  it("should enqueue a job and return a job ID", async () => {
    const jobId = await client.enqueue("test-queue", { value: 42 });

    expect(jobId).toBeDefined();
    expect(typeof jobId).toBe("string");
    expect(jobId.length).toBeGreaterThan(0);

    // Job should be retrievable
    const job = await client.getJob(jobId);
    expect(job).toBeDefined();
    expect(job?.id).toBe(jobId);
    expect(job?.queue).toBe("test-queue");
    expect(job?.data).toEqual({ value: 42 });
  });

  it("should have attempts=0 for pending job", async () => {
    const jobId = await client.enqueue("test-queue", { value: 1 });

    const job = await client.getJob(jobId);
    expect(job?.status).toBe("pending");
    expect(job?.attempts).toBe(0);
  });

  it("should process a single job through a worker", async () => {
    const processed: Job[] = [];

    // Enqueue job BEFORE starting worker to avoid race condition
    const jobId = await client.enqueue("test-queue", { value: 42 });

    worker = harness.createWorker("test-queue", async (ctx) => {
      processed.push(ctx.job);
    });

    await worker.start();

    // Wait for job to complete
    await eventually(async () => {
      const job = await client.getJob(jobId);
      return job?.status === "completed";
    });

    expect(processed).toHaveLength(1);
    expect(processed[0].data).toEqual({ value: 42 });
    expect(processed[0].id).toBe(jobId);
  });

  it("should set job status to completed after successful processing", async () => {
    // Enqueue job BEFORE starting worker
    const jobId = await client.enqueue("test-queue", { value: 1 });

    worker = harness.createWorker("test-queue", async () => {
      // Do nothing - just complete successfully
    });

    await worker.start();

    await eventually(async () => {
      const job = await client.getJob(jobId);
      return job?.status === "completed";
    });

    const job = await client.getJob(jobId);
    expect(job?.status).toBe("completed");
    // BullMQ may count attempts differently with stalled job detection
    expect(job?.attempts).toBeGreaterThanOrEqual(1);
  });

  it("should process multiple jobs in order", async () => {
    const processedOrder: number[] = [];

    // Enqueue jobs BEFORE starting worker
    const job1 = await client.enqueue("test-queue", { order: 1 });
    const job2 = await client.enqueue("test-queue", { order: 2 });
    const job3 = await client.enqueue("test-queue", { order: 3 });

    worker = harness.createWorker("test-queue", async (ctx) => {
      processedOrder.push((ctx.job.data as { order: number }).order);
    });

    await worker.start();

    // Wait for all jobs to complete
    await eventually(async () => {
      const j1 = await client.getJob(job1);
      const j2 = await client.getJob(job2);
      const j3 = await client.getJob(job3);
      return (
        j1?.status === "completed" &&
        j2?.status === "completed" &&
        j3?.status === "completed"
      );
    });

    expect(processedOrder).toHaveLength(3);
    // FIFO order for same priority
    expect(processedOrder).toEqual([1, 2, 3]);
  });

  it("should provide job context with heartbeat and log methods", async () => {
    let receivedCtx: any = null;

    // Enqueue job BEFORE starting worker
    const jobId = await client.enqueue("test-queue", { value: 1 });

    worker = harness.createWorker("test-queue", async (ctx) => {
      receivedCtx = ctx;
      ctx.log("Test log message");
      await ctx.heartbeat();
      ctx.progress(50);
    });

    await worker.start();

    await eventually(async () => {
      const job = await client.getJob(jobId);
      return job?.status === "completed";
    });

    expect(receivedCtx).toBeDefined();
    expect(receivedCtx.job).toBeDefined();
    expect(typeof receivedCtx.heartbeat).toBe("function");
    expect(typeof receivedCtx.log).toBe("function");
    expect(typeof receivedCtx.progress).toBe("function");
  });
});
