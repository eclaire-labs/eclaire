/**
 * A17: Job Stage Event Callbacks
 *
 * Tests that event callbacks (onStageStart, onStageProgress, onStageComplete,
 * onStageFail, onJobComplete, onJobFail) are triggered correctly during
 * stage transitions.
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
import type { QueueClient, Worker, JobEventCallbacks } from "../../core/types.js";

interface CallbackCall {
  type: string;
  jobId: string;
  stage?: string;
  percent?: number;
  artifacts?: Record<string, unknown>;
  error?: string;
  metadata?: Record<string, unknown>;
}

describe.each(DB_TEST_CONFIGS)(
  "A17: Job Stage Callbacks ($label)",
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

    it("A17.1: onStageStart is called when stage starts", async () => {
      const calls: CallbackCall[] = [];

      const eventCallbacks: JobEventCallbacks = {
        onStageStart: (jobId, stage, metadata) => {
          calls.push({ type: "stageStart", jobId, stage, metadata });
        },
      };

      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          await ctx.initStages(["validation", "processing"]);
          await ctx.startStage("validation");
          await ctx.completeStage("validation");
          await ctx.startStage("processing");
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
          eventCallbacks,
        },
      );

      const jobId = await client.enqueue("test-queue", { value: "test" });
      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      const stageStartCalls = calls.filter((c) => c.type === "stageStart");
      expect(stageStartCalls).toHaveLength(2);
      expect(stageStartCalls[0].stage).toBe("validation");
      expect(stageStartCalls[0].jobId).toBe(jobId);
      expect(stageStartCalls[1].stage).toBe("processing");
    });

    it("A17.2: onStageProgress is called on progress update", async () => {
      const calls: CallbackCall[] = [];

      const eventCallbacks: JobEventCallbacks = {
        onStageProgress: (jobId, stage, percent, metadata) => {
          calls.push({ type: "stageProgress", jobId, stage, percent, metadata });
        },
      };

      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          await ctx.initStages(["processing"]);
          await ctx.startStage("processing");
          await ctx.updateStageProgress("processing", 25);
          await ctx.updateStageProgress("processing", 50);
          await ctx.updateStageProgress("processing", 75);
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
          eventCallbacks,
        },
      );

      const jobId = await client.enqueue("test-queue", { value: "test" });
      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      const progressCalls = calls.filter((c) => c.type === "stageProgress");
      expect(progressCalls).toHaveLength(3);
      expect(progressCalls[0].percent).toBe(25);
      expect(progressCalls[1].percent).toBe(50);
      expect(progressCalls[2].percent).toBe(75);
      expect(progressCalls[0].stage).toBe("processing");
    });

    it("A17.3: onStageComplete is called with artifacts", async () => {
      const calls: CallbackCall[] = [];

      const eventCallbacks: JobEventCallbacks = {
        onStageComplete: (jobId, stage, artifacts, metadata) => {
          calls.push({ type: "stageComplete", jobId, stage, artifacts, metadata });
        },
      };

      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          await ctx.initStages(["validation", "processing"]);
          await ctx.startStage("validation");
          await ctx.completeStage("validation", { fileCount: 10, valid: true });
          await ctx.startStage("processing");
          await ctx.completeStage("processing", { outputPath: "/tmp/output.json" });
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
          lockDuration: TEST_TIMEOUTS.lockDuration,
          heartbeatInterval: TEST_TIMEOUTS.heartbeatInterval,
          eventCallbacks,
        },
      );

      const jobId = await client.enqueue("test-queue", { value: "test" });
      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      const completeCalls = calls.filter((c) => c.type === "stageComplete");
      expect(completeCalls).toHaveLength(2);
      expect(completeCalls[0].stage).toBe("validation");
      expect(completeCalls[0].artifacts).toEqual({ fileCount: 10, valid: true });
      expect(completeCalls[1].stage).toBe("processing");
      expect(completeCalls[1].artifacts).toEqual({ outputPath: "/tmp/output.json" });
    });

    it("A17.4: onStageFail is called with error", async () => {
      const calls: CallbackCall[] = [];

      const eventCallbacks: JobEventCallbacks = {
        onStageFail: (jobId, stage, error, metadata) => {
          calls.push({ type: "stageFail", jobId, stage, error, metadata });
        },
      };

      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          await ctx.initStages(["validation"]);
          await ctx.startStage("validation");
          await ctx.failStage("validation", new Error("Invalid file format"));
          // Job can still complete even with a failed stage
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
          lockDuration: TEST_TIMEOUTS.lockDuration,
          heartbeatInterval: TEST_TIMEOUTS.heartbeatInterval,
          eventCallbacks,
        },
      );

      const jobId = await client.enqueue("test-queue", { value: "test" });
      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      const failCalls = calls.filter((c) => c.type === "stageFail");
      expect(failCalls).toHaveLength(1);
      expect(failCalls[0].stage).toBe("validation");
      expect(failCalls[0].error).toBe("Invalid file format");
      expect(failCalls[0].jobId).toBe(jobId);
    });

    it("A17.5: metadata is passed through all callbacks", async () => {
      const calls: CallbackCall[] = [];

      const eventCallbacks: JobEventCallbacks = {
        onStageStart: (jobId, stage, metadata) => {
          calls.push({ type: "stageStart", jobId, stage, metadata });
        },
        onStageProgress: (jobId, stage, percent, metadata) => {
          calls.push({ type: "stageProgress", jobId, stage, percent, metadata });
        },
        onStageComplete: (jobId, stage, artifacts, metadata) => {
          calls.push({ type: "stageComplete", jobId, stage, artifacts, metadata });
        },
        onJobComplete: (jobId, metadata) => {
          calls.push({ type: "jobComplete", jobId, metadata });
        },
      };

      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
          await ctx.initStages(["process"]);
          await ctx.startStage("process");
          await ctx.updateStageProgress("process", 50);
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
          eventCallbacks,
        },
      );

      const jobId = await client.enqueue(
        "test-queue",
        { value: "test" },
        { metadata: { userId: "user_123", assetType: "photos", assetId: "photo_456" } },
      );
      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      // All callbacks should have received the metadata
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call.metadata).toEqual({
          userId: "user_123",
          assetType: "photos",
          assetId: "photo_456",
        });
      }
    });

    it("A17.6: onJobComplete is called when job finishes successfully", async () => {
      const calls: CallbackCall[] = [];

      const eventCallbacks: JobEventCallbacks = {
        onJobComplete: (jobId, metadata) => {
          calls.push({ type: "jobComplete", jobId, metadata });
        },
      };

      worker = createDbWorker(
        "test-queue",
        async (ctx) => {
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
          eventCallbacks,
        },
      );

      const jobId = await client.enqueue("test-queue", { value: "test" });
      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "completed";
      });

      const completeCalls = calls.filter((c) => c.type === "jobComplete");
      expect(completeCalls).toHaveLength(1);
      expect(completeCalls[0].jobId).toBe(jobId);
    });

    it("A17.7: onJobFail is called when job fails", async () => {
      const calls: CallbackCall[] = [];

      const eventCallbacks: JobEventCallbacks = {
        onJobFail: (jobId, error, metadata) => {
          calls.push({ type: "jobFail", jobId, error, metadata });
        },
      };

      worker = createDbWorker(
        "test-queue",
        async () => {
          throw new Error("Processing failed unexpectedly");
        },
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
          lockDuration: TEST_TIMEOUTS.lockDuration,
          heartbeatInterval: TEST_TIMEOUTS.heartbeatInterval,
          eventCallbacks,
        },
      );

      const jobId = await client.enqueue(
        "test-queue",
        { value: "test" },
        { attempts: 1 }, // Only 1 attempt so it fails immediately
      );
      await worker.start();

      await eventually(async () => {
        const job = await client.getJob(jobId);
        return job?.status === "failed";
      });

      const failCalls = calls.filter((c) => c.type === "jobFail");
      expect(failCalls).toHaveLength(1);
      expect(failCalls[0].jobId).toBe(jobId);
      expect(failCalls[0].error).toBe("Processing failed unexpectedly");
    });
  },
);
