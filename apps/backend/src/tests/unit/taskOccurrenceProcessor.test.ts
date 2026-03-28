import { beforeEach, describe, expect, it, vi } from "vitest";

// ----- Mocks -----

const mockGetTaskOccurrenceStatus = vi.fn();
const mockStartTaskOccurrence = vi.fn();
const mockCompleteTaskOccurrence = vi.fn();
const mockFailTaskOccurrence = vi.fn();
const mockSetDeliveryResult = vi.fn();

vi.mock("../../lib/services/task-occurrences.js", () => ({
  getTaskOccurrenceStatus: (...args: unknown[]) =>
    mockGetTaskOccurrenceStatus(...args),
  startTaskOccurrence: (...args: unknown[]) => mockStartTaskOccurrence(...args),
  completeTaskOccurrence: (...args: unknown[]) =>
    mockCompleteTaskOccurrence(...args),
  failTaskOccurrence: (...args: unknown[]) => mockFailTaskOccurrence(...args),
  setDeliveryResult: (...args: unknown[]) => mockSetDeliveryResult(...args),
}));

const mockEmitOccurrenceStarted = vi.fn();
const mockEmitOccurrenceCompleted = vi.fn();
const mockEmitOccurrenceFailed = vi.fn();
const mockEmitTaskStatusChanged = vi.fn();

vi.mock("../../lib/events/task-events.js", () => ({
  emitOccurrenceStarted: (...args: unknown[]) =>
    mockEmitOccurrenceStarted(...args),
  emitOccurrenceCompleted: (...args: unknown[]) =>
    mockEmitOccurrenceCompleted(...args),
  emitOccurrenceFailed: (...args: unknown[]) =>
    mockEmitOccurrenceFailed(...args),
  emitTaskStatusChanged: (...args: unknown[]) =>
    mockEmitTaskStatusChanged(...args),
}));

const mockDbQueryTasksFindFirst = vi.fn();
const mockDbUpdateSet = vi.fn().mockReturnThis();
const mockDbUpdateWhere = vi.fn().mockResolvedValue(undefined);
const mockDbSelectFrom = vi.fn();

vi.mock("../../db/index.js", () => {
  const taskOccurrences = {
    id: "id",
    taskId: "taskId",
    createdAt: "createdAt",
  };
  const tasks = { id: "id" };

  return {
    db: {
      query: {
        tasks: {
          findFirst: (...args: unknown[]) => mockDbQueryTasksFindFirst(...args),
        },
      },
      update: () => ({
        set: (...args: unknown[]) => {
          mockDbUpdateSet(...args);
          return { where: mockDbUpdateWhere };
        },
      }),
      select: () => ({
        from: (...args: unknown[]) => {
          mockDbSelectFrom(...args);
          // Return the latest occurrence for denormalized guard
          return {
            where: () => ({
              orderBy: () => ({
                limit: () => Promise.resolve([{ id: "occ-1" }]),
              }),
            }),
          };
        },
      }),
    },
    schema: { taskOccurrences, tasks },
  };
});

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ type: "eq", a, b }),
  desc: (a: unknown) => ({ type: "desc", a }),
}));

const mockGetNotificationChannels = vi.fn();
vi.mock("../../lib/services/channels.js", () => ({
  getNotificationChannels: (...args: unknown[]) =>
    mockGetNotificationChannels(...args),
}));

const mockChannelSend = vi.fn();
vi.mock("../../lib/channels.js", () => ({
  channelRegistry: {
    has: () => true,
    get: () => ({ send: mockChannelSend }),
  },
}));

const mockProcessPromptRequest = vi.fn();
vi.mock("../../lib/agent/prompt-service.js", () => ({
  processPromptRequest: (...args: unknown[]) =>
    mockProcessPromptRequest(...args),
}));

const mockCreateTaskComment = vi.fn();
vi.mock("../../lib/services/taskComments.js", () => ({
  createTaskComment: (...args: unknown[]) => mockCreateTaskComment(...args),
}));

