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

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        items: [{ id: "1" }, { id: "2" }, { id: "3" }],
      }),
  }),
}));

import { useDueNowCount } from "@/hooks/use-due-now-count";

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

describe("useDueNowCount", () => {
  beforeEach(() => {
    mockIsConnected.value = false;
  });

  it("returns the count of due-now items", async () => {
    const { result } = renderHook(() => useDueNowCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.count).toBe(3);
  });

  it("returns 0 when loading", () => {
    const { result } = renderHook(() => useDueNowCount(), {
      wrapper: createWrapper(),
    });

    // Before the query resolves, count defaults to 0
    expect(result.current.count).toBe(0);
  });

  it("uses query key due-now-count", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    renderHook(() => useDueNowCount(), { wrapper });

    await waitFor(() => {
      const cache = queryClient.getQueryCache().findAll();
      const keys = cache.map((q) => q.queryKey);
      expect(keys).toContainEqual(["due-now-count"]);
    });
  });
});
