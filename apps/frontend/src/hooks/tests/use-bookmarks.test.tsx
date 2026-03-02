// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock apiFetch and getAbsoluteApiUrl
vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
  getAbsoluteApiUrl: vi.fn((url: string) => `http://api${url}`),
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

import { apiFetch, getAbsoluteApiUrl } from "@/lib/api-client";
import { toast } from "sonner";
import {
  transformBookmarkData,
  useBookmark,
  useBookmarks,
} from "@/hooks/use-bookmarks";

const mockApiFetch = vi.mocked(apiFetch);
const mockGetAbsoluteApiUrl = vi.mocked(getAbsoluteApiUrl);
const mockToastError = vi.mocked(toast.error);

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

/** A complete raw bookmark object for use in tests. */
function makeRawBookmark(overrides: Record<string, unknown> = {}) {
  return {
    id: "bk-1",
    title: "Example Bookmark",
    description: "A test bookmark",
    url: "https://example.com",
    normalizedUrl: "example.com",
    author: "Test Author",
    lang: "en",
    dueDate: "2026-04-01",
    pageLastUpdatedAt: "2026-01-15",
    contentType: "text/html",
    etag: '"abc123"',
    lastModified: "2026-01-15T00:00:00Z",
    tags: ["test", "example"],
    faviconUrl: "/api/bookmarks/bk-1/favicon",
    thumbnailUrl: "/api/bookmarks/bk-1/thumbnail",
    screenshotUrl: "/api/bookmarks/bk-1/screenshot",
    screenshotMobileUrl: "/api/bookmarks/bk-1/screenshot-mobile",
    screenshotFullPageUrl: "/api/bookmarks/bk-1/screenshot-full",
    pdfUrl: "/api/bookmarks/bk-1/pdf",
    contentUrl: "/api/bookmarks/bk-1/content",
    readableUrl: "/api/bookmarks/bk-1/readable",
    readmeUrl: "/api/bookmarks/bk-1/readme",
    extractedText: "Some extracted text",
    processingStatus: "completed",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
    reviewStatus: "approved",
    flagColor: "green",
    isPinned: true,
    enabled: true,
    rawMetadata: { github: { stars: 100 } },
    ...overrides,
  };
}

describe("transformBookmarkData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("converts null and undefined tags to an empty array", () => {
    const withNull = transformBookmarkData(makeRawBookmark({ tags: null }));
    expect(withNull.tags).toEqual([]);

    const withUndefined = transformBookmarkData(
      makeRawBookmark({ tags: undefined }),
    );
    expect(withUndefined.tags).toEqual([]);
  });

  it("applies getAbsoluteApiUrl to truthy URL fields and null to falsy ones", () => {
    const urlFields = [
      "faviconUrl",
      "thumbnailUrl",
      "screenshotUrl",
      "screenshotMobileUrl",
      "screenshotFullPageUrl",
      "pdfUrl",
      "contentUrl",
      "readableUrl",
      "readmeUrl",
    ] as const;

    // Truthy URL values
    const rawTruthy = makeRawBookmark();
    const resultTruthy = transformBookmarkData(rawTruthy);

    for (const field of urlFields) {
      expect(mockGetAbsoluteApiUrl).toHaveBeenCalledWith(rawTruthy[field]);
      expect(resultTruthy[field]).toBe(
        `http://api${rawTruthy[field] as string}`,
      );
    }

    vi.clearAllMocks();

    // Falsy URL values (null, undefined, empty string)
    const falsyOverrides: Record<string, unknown> = {};
    for (const field of urlFields) {
      falsyOverrides[field] = null;
    }
    const rawFalsy = makeRawBookmark(falsyOverrides);
    const resultFalsy = transformBookmarkData(rawFalsy);

    for (const field of urlFields) {
      expect(resultFalsy[field]).toBeNull();
    }
    // getAbsoluteApiUrl should not be called for falsy values
    expect(mockGetAbsoluteApiUrl).not.toHaveBeenCalled();
  });

  it("preserves enabled: false (uses ?? operator, not ||)", () => {
    const result = transformBookmarkData(makeRawBookmark({ enabled: false }));
    expect(result.enabled).toBe(false);
  });

  it("defaults enabled to true when undefined", () => {
    const result = transformBookmarkData(
      makeRawBookmark({ enabled: undefined }),
    );
    expect(result.enabled).toBe(true);
  });

  it("provides date fallbacks for missing createdAt and updatedAt", () => {
    const before = new Date().toISOString();

    const result = transformBookmarkData(
      makeRawBookmark({ createdAt: undefined, updatedAt: undefined }),
    );

    const after = new Date().toISOString();

    // The generated dates should be valid ISO strings between our before/after boundaries
    expect(result.createdAt >= before).toBe(true);
    expect(result.createdAt <= after).toBe(true);
    expect(result.updatedAt >= before).toBe(true);
    expect(result.updatedAt <= after).toBe(true);
  });

  it("defaults reviewStatus to 'pending', flagColor to null, isPinned to false", () => {
    const result = transformBookmarkData(
      makeRawBookmark({
        reviewStatus: undefined,
        flagColor: undefined,
        isPinned: undefined,
      }),
    );

    expect(result.reviewStatus).toBe("pending");
    expect(result.flagColor).toBeNull();
    expect(result.isPinned).toBe(false);
  });

  it("passes through scalar fields unchanged", () => {
    const raw = makeRawBookmark();
    const result = transformBookmarkData(raw);

    expect(result.id).toBe(raw.id);
    expect(result.title).toBe(raw.title);
    expect(result.description).toBe(raw.description);
    expect(result.url).toBe(raw.url);
    expect(result.normalizedUrl).toBe(raw.normalizedUrl);
    expect(result.author).toBe(raw.author);
    expect(result.lang).toBe(raw.lang);
    expect(result.dueDate).toBe(raw.dueDate);
    expect(result.pageLastUpdatedAt).toBe(raw.pageLastUpdatedAt);
    expect(result.contentType).toBe(raw.contentType);
    expect(result.etag).toBe(raw.etag);
    expect(result.lastModified).toBe(raw.lastModified);
    expect(result.extractedText).toBe(raw.extractedText);
    expect(result.rawMetadata).toBe(raw.rawMetadata);
  });
});

