// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockIsConnected = { value: false };

vi.mock("@/providers/ProcessingEventsProvider", () => ({
  useSSEConnectionStatus: () => ({ isConnected: mockIsConnected.value }),
}));

const mockApiFetch = vi.fn();

vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { useUpcoming } from "@/hooks/use-upcoming";
import type { UpcomingItem } from "@/hooks/use-upcoming";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/** Minimal Task shape matching the fields taskToUpcomingItem reads */
function makeTask(overrides: {
  id: string;
  title?: string;
  dueDate?: string | null;
  nextOccurrenceAt?: string | null;
  createdAt?: string;
  scheduleType?: string;
  delegateMode?: string;
}) {
  return {
    id: overrides.id,
    title: overrides.title ?? `Task ${overrides.id}`,
    dueDate: overrides.dueDate ?? null,
    nextOccurrenceAt: overrides.nextOccurrenceAt ?? null,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    scheduleType: overrides.scheduleType ?? "none",
    delegateMode: overrides.delegateMode ?? "manual",
    // Extra fields present in real Task responses (unused by the hook)
    userId: "user-1",
    description: null,
    prompt: null,
    delegateActorId: null,
    delegatedByActorId: null,
    taskStatus: "open",
    attentionStatus: "none",
    reviewStatus: "none",
    scheduleRule: null,
    scheduleSummary: null,
    timezone: null,
    maxOccurrences: null,
    occurrenceCount: 0,
    latestExecutionStatus: null,
    latestResultSummary: null,
    latestErrorSummary: null,
    deliveryTargets: null,
    sourceConversationId: null,
    priority: 0,
    flagColor: null,
    isPinned: false,
    sortOrder: null,
    tags: [],
    processingEnabled: false,
    processingStatus: null,
    completedAt: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function mockFetchOk(items: ReturnType<typeof makeTask>[]) {
  mockApiFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ items }),
  });
}

function mockFetchError(status = 500) {
  mockApiFetch.mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ error: "Server error" }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useUpcoming", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConnected.value = false;
    mockFetchOk([]);
  });

  it("returns empty items when API returns no tasks", async () => {
    const { result } = renderHook(() => useUpcoming(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toEqual([]);
  });

  it("transforms tasks to UpcomingItem shape", async () => {
    mockFetchOk([
      makeTask({
        id: "t-1",
        title: "Review PR",
        dueDate: "2026-04-01T10:00:00Z",
        scheduleType: "one_time",
        delegateMode: "assist",
      }),
    ]);

    const { result } = renderHook(() => useUpcoming(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toHaveLength(1);
    const item: UpcomingItem = result.current.items[0];
    expect(item).toEqual({
      id: "t-1",
      title: "Review PR",
      when: "2026-04-01T10:00:00Z",
      scheduleType: "one_time",
      delegateMode: "assist",
      linkTo: "/tasks/t-1",
    });
  });

  it("uses nextOccurrenceAt over dueDate for the when field", async () => {
    mockFetchOk([
      makeTask({
        id: "t-2",
        nextOccurrenceAt: "2026-05-01T08:00:00Z",
        dueDate: "2026-04-01T08:00:00Z",
        scheduleType: "recurring",
      }),
    ]);

    const { result } = renderHook(() => useUpcoming(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items[0].when).toBe("2026-05-01T08:00:00Z");
  });

  it("falls back to dueDate then createdAt for the when field", async () => {
    mockFetchOk([
      makeTask({
        id: "t-due",
        nextOccurrenceAt: null,
        dueDate: "2026-04-15T12:00:00Z",
      }),
      makeTask({
        id: "t-created",
        nextOccurrenceAt: null,
        dueDate: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ]);

    const { result } = renderHook(() => useUpcoming(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items[0].when).toBe("2026-04-15T12:00:00Z");
    expect(result.current.items[1].when).toBe("2026-01-01T00:00:00.000Z");
  });

  it("generates correct linkTo paths", async () => {
    mockFetchOk([makeTask({ id: "abc-123" }), makeTask({ id: "def-456" })]);

    const { result } = renderHook(() => useUpcoming(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items.map((i) => i.linkTo)).toEqual([
      "/tasks/abc-123",
      "/tasks/def-456",
    ]);
  });

  it("returns empty items on API error", async () => {
    mockFetchError(500);

    const { result } = renderHook(() => useUpcoming(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toEqual([]);
  });

  it("respects custom limit option", async () => {
    mockFetchOk([]);

    const { result } = renderHook(() => useUpcoming({ limit: 5 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const url: string = mockApiFetch.mock.calls[0][0];
    expect(url).toContain("limit=5");
  });

  it("passes correct sort and date filter params", async () => {
    mockFetchOk([]);

    const { result } = renderHook(() => useUpcoming(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const url: string = mockApiFetch.mock.calls[0][0];
    expect(url).toContain("sortBy=dueDate");
    expect(url).toContain("sortDir=asc");
    expect(url).toContain("dueDateStart=");
    expect(url).toMatch(/limit=15/);
  });

  it("handles response with top-level array (no items wrapper)", async () => {
    // The hook handles both { items: [...] } and bare arrays defensively
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([makeTask({ id: "bare-1", title: "Bare task" })]),
    });

    const { result } = renderHook(() => useUpcoming(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].id).toBe("bare-1");
  });

  it("does not fetch when enabled is false", async () => {
    mockFetchOk([makeTask({ id: "t-1" })]);

    const { result } = renderHook(() => useUpcoming({ enabled: false }), {
      wrapper: createWrapper(),
    });

    // Should stay in idle state, never calling the API
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
  });
});