vi.mock("../../lib/logger.js", () => ({
  createChildLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import processTaskOccurrence from "../../workers/jobs/taskOccurrenceProcessor.js";

// ----- Helpers -----

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    job: {
      data: {
        occurrenceId: "occ-1",
        taskId: "task-1",
        userId: "user-1",
        kind: "manual_run",
        prompt: "Do the thing",
        executorActorId: "agent-1",
        ...overrides,
      },
    },
  };
}

// ----- Tests -----

describe("taskOccurrenceProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTaskOccurrenceStatus.mockResolvedValue("queued");
    mockDbQueryTasksFindFirst.mockResolvedValue({
      title: "Test Task",
      description: "desc",
      prompt: "Do the thing",
      delegateMode: "assist",
      sourceConversationId: null,
      deliveryTargets: null,
    });
    mockProcessPromptRequest.mockResolvedValue({
      response: "Agent output text",
    });
  });

  describe("Idempotency", () => {
    it("should skip if occurrence already processed (not queued)", async () => {
      mockGetTaskOccurrenceStatus.mockResolvedValue("completed");

      await processTaskOccurrence(makeCtx());

      expect(mockStartTaskOccurrence).not.toHaveBeenCalled();
      expect(mockProcessPromptRequest).not.toHaveBeenCalled();
    });

    it("should skip if occurrence is running", async () => {
      mockGetTaskOccurrenceStatus.mockResolvedValue("running");

      await processTaskOccurrence(makeCtx());

      expect(mockStartTaskOccurrence).not.toHaveBeenCalled();
    });

    it("should proceed if occurrence is queued", async () => {
      await processTaskOccurrence(makeCtx());

      expect(mockStartTaskOccurrence).toHaveBeenCalledWith("occ-1");
    });
  });

  describe("Agent Execution — Assist Mode (review gate)", () => {
    it("should execute agent and set needs_review for assist mode", async () => {
      mockDbQueryTasksFindFirst.mockResolvedValue({
        title: "Test",
        description: null,
        prompt: "Do it",
        delegateMode: "assist",
        sourceConversationId: null,
      });

      await processTaskOccurrence(makeCtx());

      // Agent was called
      expect(mockProcessPromptRequest).toHaveBeenCalledOnce();

      // Occurrence completed
      expect(mockCompleteTaskOccurrence).toHaveBeenCalledWith(
        "occ-1",
        "Agent output text",
        expect.any(String),
      );

      // Comment posted
      expect(mockCreateTaskComment).toHaveBeenCalledWith(
        { taskId: "task-1", content: "Agent output text" },
        expect.objectContaining({ actor: "agent" }),
      );

      // Denormalized update sets needs_review
      expect(mockDbUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewStatus: "pending",
          attentionStatus: "needs_review",
        }),
      );

      // SSE events emitted
      expect(mockEmitOccurrenceStarted).toHaveBeenCalledWith(
        "user-1",
        "task-1",
        "occ-1",
      );
      expect(mockEmitOccurrenceCompleted).toHaveBeenCalled();
      expect(mockEmitTaskStatusChanged).toHaveBeenCalledWith(
        "user-1",
        "task-1",
        expect.objectContaining({ attentionStatus: "needs_review" }),
      );
    });
  });

  describe("Agent Execution — Handle Mode (auto-complete)", () => {
    it("should auto-complete task without review gate for handle mode", async () => {
      mockDbQueryTasksFindFirst.mockResolvedValue({
        title: "Auto task",
        description: null,
        prompt: "Run this",
        delegateMode: "handle",
        sourceConversationId: null,
      });

      await processTaskOccurrence(makeCtx());

      // Denormalized update sets completed, NOT needs_review
      expect(mockDbUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          taskStatus: "completed",
          completedAt: expect.any(Date),
        }),
      );

      // Should NOT set needs_review
      const updateCalls = mockDbUpdateSet.mock.calls;
      const completionCall = updateCalls.find(
        (c: Record<string, unknown>[]) => c[0].taskStatus === "completed",
      );
      expect(completionCall).toBeDefined();
      expect(completionCall[0]).not.toHaveProperty("reviewStatus", "pending");

      // SSE: taskStatus changed to completed
      expect(mockEmitTaskStatusChanged).toHaveBeenCalledWith(
        "user-1",
        "task-1",
        expect.objectContaining({ taskStatus: "completed" }),
      );
    });
  });

  describe("Error Handling", () => {
    it("should mark occurrence as failed on agent error", async () => {
      mockProcessPromptRequest.mockRejectedValue(
        new Error("Model unavailable"),
      );

      await processTaskOccurrence(makeCtx());

      expect(mockFailTaskOccurrence).toHaveBeenCalledWith(
        "occ-1",
        "Model unavailable",
      );

      // Denormalized update sets failed + attention
      expect(mockDbUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          latestExecutionStatus: "failed",
          attentionStatus: "failed",
        }),
      );

      // SSE events
      expect(mockEmitOccurrenceFailed).toHaveBeenCalledWith(
        "user-1",
        "task-1",
        "occ-1",
        "Model unavailable",
      );
      expect(mockEmitTaskStatusChanged).toHaveBeenCalledWith(
        "user-1",
        "task-1",
        expect.objectContaining({ attentionStatus: "failed" }),
      );
    });

    it("should handle non-Error thrown objects", async () => {
      mockProcessPromptRequest.mockRejectedValue("string error");

      await processTaskOccurrence(makeCtx());

      expect(mockFailTaskOccurrence).toHaveBeenCalledWith(
        "occ-1",
        "Unknown error",
      );
    });
  });

  describe("Reminder Path", () => {
    it("should deliver reminder via notification channels", async () => {
      mockDbQueryTasksFindFirst.mockResolvedValue({
        title: "Reminder Task",
        deliveryTargets: [{ type: "notification_channels" }],
        sourceConversationId: null,
      });
      mockGetNotificationChannels.mockResolvedValue([
        { name: "telegram", platform: "telegram" },
      ]);
      mockChannelSend.mockResolvedValue({ success: true });

      await processTaskOccurrence(makeCtx({ kind: "reminder" }));

      expect(mockGetNotificationChannels).toHaveBeenCalledWith(
        "user-1",
        undefined,
      );
      expect(mockChannelSend).toHaveBeenCalled();
      expect(mockSetDeliveryResult).toHaveBeenCalledWith(
        "occ-1",
        expect.objectContaining({
          successCount: 1,
          totalCount: 1,
        }),
      );
      expect(mockCompleteTaskOccurrence).toHaveBeenCalled();
    });

    it("should set needs_triage when no channels configured", async () => {
      mockDbQueryTasksFindFirst.mockResolvedValue({
        title: "No channels",
        deliveryTargets: null,
        sourceConversationId: null,
      });
      mockGetNotificationChannels.mockResolvedValue([]);

      await processTaskOccurrence(makeCtx({ kind: "reminder" }));

      // Still completes the occurrence
      expect(mockCompleteTaskOccurrence).toHaveBeenCalled();

      // Sets needs_triage to surface in inbox
      expect(mockDbUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          attentionStatus: "needs_triage",
        }),
      );
    });
  });

  describe("Prompt Resolution", () => {
    it("should use occurrence prompt when provided", async () => {
      await processTaskOccurrence(
        makeCtx({ prompt: "Custom occurrence prompt" }),
      );

      expect(mockProcessPromptRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "Custom occurrence prompt",
        }),
      );
    });

    it("should fall back to task prompt when occurrence prompt is empty", async () => {
      mockDbQueryTasksFindFirst.mockResolvedValue({
        title: "Fallback",
        description: null,
        prompt: "Task-level prompt",
        delegateMode: "assist",
        sourceConversationId: null,
      });

      await processTaskOccurrence(makeCtx({ prompt: "" }));

      expect(mockProcessPromptRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "Task-level prompt",
        }),
      );
    });

    it("should fall back to title when both prompts are empty", async () => {
      mockDbQueryTasksFindFirst.mockResolvedValue({
        title: "My Task Title",
        description: null,
        prompt: null,
        delegateMode: "assist",
        sourceConversationId: null,
      });

      await processTaskOccurrence(makeCtx({ prompt: "" }));

      expect(mockProcessPromptRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "Work on the task: My Task Title",
        }),
      );
    });
  });
});
