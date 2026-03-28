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

vi.mock("@/lib/api-sessions", () => ({
  listSessions: vi.fn().mockResolvedValue({ items: [], totalCount: 0 }),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useConversations", () => {
  beforeEach(() => {
    mockIsConnected.value = false;
  });

  it("returns empty groups and conversations initially", async () => {
    const { result } = renderHook(() => useConversations(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.groups).toEqual([]);
    expect(result.current.conversations).toEqual([]);
  });

  it("uses query key sidebar-conversations", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    renderHook(() => useConversations(), { wrapper });

    await waitFor(() => {
      const cache = queryClient.getQueryCache().findAll();
      const keys = cache.map((q) => q.queryKey);
      expect(keys).toContainEqual(["sidebar-conversations"]);
    });
  });
});
