import { beforeEach, describe, expect, it, vi } from "vitest";

// ----- Mocks -----

const mockCreateTaskOccurrence = vi.fn();
vi.mock("../../lib/services/task-occurrences.js", () => ({
  createTaskOccurrence: (...args: unknown[]) =>
    mockCreateTaskOccurrence(...args),
}));

const mockEmitOccurrenceQueued = vi.fn();
const mockEmitTaskUpdated = vi.fn();
vi.mock("../../lib/events/task-events.js", () => ({
  emitOccurrenceQueued: (...args: unknown[]) =>
    mockEmitOccurrenceQueued(...args),
  emitTaskUpdated: (...args: unknown[]) => mockEmitTaskUpdated(...args),
}));

const mockGetNextExecutionTime = vi.fn();
vi.mock("../../lib/queue/cron-utils.js", () => ({
  getNextExecutionTime: (...args: unknown[]) =>
    mockGetNextExecutionTime(...args),
}));

const mockSchedulerRemove = vi.fn();
vi.mock("../../lib/queue/scheduler.js", () => ({
  getScheduler: () => Promise.resolve({ remove: mockSchedulerRemove }),
  getRecurringTaskScheduleKey: (taskId: string) => `recurring-task:${taskId}`,
}));

const mockDbQueryTasksFindFirst = vi.fn();
const mockDbUpdateSet = vi.fn().mockReturnThis();
const mockDbUpdateWhere = vi.fn().mockResolvedValue(undefined);

vi.mock("../../db/index.js", () => ({
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
  },
  schema: {
    tasks: { id: "id" },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ type: "eq", a, b }),
}));

vi.mock("../../lib/logger.js", () => ({
  createChildLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import processTaskScheduleTick from "../../workers/jobs/taskScheduleTickProcessor.js";

// ----- Helpers -----

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    job: {
      data: {
        taskId: "task-1",
        userId: "user-1",
        ...overrides,
      },
    },
  };
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    userId: "user-1",
    scheduleType: "recurring",
    scheduleRule: "0 9 * * *",
    timezone: "UTC",
    taskStatus: "open",
    prompt: "Daily summary",
    title: "Daily Report",
    delegateActorId: "agent-1",
    delegateMode: "assist",
    deliveryTargets: null,
    occurrenceCount: 0,
    maxOccurrences: null,
    ...overrides,
  };
}

// ----- Tests -----

