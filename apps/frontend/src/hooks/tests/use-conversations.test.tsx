// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationSummary } from "@/types/conversation";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockIsConnected = { value: false };

vi.mock("@/providers/ProcessingEventsProvider", () => ({
  useSSEConnectionStatus: () => ({ isConnected: mockIsConnected.value }),
}));

const mockListSessions = vi.fn();

vi.mock("@/lib/api-sessions", () => ({
  listSessions: (...args: unknown[]) => mockListSessions(...args),
}));

import { useConversations } from "@/hooks/use-conversations";

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

function makeSession(
  overrides: Partial<ConversationSummary> & { id: string },
): ConversationSummary {
  return {
    userId: "user-1",
    agentActorId: "agent-1",
    title: `Session ${overrides.id}`,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    lastMessageAt: overrides.lastMessageAt ?? null,
    messageCount: overrides.messageCount ?? 1,
    ...overrides,
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useConversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConnected.value = false;
    mockListSessions.mockResolvedValue({ items: [], totalCount: 0 });
  });

  it("returns empty groups when there are no sessions", async () => {
    const { result } = renderHook(() => useConversations(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.groups).toEqual([]);
    expect(result.current.conversations).toEqual([]);
  });

  it("groups conversations by time period", async () => {
    const sessions = [
      makeSession({ id: "today", lastMessageAt: daysAgo(0) }),
      makeSession({ id: "yesterday", lastMessageAt: daysAgo(1) }),
      makeSession({ id: "this-week", lastMessageAt: daysAgo(4) }),
      makeSession({ id: "older", lastMessageAt: daysAgo(30) }),
    ];
    mockListSessions.mockResolvedValue({
      items: sessions,
      totalCount: sessions.length,
    });

    const { result } = renderHook(() => useConversations(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.groups).toHaveLength(4);
    expect(result.current.groups.map((g) => g.label)).toEqual([
      "Today",
      "Yesterday",
      "This Week",
      "Older",
    ]);
    expect(result.current.groups[0].conversations[0].id).toBe("today");
    expect(result.current.groups[1].conversations[0].id).toBe("yesterday");
    expect(result.current.groups[2].conversations[0].id).toBe("this-week");
    expect(result.current.groups[3].conversations[0].id).toBe("older");
  });

  it("omits empty groups", async () => {
    const sessions = [
      makeSession({ id: "today-1", lastMessageAt: daysAgo(0) }),
      makeSession({ id: "older-1", lastMessageAt: daysAgo(30) }),
    ];
    mockListSessions.mockResolvedValue({
      items: sessions,
      totalCount: sessions.length,
    });

    const { result } = renderHook(() => useConversations(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const labels = result.current.groups.map((g) => g.label);
    expect(labels).toEqual(["Today", "Older"]);
    expect(labels).not.toContain("Yesterday");
    expect(labels).not.toContain("This Week");
  });

  it("uses lastMessageAt for grouping, falling back to createdAt", async () => {
    const sessions = [
      makeSession({
        id: "has-last-msg",
        lastMessageAt: daysAgo(0),
        createdAt: daysAgo(30),
      }),
      makeSession({
        id: "no-last-msg",
        lastMessageAt: null,
        createdAt: daysAgo(0),
      }),
    ];
    mockListSessions.mockResolvedValue({
      items: sessions,
      totalCount: sessions.length,
    });

    const { result } = renderHook(() => useConversations(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Both should land in "Today" — one via lastMessageAt, one via createdAt fallback
    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0].label).toBe("Today");
    expect(result.current.groups[0].conversations).toHaveLength(2);
  });

  it("exposes flat conversations list alongside groups", async () => {
    const sessions = [
      makeSession({ id: "a", lastMessageAt: daysAgo(0) }),
      makeSession({ id: "b", lastMessageAt: daysAgo(1) }),
    ];
    mockListSessions.mockResolvedValue({
      items: sessions,
      totalCount: sessions.length,
    });

    const { result } = renderHook(() => useConversations(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.conversations).toHaveLength(2);
    expect(result.current.conversations.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("calls listSessions with limit 30 and offset 0", async () => {
    const { result } = renderHook(() => useConversations(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockListSessions).toHaveBeenCalledWith(30, 0);
  });
});
