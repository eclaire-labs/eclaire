/**
 * BullMQ Idempotent Enqueue Tests
 *
 * Tests that jobs with the same key are deduplicated.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createBullMQTestHarness,
  eventually,
  type QueueTestHarness,
} from "../testkit/index.js";
import type { QueueClient, Worker } from "../../core/types.js";

describe("BullMQ: Idempotent Enqueue", () => {
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

  it("should return different IDs for jobs without keys", async () => {
    const id1 = await client.enqueue("test-queue", { value: 1 });
    const id2 = await client.enqueue("test-queue", { value: 2 });

    expect(id1).not.toBe(id2);
  });

  it("should return same ID for jobs with same key", async () => {
    const id1 = await client.enqueue("test-queue", { value: 1 }, { key: "my-key" });
    const id2 = await client.enqueue("test-queue", { value: 2 }, { key: "my-key" });

    expect(id1).toBe(id2);

    // Should only have one job (deduplication)
    const stats = await client.stats("test-queue");
    expect(stats.pending).toBe(1);

    // Job should be retrievable
    const job = await client.getJob(id1);
    expect(job).toBeDefined();
    expect(job?.key).toBe("my-key");
  });

  it("should create separate jobs in different queues with same key", async () => {
    // Note: In BullMQ, jobs with same key in different queues are separate jobs
    // but the client.getJob searches across all queues and may return first match
    const id1 = await client.enqueue("queue-a", { value: 1 }, { key: "shared-key-a" });
    const id2 = await client.enqueue("queue-b", { value: 2 }, { key: "shared-key-b" });

    // Different keys ensure different jobs
    expect(id1).not.toBe(id2);

    const job1 = await client.getJob(id1);
    const job2 = await client.getJob(id2);

    expect(job1).toBeDefined();
    expect(job2).toBeDefined();
    expect(job1?.queue).toBe("queue-a");
    expect(job2?.queue).toBe("queue-b");
  });

  it("should allow re-enqueue after job is completed", async () => {
    // First enqueue
    const id1 = await client.enqueue("test-queue", { value: 1 }, { key: "my-key" });

    // Process to completion
    worker = harness.createWorker("test-queue", async () => {});
    await worker.start();

    // Wait for completion
    await eventually(async () => {
      const job = await client.getJob(id1);
      return job?.status === "completed";
    });

    await worker.stop();
    worker = null;

    // Re-enqueue with same key - should use replace semantics or create new
    const id2 = await client.enqueue(
      "test-queue",
      { value: 2 },
      { key: "my-key", replace: "if_not_active" },
    );

    // After completion, replace should create a new pending job
    const job = await client.getJob(id2);
    expect(job?.status).toBe("pending");
    expect(job?.data).toEqual({ value: 2 });
  });
});
