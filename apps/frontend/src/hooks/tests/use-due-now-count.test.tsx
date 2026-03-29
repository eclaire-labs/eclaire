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

function mockFetchOk(items: { id: string }[]) {
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

describe("useDueNowCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConnected.value = false;
    mockFetchOk([]);
  });

  it("returns the count of due-now items from API", async () => {
    mockFetchOk([{ id: "1" }, { id: "2" }, { id: "3" }]);

    const { result } = renderHook(() => useDueNowCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.count).toBe(3);
  });

  it("returns 0 when no items are due", async () => {
    mockFetchOk([]);

    const { result } = renderHook(() => useDueNowCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.count).toBe(0);
  });

  it("returns 0 when API returns an error", async () => {
    mockFetchError(500);

    const { result } = renderHook(() => useDueNowCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.count).toBe(0);
  });

  it("returns 0 while loading", () => {
    mockFetchOk([{ id: "1" }]);

    const { result } = renderHook(() => useDueNowCount(), {
      wrapper: createWrapper(),
    });

    // Before query resolves, count defaults to 0
    expect(result.current.count).toBe(0);
  });

  it("fetches due_now items with correct endpoint", async () => {
    mockFetchOk([]);

    const { result } = renderHook(() => useDueNowCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/all?dueStatus=due_now&limit=100",
    );
  });

  it("counts items correctly with varying response sizes", async () => {
    const items = Array.from({ length: 42 }, (_, i) => ({ id: String(i) }));
    mockFetchOk(items);

    const { result } = renderHook(() => useDueNowCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.count).toBe(42);
  });
});
