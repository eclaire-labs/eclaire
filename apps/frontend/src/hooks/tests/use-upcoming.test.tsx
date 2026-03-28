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
    json: () => Promise.resolve({ items: [] }),
  }),
}));

import { useUpcoming } from "@/hooks/use-upcoming";

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

describe("useUpcoming", () => {
  beforeEach(() => {
    mockIsConnected.value = false;
  });

  it("returns empty items initially", async () => {
    const { result } = renderHook(() => useUpcoming(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.items).toEqual([]);
  });

  it("uses query key with upcoming prefix", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    renderHook(() => useUpcoming(), { wrapper });

    await waitFor(() => {
      const cache = queryClient.getQueryCache().findAll();
      const keys = cache.map((q) => q.queryKey);
      expect(keys).toContainEqual(["upcoming", 15]);
    });
  });
});