describe("useBookmarks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createBookmark sends POST to /api/bookmarks with the correct body", async () => {
    // Initial list fetch
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({ items: [] }),
    );

    const { result } = renderHook(() => useBookmarks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Create mutation
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse(makeRawBookmark({ id: "bk-new" })),
    );
    // Refetch after cache invalidation
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({ items: [makeRawBookmark({ id: "bk-new" })] }),
    );

    await result.current.createBookmark({ url: "https://new-bookmark.com" });

    expect(mockApiFetch).toHaveBeenCalledWith("/api/bookmarks", {
      method: "POST",
      body: JSON.stringify({ url: "https://new-bookmark.com" }),
    });
  });

  it("importBookmarks sends POST to /api/bookmarks/import with FormData", async () => {
    // Initial list fetch
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({ items: [] }),
    );

    const { result } = renderHook(() => useBookmarks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const formData = new FormData();
    formData.append("file", new Blob(["test"]), "bookmarks.html");

    // Import mutation
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({ imported: 5 }),
    );
    // Refetch after cache invalidation
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({ items: [] }),
    );

    await result.current.importBookmarks(formData);

    expect(mockApiFetch).toHaveBeenCalledWith("/api/bookmarks/import", {
      method: "POST",
      body: formData,
    });
  });

  it("import failure triggers toast.error with the error message", async () => {
    // Initial list fetch
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({ items: [] }),
    );

    const { result } = renderHook(() => useBookmarks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const formData = new FormData();

    // Make the import fail
    mockApiFetch.mockRejectedValueOnce(new Error("Invalid file format"));

    // importBookmarks calls mutateAsync which rejects; catch to avoid unhandled rejection
    await result.current.importBookmarks(formData).catch(() => {});

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "Import failed: Invalid file format",
      );
    });
  });

  it("isImporting reflects the pending state of the import mutation", async () => {
    // Initial list fetch
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({ items: [] }),
    );

    const { result } = renderHook(() => useBookmarks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Initially not importing
    expect(result.current.isImporting).toBe(false);

    // Create a promise we can control to keep the mutation pending
    let resolveImport!: (value: Response) => void;
    const pendingPromise = new Promise<Response>((resolve) => {
      resolveImport = resolve;
    });
    mockApiFetch.mockReturnValueOnce(pendingPromise);

    const formData = new FormData();
    const importPromise = result.current.importBookmarks(formData);

    // While the mutation is in flight, isImporting should be true
    await waitFor(() => expect(result.current.isImporting).toBe(true));

    // Resolve the import
    resolveImport(mockJsonResponse({ imported: 1 }));
    // Refetch after invalidation
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({ items: [] }),
    );

    await importPromise;

    await waitFor(() => expect(result.current.isImporting).toBe(false));
  });
});

describe("useBookmark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { bookmark, ... } fetched via useSingle", async () => {
    const raw = makeRawBookmark({ id: "bk-42" });
    mockApiFetch.mockResolvedValueOnce(mockJsonResponse(raw));

    const { result } = renderHook(() => useBookmark("bk-42"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockApiFetch).toHaveBeenCalledWith("/api/bookmarks/bk-42");
    expect(result.current.bookmark).toBeDefined();
    expect(result.current.bookmark?.id).toBe("bk-42");
    expect(result.current.bookmark?.title).toBe(raw.title);
  });
});
