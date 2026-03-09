// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock apiFetch and normalizeApiUrl
vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
  normalizeApiUrl: vi.fn((url: string) => `http://api${url}`),
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

import { apiFetch, normalizeApiUrl } from "@/lib/api-client";
import {
  transformDocumentData,
  useDocument,
  useDocuments,
} from "@/hooks/use-documents";

const mockApiFetch = vi.mocked(apiFetch);
const mockNormalizeApiUrl = vi.mocked(normalizeApiUrl);

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

/** A complete raw document object for use in tests. */
function makeRawDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: "doc-1",
    userId: "user-1",
    title: "Test Document",
    description: "A test document",
    originalFilename: "report.pdf",
    dueDate: "2026-04-01",
    mimeType: "application/pdf",
    fileSize: 102400,
    rawMetadata: { pages: 5 },
    originalMimeType: "application/pdf",
    tags: ["work", "report"],
    fileUrl: "/api/documents/doc-1/file",
    thumbnailUrl: "/api/documents/doc-1/thumbnail",
    screenshotUrl: "/api/documents/doc-1/screenshot",
    pdfUrl: "/api/documents/doc-1/pdf",
    contentUrl: "/api/documents/doc-1/content",
    extractedText: "Some extracted text from the document",
    processingStatus: "completed",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
    reviewStatus: "approved",
    flagColor: "blue",
    isPinned: true,
    enabled: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// transformDocumentData
// ---------------------------------------------------------------------------

describe("transformDocumentData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults userId to empty string when missing", () => {
    const result = transformDocumentData(
      makeRawDocument({ userId: undefined }),
    );
    expect(result.userId).toBe("");

    const result2 = transformDocumentData(makeRawDocument({ userId: "" }));
    expect(result2.userId).toBe("");
  });

  it("defaults tags to empty array when null or missing", () => {
    expect(
      transformDocumentData(makeRawDocument({ tags: null })).tags,
    ).toEqual([]);
    expect(
      transformDocumentData(makeRawDocument({ tags: undefined })).tags,
    ).toEqual([]);
  });

  it("applies normalizeApiUrl to truthy URL fields and null to falsy ones", () => {
    const urlFields = [
      "fileUrl",
      "thumbnailUrl",
      "screenshotUrl",
      "pdfUrl",
      "contentUrl",
    ] as const;

    // Truthy URL values
    const rawTruthy = makeRawDocument();
    const resultTruthy = transformDocumentData(rawTruthy);

    for (const field of urlFields) {
      expect(mockNormalizeApiUrl).toHaveBeenCalledWith(rawTruthy[field]);
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
    const rawFalsy = makeRawDocument(falsyOverrides);
    const resultFalsy = transformDocumentData(rawFalsy);

    for (const field of urlFields) {
      expect(resultFalsy[field]).toBeNull();
    }
    // normalizeApiUrl should not be called for falsy values
    expect(mockNormalizeApiUrl).not.toHaveBeenCalled();
  });

  it("preserves enabled: false via ?? (not ||)", () => {
    const result = transformDocumentData(makeRawDocument({ enabled: false }));
    expect(result.enabled).toBe(false);

    // When missing, defaults to true
    const result2 = transformDocumentData(
      makeRawDocument({ enabled: undefined }),
    );
    expect(result2.enabled).toBe(true);
  });

  it("defaults reviewStatus, flagColor, isPinned, processingStatus, and generates date fallbacks", () => {
    const before = new Date().toISOString();
    const result = transformDocumentData(
      makeRawDocument({
        reviewStatus: undefined,
        flagColor: undefined,
        isPinned: undefined,
        processingStatus: undefined,
        createdAt: undefined,
        updatedAt: undefined,
      }),
    );
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

  it("passes through scalar fields unchanged", () => {
    const raw = makeRawDocument();
    const result = transformDocumentData(raw);

    expect(result.id).toBe(raw.id);
    expect(result.title).toBe(raw.title);
    expect(result.description).toBe(raw.description);
    expect(result.originalFilename).toBe(raw.originalFilename);
    expect(result.dueDate).toBe(raw.dueDate);
    expect(result.mimeType).toBe(raw.mimeType);
    expect(result.fileSize).toBe(raw.fileSize);
    expect(result.rawMetadata).toBe(raw.rawMetadata);
    expect(result.originalMimeType).toBe(raw.originalMimeType);
    expect(result.extractedText).toBe(raw.extractedText);
  });
});

// ---------------------------------------------------------------------------
// useDocuments hook — mutation tests
// ---------------------------------------------------------------------------

describe("useDocuments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createDocument sends POST with FormData (not JSON stringified)", async () => {
    // Initial list fetch
    mockApiFetch.mockResolvedValueOnce(mockJsonResponse({ items: [] }));

    const { result } = renderHook(() => useDocuments(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const formData = new FormData();
    formData.append("file", new Blob(["pdf-content"]), "report.pdf");
    formData.append("title", "Report");

    // Create mutation
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse(makeRawDocument({ id: "doc-new" })),
    );
    // Refetch after cache invalidation
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({ items: [makeRawDocument({ id: "doc-new" })] }),
    );

    await result.current.createDocument(formData);

    expect(mockApiFetch).toHaveBeenCalledWith("/api/documents", {
      method: "POST",
      body: formData,
    });
  });
});

// ---------------------------------------------------------------------------
// useDocument hook — single item
// ---------------------------------------------------------------------------

describe("useDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { document, ... } fetched via useSingle", async () => {
    const raw = makeRawDocument({ id: "doc-42" });
    mockApiFetch.mockResolvedValueOnce(mockJsonResponse(raw));

    const { result } = renderHook(() => useDocument("doc-42"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockApiFetch).toHaveBeenCalledWith("/api/documents/doc-42");
    expect(result.current.document).toBeDefined();
    expect(result.current.document?.id).toBe("doc-42");
    expect(result.current.document?.title).toBe(raw.title);
  });
});
