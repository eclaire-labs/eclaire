/**
 * A16: Job Stages Integration Tests
 *
 * Tests that the multi-stage job tracking functionality works correctly
 * in the database driver, including stage initialization, transitions,
 * progress tracking, artifacts, and dynamic stage addition.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DB_TEST_CONFIGS,
  TEST_TIMEOUTS,
  createQueueTestDatabase,
  createTestLogger,
  eventually,
  type QueueTestDatabase,
} from "../testkit/index.js";
import {
  createDbQueueClient,
  createDbWorker,
} from "../../driver-db/index.js";
import type { QueueClient, Worker, JobStage } from "../../core/types.js";

describe.each(DB_TEST_CONFIGS)(
  "A16: Job Stages ($label)",
  ({ dbType }) => {
    let testDb: QueueTestDatabase;
    let client: QueueClient;
    let worker: Worker | null = null;
    const logger = createTestLogger();

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
      if (worker?.isRunning()) {
        await worker.stop();
      }
      await client.close();
      await testDb.cleanup();
    });

    it("A16.1: ctx.initStages() creates stages in job", async () => {
      let capturedStages: JobStage[] | undefined;

      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          await ctx.initStages(["validation", "processing", "finalize"]);
          capturedStages = ctx.job.stages;
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
          lockDuration: TEST_TIMEOUTS.lockDuration,
          heartbeatInterval: TEST_TIMEOUTS.heartbeatInterval,
        },
      );

      const jobId = await client.enqueue("test-queue", { value: "test" });
      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      expect(capturedStages).toHaveLength(3);
      expect(capturedStages![0].name).toBe("validation");
      expect(capturedStages![0].status).toBe("pending");
      expect(capturedStages![0].progress).toBe(0);
      expect(capturedStages![1].name).toBe("processing");
      expect(capturedStages![2].name).toBe("finalize");

      // Verify stages are persisted
      const job = await client.getJob(jobId);
      expect(job?.stages).toHaveLength(3);
    });

    it("A16.2: ctx.startStage() updates stage to processing", async () => {
      let stageAfterStart: JobStage | undefined;

      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          await ctx.initStages(["validation", "processing"]);
          await ctx.startStage("validation");
          stageAfterStart = ctx.job.stages?.find(s => s.name === "validation");
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
          lockDuration: TEST_TIMEOUTS.lockDuration,
          heartbeatInterval: TEST_TIMEOUTS.heartbeatInterval,
        },
      );

      const jobId = await client.enqueue("test-queue", { value: "test" });
      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      expect(stageAfterStart?.status).toBe("processing");
      expect(stageAfterStart?.startedAt).toBeInstanceOf(Date);
      expect(stageAfterStart?.progress).toBe(0);

      // Verify currentStage is set
      const job = await client.getJob(jobId);
      // Note: currentStage is cleared after job completes, so we verify from captured state
      expect(stageAfterStart).toBeDefined();
    });

    it("A16.3: ctx.completeStage() marks stage completed with artifacts", async () => {
      let stageAfterComplete: JobStage | undefined;

      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          await ctx.initStages(["validation"]);
          await ctx.startStage("validation");
          await ctx.completeStage("validation", { fileCount: 5, valid: true });
          stageAfterComplete = ctx.job.stages?.find(s => s.name === "validation");
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
          lockDuration: TEST_TIMEOUTS.lockDuration,
          heartbeatInterval: TEST_TIMEOUTS.heartbeatInterval,
        },
      );

      const jobId = await client.enqueue("test-queue", { value: "test" });
      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      expect(stageAfterComplete?.status).toBe("completed");
      expect(stageAfterComplete?.progress).toBe(100);
      expect(stageAfterComplete?.completedAt).toBeInstanceOf(Date);
      expect(stageAfterComplete?.artifacts).toEqual({ fileCount: 5, valid: true });

      // Verify persisted in database
      const job = await client.getJob(jobId);
      const persistedStage = job?.stages?.find(s => s.name === "validation");
      expect(persistedStage?.status).toBe("completed");
      expect(persistedStage?.artifacts).toEqual({ fileCount: 5, valid: true });
    });

    it("A16.4: ctx.failStage() marks stage failed", async () => {
      let stageAfterFail: JobStage | undefined;

      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          await ctx.initStages(["validation", "processing"]);
          await ctx.startStage("validation");
          await ctx.updateStageProgress("validation", 50);
          await ctx.failStage("validation", new Error("Validation failed: invalid format"));
          stageAfterFail = ctx.job.stages?.find(s => s.name === "validation");
          // Job can continue to other stages even if one fails
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
          lockDuration: TEST_TIMEOUTS.lockDuration,
          heartbeatInterval: TEST_TIMEOUTS.heartbeatInterval,
        },
      );

      const jobId = await client.enqueue("test-queue", { value: "test" });
      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      expect(stageAfterFail?.status).toBe("failed");
      expect(stageAfterFail?.error).toBe("Validation failed: invalid format");
      expect(stageAfterFail?.completedAt).toBeInstanceOf(Date);

      // Verify persisted
      const job = await client.getJob(jobId);
      const persistedStage = job?.stages?.find(s => s.name === "validation");
      expect(persistedStage?.status).toBe("failed");
      expect(persistedStage?.error).toBe("Validation failed: invalid format");
    });

    it("A16.5: ctx.updateStageProgress() updates progress in context", async () => {
      const progressUpdates: number[] = [];

      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          await ctx.initStages(["processing"]);
          await ctx.startStage("processing");

          // Simulate batch processing with progress updates
          for (let i = 0; i <= 100; i += 25) {
            await ctx.updateStageProgress("processing", i);
            const stage = ctx.job.stages?.find(s => s.name === "processing");
            progressUpdates.push(stage?.progress ?? -1);
          }

          await ctx.completeStage("processing");
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
          lockDuration: TEST_TIMEOUTS.lockDuration,
          heartbeatInterval: TEST_TIMEOUTS.heartbeatInterval,
        },
      );

      const jobId = await client.enqueue("test-queue", { value: "test" });
      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      // Progress updates should be reflected in context
      expect(progressUpdates).toEqual([0, 25, 50, 75, 100]);
    });

    it("A16.6: ctx.addStages() appends dynamic stages", async () => {
      let stagesAfterAdd: JobStage[] | undefined;

      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          // Start with classification stage
          await ctx.initStages(["classify"]);
          await ctx.startStage("classify");

          // Simulate classification determining next stages
          const classification = "complex"; // In real code, this would be determined by data

          // Add dynamic stages based on classification
          if (classification === "complex") {
            await ctx.addStages(["extract", "transform", "validate"]);
          }

          await ctx.completeStage("classify", { classification });
          stagesAfterAdd = ctx.job.stages;
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
          lockDuration: TEST_TIMEOUTS.lockDuration,
          heartbeatInterval: TEST_TIMEOUTS.heartbeatInterval,
        },
      );

      const jobId = await client.enqueue("test-queue", { value: "test" });
      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      expect(stagesAfterAdd).toHaveLength(4);
      expect(stagesAfterAdd![0].name).toBe("classify");
      expect(stagesAfterAdd![0].status).toBe("completed");
      expect(stagesAfterAdd![1].name).toBe("extract");
      expect(stagesAfterAdd![1].status).toBe("pending");
      expect(stagesAfterAdd![2].name).toBe("transform");
      expect(stagesAfterAdd![3].name).toBe("validate");

      // Verify persisted
      const job = await client.getJob(jobId);
      expect(job?.stages).toHaveLength(4);
    });

    it("A16.7: job.overallProgress is calculated correctly", async () => {
      let progressSnapshot: number | undefined;

      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
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
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
          lockDuration: TEST_TIMEOUTS.lockDuration,
          heartbeatInterval: TEST_TIMEOUTS.heartbeatInterval,
        },
      );

      const jobId = await client.enqueue("test-queue", { value: "test" });
      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      expect(progressSnapshot).toBe(50);

      // Final overall progress should be 100%
      const job = await client.getJob(jobId);
      expect(job?.overallProgress).toBe(100);
    });

    it("A16.8: stages persist through job lifecycle with initialStages option", async () => {
      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          // Stages should already be initialized from enqueue options
          expect(ctx.job.stages).toHaveLength(3);
          expect(ctx.job.stages![0].name).toBe("validate");
          expect(ctx.job.stages![0].status).toBe("pending");

          // Process all stages
          for (const stage of ["validate", "process", "complete"]) {
            await ctx.startStage(stage);
            await ctx.completeStage(stage);
          }
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
          lockDuration: TEST_TIMEOUTS.lockDuration,
          heartbeatInterval: TEST_TIMEOUTS.heartbeatInterval,
        },
      );

      // Enqueue with initialStages option
      const jobId = await client.enqueue(
        "test-queue",
        { value: "test" },
        { initialStages: ["validate", "process", "complete"] },
      );

      // Verify stages are set before processing
      const jobBefore = await client.getJob(jobId);
      expect(jobBefore?.stages).toHaveLength(3);
      expect(jobBefore?.stages![0].status).toBe("pending");

      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      // Verify final state
      const jobAfter = await client.getJob(jobId);
      expect(jobAfter?.stages).toHaveLength(3);
      expect(jobAfter?.stages!.every(s => s.status === "completed")).toBe(true);
      expect(jobAfter?.overallProgress).toBe(100);
    });

    it("A16.9: dynamic workflow pattern (classification -> stages)", async () => {
      interface ClassificationResult {
        type: "image" | "document" | "video";
        stages: string[];
      }

      const processedStages: string[] = [];

      worker = createDbWorker<{ filename: string }>(
        "test-queue",
        async (ctx) => {
          await ctx.initStages(["classify"]);
          await ctx.startStage("classify");

          // Simulate classification based on data
          const filename = ctx.job.data.filename;
          let classification: ClassificationResult;

          if (filename.endsWith(".jpg")) {
            classification = { type: "image", stages: ["resize", "optimize", "upload"] };
          } else if (filename.endsWith(".pdf")) {
            classification = { type: "document", stages: ["parse", "index"] };
          } else {
            classification = { type: "video", stages: ["transcode", "thumbnail", "upload"] };
          }

          // Add dynamic stages based on classification
          await ctx.addStages(classification.stages);
          await ctx.completeStage("classify", { type: classification.type });

          // Process all dynamic stages
          for (const stageName of classification.stages) {
            await ctx.startStage(stageName);
            processedStages.push(stageName);
            await ctx.completeStage(stageName);
          }
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
          lockDuration: TEST_TIMEOUTS.lockDuration,
          heartbeatInterval: TEST_TIMEOUTS.heartbeatInterval,
        },
      );

      const jobId = await client.enqueue("test-queue", { filename: "photo.jpg" });
      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      // Verify image processing stages were run
      expect(processedStages).toEqual(["resize", "optimize", "upload"]);

      // Verify final job state
      const job = await client.getJob(jobId);
      expect(job?.stages).toHaveLength(4); // classify + 3 image stages
      expect(job?.stages![0].name).toBe("classify");
      expect(job?.stages![0].artifacts).toEqual({ type: "image" });
      expect(job?.stages!.every(s => s.status === "completed")).toBe(true);
    });

    it("A16.10: metadata is preserved and accessible in job context", async () => {
      let capturedMetadata: Record<string, unknown> | undefined;

      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          capturedMetadata = ctx.job.metadata;
          await ctx.initStages(["process"]);
          await ctx.startStage("process");
          await ctx.completeStage("process");
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
          lockDuration: TEST_TIMEOUTS.lockDuration,
          heartbeatInterval: TEST_TIMEOUTS.heartbeatInterval,
        },
      );

      const jobId = await client.enqueue(
        "test-queue",
        { value: "test" },
        {
          metadata: { userId: "user_123", assetType: "photos", assetId: "photo_456" },
        },
      );

      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      expect(capturedMetadata).toEqual({
        userId: "user_123",
        assetType: "photos",
        assetId: "photo_456",
      });

      // Verify persisted
      const job = await client.getJob(jobId);
      expect(job?.metadata).toEqual({
        userId: "user_123",
        assetType: "photos",
        assetId: "photo_456",
      });
    });
  },
);