describe("taskScheduleTickProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbQueryTasksFindFirst.mockResolvedValue(makeTask());
    mockCreateTaskOccurrence.mockResolvedValue({ id: "occ-new" });
    mockGetNextExecutionTime.mockReturnValue(new Date(Date.now() + 86400000));
  });

  describe("Task Validation", () => {
    it("should skip tick if task not found", async () => {
      mockDbQueryTasksFindFirst.mockResolvedValue(null);

      await processTaskScheduleTick(makeCtx());

      expect(mockCreateTaskOccurrence).not.toHaveBeenCalled();
    });

    it("should skip tick if task is not recurring", async () => {
      mockDbQueryTasksFindFirst.mockResolvedValue(
        makeTask({ scheduleType: "none" }),
      );

      await processTaskScheduleTick(makeCtx());

      expect(mockCreateTaskOccurrence).not.toHaveBeenCalled();
    });

    it("should skip tick if task is blocked (paused)", async () => {
      mockDbQueryTasksFindFirst.mockResolvedValue(
        makeTask({ taskStatus: "blocked" }),
      );

      await processTaskScheduleTick(makeCtx());

      expect(mockCreateTaskOccurrence).not.toHaveBeenCalled();
    });

    it("should skip tick if task is completed", async () => {
      mockDbQueryTasksFindFirst.mockResolvedValue(
        makeTask({ taskStatus: "completed" }),
      );

      await processTaskScheduleTick(makeCtx());

      expect(mockCreateTaskOccurrence).not.toHaveBeenCalled();
    });

    it("should skip tick if task is cancelled", async () => {
      mockDbQueryTasksFindFirst.mockResolvedValue(
        makeTask({ taskStatus: "cancelled" }),
      );

      await processTaskScheduleTick(makeCtx());

      expect(mockCreateTaskOccurrence).not.toHaveBeenCalled();
    });
  });

  describe("Kind Determination", () => {
    it("should use recurring_run kind when agent is delegated", async () => {
      mockDbQueryTasksFindFirst.mockResolvedValue(
        makeTask({
          delegateActorId: "agent-1",
          delegateMode: "assist",
          deliveryTargets: null,
        }),
      );

      await processTaskScheduleTick(makeCtx());

      expect(mockCreateTaskOccurrence).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "recurring_run" }),
      );
    });

    it("should use reminder kind when deliveryTargets has notification_channels and no agent", async () => {
      mockDbQueryTasksFindFirst.mockResolvedValue(
        makeTask({
          delegateActorId: null,
          delegateMode: "manual",
          deliveryTargets: [{ type: "notification_channels" }],
        }),
      );

      await processTaskScheduleTick(makeCtx());

      expect(mockCreateTaskOccurrence).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "reminder" }),
      );
    });

    it("should prefer recurring_run over reminder when both agent and deliveryTargets exist", async () => {
      mockDbQueryTasksFindFirst.mockResolvedValue(
        makeTask({
          delegateActorId: "agent-1",
          delegateMode: "assist",
          deliveryTargets: [{ type: "notification_channels" }],
        }),
      );

      await processTaskScheduleTick(makeCtx());

      expect(mockCreateTaskOccurrence).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "recurring_run" }),
      );
    });
  });

  describe("Occurrence Creation & Task Updates", () => {
    it("should create occurrence and increment count", async () => {
      mockDbQueryTasksFindFirst.mockResolvedValue(
        makeTask({ occurrenceCount: 3 }),
      );

      await processTaskScheduleTick(makeCtx());

      // Occurrence created
      expect(mockCreateTaskOccurrence).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: "task-1",
          userId: "user-1",
          prompt: "Daily summary",
          executorActorId: "agent-1",
        }),
      );

      // SSE event
      expect(mockEmitOccurrenceQueued).toHaveBeenCalledWith(
        "user-1",
        "task-1",
        "occ-new",
      );

      // Task updated with incremented count
      expect(mockDbUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          occurrenceCount: 4,
          latestExecutionStatus: "queued",
        }),
      );
    });

    it("should compute nextOccurrenceAt from schedule rule", async () => {
      const nextTime = new Date(Date.now() + 86400000);
      mockGetNextExecutionTime.mockReturnValue(nextTime);

      await processTaskScheduleTick(makeCtx());

      expect(mockGetNextExecutionTime).toHaveBeenCalledWith(
        "0 9 * * *",
        expect.any(Date),
        "UTC",
      );
      expect(mockDbUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          nextOccurrenceAt: nextTime,
        }),
      );
    });

    it("should use task title when prompt is null", async () => {
      mockDbQueryTasksFindFirst.mockResolvedValue(makeTask({ prompt: null }));

      await processTaskScheduleTick(makeCtx());

      expect(mockCreateTaskOccurrence).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "Daily Report" }),
      );
    });
  });

  describe("maxOccurrences Enforcement", () => {
    it("should remove schedule when maxOccurrences reached", async () => {
      mockDbQueryTasksFindFirst.mockResolvedValue(
        makeTask({
          occurrenceCount: 4,
          maxOccurrences: 5,
        }),
      );

      await processTaskScheduleTick(makeCtx());

      // count goes from 4 -> 5, which equals maxOccurrences
      expect(mockSchedulerRemove).toHaveBeenCalledWith("recurring-task:task-1");
    });

    it("should not remove schedule when below maxOccurrences", async () => {
      mockDbQueryTasksFindFirst.mockResolvedValue(
        makeTask({
          occurrenceCount: 2,
          maxOccurrences: 5,
        }),
      );

      await processTaskScheduleTick(makeCtx());

      expect(mockSchedulerRemove).not.toHaveBeenCalled();
    });

    it("should not check maxOccurrences when it is null (unlimited)", async () => {
      mockDbQueryTasksFindFirst.mockResolvedValue(
        makeTask({
          occurrenceCount: 100,
          maxOccurrences: null,
        }),
      );

      await processTaskScheduleTick(makeCtx());

      expect(mockSchedulerRemove).not.toHaveBeenCalled();
    });
  });
});
