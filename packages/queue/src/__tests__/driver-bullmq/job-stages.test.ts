/**
 * BullMQ: Job Stages Integration Tests
 *
 * Tests that the multi-stage job tracking functionality works correctly
 * in the BullMQ driver, including stage initialization, transitions,
 * progress tracking, artifacts, and dynamic stage addition.
 *
 * Note: BullMQ stores stages in job.data as __stages, __currentStage, __metadata
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createBullMQTestHarness,
  eventually,
  createDeferred,
  type QueueTestHarness,
} from "../testkit/index.js";
import type { QueueClient, Worker, JobStage } from "../../core/types.js";

describe("BullMQ: Job Stages", () => {
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

  it("ctx.initStages() creates stages in job", async () => {
    let capturedStages: JobStage[] | undefined;
    const done = createDeferred<void>();

    const jobId = await client.enqueue("test-queue", { value: "test" });

    worker = harness.createWorker("test-queue", async (ctx) => {
      await ctx.initStages(["validation", "processing", "finalize"]);
      capturedStages = ctx.job.stages;
      done.resolve();
    });
    await worker.start();

    await done.promise;

    expect(capturedStages).toHaveLength(3);
    expect(capturedStages![0].name).toBe("validation");
    expect(capturedStages![0].status).toBe("pending");
    expect(capturedStages![0].progress).toBe(0);
    expect(capturedStages![1].name).toBe("processing");
    expect(capturedStages![2].name).toBe("finalize");
  });

  it("ctx.startStage() updates stage to processing", async () => {
    let stageAfterStart: JobStage | undefined;
    const done = createDeferred<void>();

    await client.enqueue("test-queue", { value: "test" });

    worker = harness.createWorker("test-queue", async (ctx) => {
      await ctx.initStages(["validation", "processing"]);
      await ctx.startStage("validation");
      stageAfterStart = ctx.job.stages?.find((s) => s.name === "validation");
      done.resolve();
    });
    await worker.start();

    await done.promise;

    expect(stageAfterStart?.status).toBe("processing");
    expect(stageAfterStart?.startedAt).toBeInstanceOf(Date);
    expect(stageAfterStart?.progress).toBe(0);
  });

  it("ctx.completeStage() marks stage completed with artifacts", async () => {
    let stageAfterComplete: JobStage | undefined;
    const done = createDeferred<void>();

    await client.enqueue("test-queue", { value: "test" });

    worker = harness.createWorker("test-queue", async (ctx) => {
      await ctx.initStages(["validation"]);
      await ctx.startStage("validation");
      await ctx.completeStage("validation", { fileCount: 5, valid: true });
      stageAfterComplete = ctx.job.stages?.find((s) => s.name === "validation");
      done.resolve();
    });
    await worker.start();

    await done.promise;

    expect(stageAfterComplete?.status).toBe("completed");
    expect(stageAfterComplete?.progress).toBe(100);
    expect(stageAfterComplete?.completedAt).toBeInstanceOf(Date);
    expect(stageAfterComplete?.artifacts).toEqual({ fileCount: 5, valid: true });
  });

  it("ctx.failStage() marks stage failed", async () => {
    let stageAfterFail: JobStage | undefined;
    const done = createDeferred<void>();

    await client.enqueue("test-queue", { value: "test" });

    worker = harness.createWorker("test-queue", async (ctx) => {
      await ctx.initStages(["validation", "processing"]);
      await ctx.startStage("validation");
      await ctx.updateStageProgress("validation", 50);
      await ctx.failStage("validation", new Error("Validation failed: invalid format"));
      stageAfterFail = ctx.job.stages?.find((s) => s.name === "validation");
      done.resolve();
    });
    await worker.start();

    await done.promise;

    expect(stageAfterFail?.status).toBe("failed");
    expect(stageAfterFail?.error).toBe("Validation failed: invalid format");
    expect(stageAfterFail?.completedAt).toBeInstanceOf(Date);
  });

  it("ctx.updateStageProgress() updates progress in context", async () => {
    const progressUpdates: number[] = [];
    const done = createDeferred<void>();

    await client.enqueue("test-queue", { value: "test" });

    worker = harness.createWorker("test-queue", async (ctx) => {
      await ctx.initStages(["processing"]);
      await ctx.startStage("processing");

      // Simulate batch processing with progress updates
      for (let i = 0; i <= 100; i += 25) {
        await ctx.updateStageProgress("processing", i);
        const stage = ctx.job.stages?.find((s) => s.name === "processing");
        progressUpdates.push(stage?.progress ?? -1);
      }

      await ctx.completeStage("processing");
      done.resolve();
    });
    await worker.start();

    await done.promise;

    expect(progressUpdates).toEqual([0, 25, 50, 75, 100]);
  });

  it("ctx.addStages() appends dynamic stages", async () => {
    let stagesAfterAdd: JobStage[] | undefined;
    const done = createDeferred<void>();

    await client.enqueue("test-queue", { value: "test" });

    worker = harness.createWorker("test-queue", async (ctx) => {
      // Start with classification stage
      await ctx.initStages(["classify"]);
      await ctx.startStage("classify");

      // Add dynamic stages based on classification
      await ctx.addStages(["extract", "transform", "validate"]);
      await ctx.completeStage("classify", { classification: "complex" });

      stagesAfterAdd = ctx.job.stages;
      done.resolve();
    });
    await worker.start();

    await done.promise;

    expect(stagesAfterAdd).toHaveLength(4);
    expect(stagesAfterAdd![0].name).toBe("classify");
    expect(stagesAfterAdd![0].status).toBe("completed");
    expect(stagesAfterAdd![1].name).toBe("extract");
    expect(stagesAfterAdd![1].status).toBe("pending");
    expect(stagesAfterAdd![2].name).toBe("transform");
    expect(stagesAfterAdd![3].name).toBe("validate");
  });

  it("job.overallProgress is calculated correctly", async () => {
    let progressSnapshot: number | undefined;
    const done = createDeferred<void>();

    await client.enqueue("test-queue", { value: "test" });

    worker = harness.createWorker("test-queue", async (ctx) => {
      await ctx.initStages(["a", "b", "c"]);

      // Complete first stage (100%)
      await ctx.startStage("a");
      await ctx.completeStage("a");

      // Start second stage at 50%
      await ctx.startStage("b");
      await ctx.updateStageProgress("b", 50);

      // Third stage is still pending (0%)
      // Overall: (100 + 50 + 0) / 3 = 50%
      progressSnapshot = ctx.job.overallProgress;

      await ctx.completeStage("b");
      await ctx.startStage("c");
      await ctx.completeStage("c");
      done.resolve();
    });
    await worker.start();

    await done.promise;

    expect(progressSnapshot).toBe(50);
  });

  it("stages persist through job lifecycle with initialStages option", async () => {
    let initialStagesInContext: JobStage[] | undefined;
    let finalStages: JobStage[] | undefined;
    const done = createDeferred<void>();

    // Enqueue with initialStages option
    await client.enqueue(
      "test-queue",
      { value: "test" },
      { initialStages: ["validate", "process", "complete"] }
    );

    worker = harness.createWorker("test-queue", async (ctx) => {
      // Stages should already be initialized from enqueue options
      initialStagesInContext = ctx.job.stages;

      // Process all stages
      for (const stage of ["validate", "process", "complete"]) {
        await ctx.startStage(stage);
        await ctx.completeStage(stage);
      }

      finalStages = ctx.job.stages;
      done.resolve();
    });
    await worker.start();

    await done.promise;

    expect(initialStagesInContext).toHaveLength(3);
    expect(initialStagesInContext![0].name).toBe("validate");
    expect(initialStagesInContext![0].status).toBe("pending");

    expect(finalStages).toHaveLength(3);
    expect(finalStages!.every((s) => s.status === "completed")).toBe(true);
  });

  it("dynamic workflow pattern (classification -> stages)", async () => {
    const processedStages: string[] = [];
    const done = createDeferred<void>();

    await client.enqueue("test-queue", { filename: "photo.jpg" });

    worker = harness.createWorker<{ filename: string }>("test-queue", async (ctx) => {
      await ctx.initStages(["classify"]);
      await ctx.startStage("classify");

      // Simulate classification based on data
      const filename = ctx.job.data.filename;
      let stages: string[];

      if (filename.endsWith(".jpg")) {
        stages = ["resize", "optimize", "upload"];
      } else if (filename.endsWith(".pdf")) {
        stages = ["parse", "index"];
      } else {
        stages = ["transcode", "thumbnail", "upload"];
      }

      // Add dynamic stages based on classification
      await ctx.addStages(stages);
      await ctx.completeStage("classify", { type: "image" });

      // Process all dynamic stages
      for (const stageName of stages) {
        await ctx.startStage(stageName);
        processedStages.push(stageName);
        await ctx.completeStage(stageName);
      }
      done.resolve();
    });
    await worker.start();

    await done.promise;

    // Verify image processing stages were run
    expect(processedStages).toEqual(["resize", "optimize", "upload"]);
  });

  it("metadata is preserved and accessible in job context", async () => {
    let capturedMetadata: Record<string, unknown> | undefined;
    const done = createDeferred<void>();

    await client.enqueue(
      "test-queue",
      { value: "test" },
      { metadata: { userId: "user_123", assetType: "photos", assetId: "photo_456" } }
    );

    worker = harness.createWorker("test-queue", async (ctx) => {
      capturedMetadata = ctx.job.metadata;
      await ctx.initStages(["process"]);
      await ctx.startStage("process");
      await ctx.completeStage("process");
      done.resolve();
    });
    await worker.start();

    await done.promise;

    expect(capturedMetadata).toEqual({
      userId: "user_123",
      assetType: "photos",
      assetId: "photo_456",
    });
  });
});
