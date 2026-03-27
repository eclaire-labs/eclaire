// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

import { toast } from "sonner";
import { transformTaskData, useTask, useTasks } from "@/hooks/use-tasks";
import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function mockJsonResponse(data: unknown) {
  return {
    json: () => Promise.resolve(data),
    ok: true,
    status: 200,
  } as unknown as Response;
}

const fullRawTask = {
  id: "task-1",
  userId: "user-1",
  title: "Test Task",
  description: "A description",
  prompt: null,
  taskStatus: "open",
  dueAt: "2026-04-01",
  delegateActorId: "user-2",
  delegateMode: "manual",
  delegatedByActorId: null,
  attentionStatus: "none",
  reviewStatus: "none",
  scheduleType: "none",
  scheduleRule: null,
  scheduleSummary: null,
  timezone: null,
  nextOccurrenceAt: null,
  maxOccurrences: null,
  occurrenceCount: 0,
  latestExecutionStatus: null,
  latestResultSummary: null,
  latestErrorSummary: null,
  deliveryTargets: null,
  sourceConversationId: null,
  tags: ["frontend", "bug"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  processingStatus: "completed",
  flagColor: "red",
  isPinned: true,
  processingEnabled: true,
  priority: 0,
  parentId: null,
  sortOrder: 0,
  completedAt: null,
};

describe("transformTaskData", () => {
  it("passes through all fields from a full raw task", () => {
    const result = transformTaskData(fullRawTask);
    expect(result.id).toBe("task-1");
    expect(result.title).toBe("Test Task");
    expect(result.taskStatus).toBe("open");
    expect(result.delegateActorId).toBe("user-2");
    expect(result.delegateMode).toBe("manual");
    expect(result.tags).toEqual(["frontend", "bug"]);
    expect(result.isPinned).toBe(true);
    expect(result.flagColor).toBe("red");
  });

  it("defaults missing fields to safe values", () => {
    const result = transformTaskData({ id: "task-2", title: "Minimal" });
    expect(result.taskStatus).toBe("open");
    expect(result.delegateMode).toBe("manual");
    expect(result.attentionStatus).toBe("none");
    expect(result.reviewStatus).toBe("none");
    expect(result.scheduleType).toBe("none");
    expect(result.tags).toEqual([]);
    expect(result.isPinned).toBe(false);
    expect(result.priority).toBe(0);
    expect(result.delegateActorId).toBeNull();
    expect(result.completedAt).toBeNull();
    expect(result.comments).toBeUndefined();
  });
});

describe("useTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updateTaskStatus sends PATCH /api/tasks/{id} with taskStatus body", async () => {
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({
        items: [fullRawTask],
        nextCursor: null,
        hasMore: false,
        totalCount: 1,
      }),
    );

    const { result } = renderHook(() => useTasks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.tasks.length).toBe(1));

    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({ ...fullRawTask, taskStatus: "completed" }),
    );

    await result.current.updateTaskStatus("task-1", "completed");

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/tasks/task-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ taskStatus: "completed" }),
      }),
    );
  });
});

describe("useTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches a single task by id", async () => {
    mockApiFetch.mockResolvedValueOnce(mockJsonResponse(fullRawTask));

    const { result } = renderHook(() => useTask("task-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.task).toBeDefined());
    expect(result.current.task?.title).toBe("Test Task");
  });
});
