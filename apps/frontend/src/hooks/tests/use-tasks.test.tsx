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

import { apiFetch } from "@/lib/api-client";
import { toast } from "sonner";
import { transformTaskData, useTask, useTasks } from "@/hooks/use-tasks";

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
  status: "not-started",
  dueDate: "2026-04-01",
  assignedToId: "user-2",
  tags: ["frontend", "bug"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  processingStatus: "completed",
  reviewStatus: "approved",
  flagColor: "red",
  isPinned: true,
  enabled: true,
  isRecurring: true,
  cronExpression: "0 9 * * 1",
  recurrenceEndDate: "2026-12-31",
  recurrenceLimit: 10,
  runImmediately: true,
  nextRunAt: "2026-03-09T09:00:00.000Z",
  lastRunAt: "2026-03-02T09:00:00.000Z",
  completedAt: "2026-03-02T09:05:00.000Z",
  comments: [{ id: "c1", taskId: "task-1", userId: "user-1", content: "done", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", user: { id: "user-1", displayName: "Alice", userType: "user" } }],
};

describe("transformTaskData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults userId to empty string when missing", () => {
    const result = transformTaskData({ id: "1", title: "t" });
    expect(result.userId).toBe("");
  });

  it("defaults tags to empty array when null or missing", () => {
    expect(transformTaskData({ id: "1", tags: null }).tags).toEqual([]);
    expect(transformTaskData({ id: "1" }).tags).toEqual([]);
  });

  it("defaults isRecurring and runImmediately to false via ||", () => {
    const result = transformTaskData({ id: "1" });
    expect(result.isRecurring).toBe(false);
    expect(result.runImmediately).toBe(false);
  });

  it("defaults recurrence fields to null", () => {
    const result = transformTaskData({ id: "1" });
    expect(result.cronExpression).toBeNull();
    expect(result.recurrenceEndDate).toBeNull();
    expect(result.recurrenceLimit).toBeNull();
    expect(result.nextRunAt).toBeNull();
    expect(result.lastRunAt).toBeNull();
    expect(result.completedAt).toBeNull();
  });

  it("defaults comments to undefined, not null or empty array", () => {
    const result = transformTaskData({ id: "1" });
    expect(result.comments).toBeUndefined();

    // Falsy comments value also becomes undefined
    const result2 = transformTaskData({ id: "1", comments: null });
    expect(result2.comments).toBeUndefined();

    const result3 = transformTaskData({ id: "1", comments: "" });
    expect(result3.comments).toBeUndefined();
  });

  it("preserves enabled: false via ?? (not ||)", () => {
    const result = transformTaskData({ id: "1", enabled: false });
    expect(result.enabled).toBe(false);

    // When missing, defaults to true
    const result2 = transformTaskData({ id: "1" });
    expect(result2.enabled).toBe(true);
  });

  it("defaults reviewStatus, flagColor, isPinned, processingStatus, and generates date fallbacks", () => {
    const before = new Date().toISOString();
    const result = transformTaskData({ id: "1" });
    const after = new Date().toISOString();

    expect(result.reviewStatus).toBe("pending");
    expect(result.flagColor).toBeNull();
    expect(result.isPinned).toBe(false);
    expect(result.processingStatus).toBeNull();

    // createdAt and updatedAt should be ISO strings generated at call time
    expect(result.createdAt >= before).toBe(true);
    expect(result.createdAt <= after).toBe(true);
    expect(result.updatedAt >= before).toBe(true);
    expect(result.updatedAt <= after).toBe(true);
  });
});

describe("useTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updateTaskStatus sends PATCH /api/tasks/{id} with status body", async () => {
    // Initial list fetch
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({ items: [fullRawTask] }),
    );

    const { result } = renderHook(() => useTasks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.tasks.length).toBe(1));

    // Status update
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({ ...fullRawTask, status: "completed" }),
    );
    // Refetch after invalidation
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({ items: [{ ...fullRawTask, status: "completed" }] }),
    );

    await result.current.updateTaskStatus("task-1", "completed");

    expect(mockApiFetch).toHaveBeenCalledWith("/api/tasks/task-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "completed" }),
    });
  });

  it("status update failure triggers toast.error", async () => {
    // Initial list fetch
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({ items: [] }),
    );

    const { result } = renderHook(() => useTasks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isUpdating).toBe(false));

    // Status update fails
    mockApiFetch.mockRejectedValueOnce(new Error("Network failure"));

    await expect(
      result.current.updateTaskStatus("task-1", "completed"),
    ).rejects.toThrow("Network failure");

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Status update failed: Network failure",
      );
    });
  });
});

describe("useTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { task, ... } for a single task by ID", async () => {
    mockApiFetch.mockResolvedValueOnce(mockJsonResponse(fullRawTask));

    const { result } = renderHook(() => useTask("task-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockApiFetch).toHaveBeenCalledWith("/api/tasks/task-1");
    expect(result.current.task).toBeDefined();
    expect(result.current.task?.id).toBe("task-1");
    expect(result.current.task?.title).toBe("Test Task");
  });
});
