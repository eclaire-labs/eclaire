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
import { transformNoteData, useNotes } from "@/hooks/use-notes";
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

// ---------------------------------------------------------------------------
// transformNoteData
// ---------------------------------------------------------------------------

describe("transformNoteData", () => {
  const minimal = { id: "n1", title: "T", content: "C", dueDate: null };

  it("defaults description to null via ||", () => {
    expect(transformNoteData(minimal).description).toBeNull();
    expect(
      transformNoteData({ ...minimal, description: "" }).description,
    ).toBeNull();
  });

  it("defaults userId to empty string", () => {
    expect(transformNoteData(minimal).userId).toBe("");
  });

  it("defaults rawMetadata, originalMimeType, and userAgent to null", () => {
    const note = transformNoteData(minimal);
    expect(note.rawMetadata).toBeNull();
    expect(note.originalMimeType).toBeNull();
    expect(note.userAgent).toBeNull();
  });

  it("defaults tags to [] when missing or null", () => {
    expect(transformNoteData(minimal).tags).toEqual([]);
    expect(transformNoteData({ ...minimal, tags: null }).tags).toEqual([]);
  });

  it("preserves processingEnabled: false via ?? (not ||)", () => {
    const note = transformNoteData({ ...minimal, processingEnabled: false });
    expect(note.processingEnabled).toBe(false);
  });

  it("applies common defaults for dates, reviewStatus, flagColor, isPinned", () => {
    const note = transformNoteData(minimal);
    expect(note.createdAt).toEqual(expect.any(String));
    expect(note.updatedAt).toEqual(expect.any(String));
    expect(note.reviewStatus).toBe("pending");
    expect(note.flagColor).toBeNull();
    expect(note.isPinned).toBe(false);
    expect(note.processingStatus).toBeNull();
  });

  it("passes through title and content without defaults", () => {
    const note = transformNoteData(minimal);
    expect(note.title).toBe("T");
    expect(note.content).toBe("C");
  });
});

// ---------------------------------------------------------------------------
// useNotes hook — mutation tests
// ---------------------------------------------------------------------------

describe("useNotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updateNote sends PUT (not PATCH) because updateMethod is 'PUT'", async () => {
    // Initial list fetch
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({
        items: [
          { id: "n1", title: "Old", content: "body", dueDate: null, tags: [] },
        ],
      }),
    );

    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.notes.length).toBe(1));

    // Update mutation call
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({
        id: "n1",
        title: "New",
        content: "body",
        dueDate: null,
        tags: [],
      }),
    );
    // Refetch after invalidation
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({
        items: [
          { id: "n1", title: "New", content: "body", dueDate: null, tags: [] },
        ],
      }),
    );

    await result.current.updateNote("n1", { title: "New" });

    // KEY CONTRACT: the second call (index 1) must use PUT, not PATCH
    const updateCall = mockApiFetch.mock.calls.find(
      (call) =>
        typeof call[1] === "object" &&
        call[1] !== null &&
        "method" in call[1] &&
        (call[1] as RequestInit).method === "PUT",
    );

    expect(updateCall).toBeDefined();
    expect(updateCall![0]).toBe("/api/notes/n1");
    expect((updateCall![1] as RequestInit).method).toBe("PUT");
    expect((updateCall![1] as RequestInit).body).toBe(
      JSON.stringify({ title: "New" }),
    );
  });

  it("uploadNote sends POST to /api/notes/upload with FormData", async () => {
    // Initial list fetch
    mockApiFetch.mockResolvedValueOnce(mockJsonResponse({ items: [] }));

    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.notes).toEqual([]));

    const formData = new FormData();
    formData.append("file", new Blob(["hello"]), "note.md");

    // Upload response
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({ id: "n2", title: "note.md" }),
    );
    // Refetch after invalidation
    mockApiFetch.mockResolvedValueOnce(mockJsonResponse({ items: [] }));

    await result.current.uploadNote(formData);

    const uploadCall = mockApiFetch.mock.calls.find(
      (call) => call[0] === "/api/notes/upload",
    );

    expect(uploadCall).toBeDefined();
    expect((uploadCall![1] as RequestInit).method).toBe("POST");
    expect((uploadCall![1] as RequestInit).body).toBe(formData);
  });

  it("upload failure triggers toast.error", async () => {
    // Initial list fetch
    mockApiFetch.mockResolvedValueOnce(mockJsonResponse({ items: [] }));

    const { result } = renderHook(() => useNotes(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.notes).toEqual([]));

    const formData = new FormData();

    // Reject the upload
    mockApiFetch.mockRejectedValueOnce(new Error("Network down"));

    await expect(result.current.uploadNote(formData)).rejects.toThrow(
      "Network down",
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Upload failed: Network down");
    });
  });
});
