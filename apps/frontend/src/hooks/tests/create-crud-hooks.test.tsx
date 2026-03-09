// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCrudHooks } from "@/hooks/create-crud-hooks";

// Mock apiFetch
vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

interface TestItem {
  id: string;
  title: string;
}

const testConfig = {
  resourceName: "test-items",
  apiPath: "/api/test-items",
  transform: (raw: { id: string; title: string }) => ({
    id: raw.id,
    title: raw.title,
  }),
};

const { useList, useSingle } = createCrudHooks<TestItem>(testConfig);

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

describe("useList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches items from apiPath", async () => {
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({ items: [{ id: "1", title: "Test" }] }),
    );

    const { result } = renderHook(() => useList(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockApiFetch).toHaveBeenCalledWith("/api/test-items?");
    expect(result.current.items).toEqual([{ id: "1", title: "Test" }]);
  });

  it("transforms items through config.transform", async () => {
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({
        items: [
          { id: "1", title: "Note 1", extraField: "ignored" },
          { id: "2", title: "Note 2" },
        ],
      }),
    );

    const { result } = renderHook(() => useList(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.items.length).toBe(2));
    expect(result.current.items[0]).toEqual({ id: "1", title: "Note 1" });
  });

  it("exposes isLoading and error states", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useList(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("Network error");
  });

  it("createItem POSTs to apiPath", async () => {
    // Initial list fetch
    mockApiFetch.mockResolvedValueOnce(mockJsonResponse({ items: [] }));

    const { result } = renderHook(() => useList(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Create
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({ id: "new", title: "New Item" }),
    );
    // Refetch after invalidation
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({ items: [{ id: "new", title: "New Item" }] }),
    );

    await result.current.createItem({ title: "New Item" });

    expect(mockApiFetch).toHaveBeenCalledWith("/api/test-items", {
      method: "POST",
      body: JSON.stringify({ title: "New Item" }),
    });
  });

  it("deleteItem sends DELETE to apiPath/id", async () => {
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({ items: [{ id: "1", title: "Test" }] }),
    );

    const { result } = renderHook(() => useList(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Delete
    mockApiFetch.mockResolvedValueOnce(mockJsonResponse({}));
    // Refetch
    mockApiFetch.mockResolvedValueOnce(mockJsonResponse({ items: [] }));

    await result.current.deleteItem("1");

    expect(mockApiFetch).toHaveBeenCalledWith("/api/test-items/1", {
      method: "DELETE",
    });
  });

  it("updateItem sends PATCH to apiPath/id by default", async () => {
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({ items: [{ id: "1", title: "Old" }] }),
    );

    const { result } = renderHook(() => useList(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Update
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({ id: "1", title: "Updated" }),
    );
    // Refetch
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({ items: [{ id: "1", title: "Updated" }] }),
    );

    await result.current.updateItem("1", { title: "Updated" });

    expect(mockApiFetch).toHaveBeenCalledWith("/api/test-items/1", {
      method: "PATCH",
      body: JSON.stringify({ title: "Updated" }),
    });
  });
});

describe("useSingle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches a single item by ID", async () => {
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({ id: "1", title: "Single Item" }),
    );

    const { result } = renderHook(() => useSingle("1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockApiFetch).toHaveBeenCalledWith("/api/test-items/1");
    expect(result.current.item).toEqual({ id: "1", title: "Single Item" });
  });

  it("is disabled when id is empty string", async () => {
    const { result } = renderHook(() => useSingle(""), {
      wrapper: createWrapper(),
    });

    // Should remain in initial state without fetching
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(result.current.item).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });
});
