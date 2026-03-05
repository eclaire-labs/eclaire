import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentLink } from "@/types/message";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";
import {
  detectContentLinks,
  fetchContentMetadata,
  fetchContentMetadataBatch,
} from "@/lib/content-links";

const mockedApiFetch = apiFetch as Mock;

// ---------------------------------------------------------------------------
// Helper: build a mock Response
// ---------------------------------------------------------------------------
const okResponse = (body: unknown) => ({
  ok: true,
  json: () => Promise.resolve(body),
});

const notOkResponse = () => ({
  ok: false,
  json: () => Promise.resolve({}),
});

// ---------------------------------------------------------------------------
// detectContentLinks
// ---------------------------------------------------------------------------
describe("detectContentLinks", () => {
  it("detects a single bookmark link", () => {
    const links = detectContentLinks("check /bookmarks/abc123");
    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({
      type: "bookmark",
      id: "abc123",
      url: "/bookmarks/abc123",
      title: "bookmark abc123",
    });
  });

  it("detects multiple links of different types in the same text", () => {
    const text =
      "see /bookmarks/b1 and /documents/d2 and also /tasks/t3 for context";
    const links = detectContentLinks(text);
    expect(links).toHaveLength(3);
    expect(links.map((l) => l.type)).toEqual(["bookmark", "document", "task"]);
    expect(links.map((l) => l.id)).toEqual(["b1", "d2", "t3"]);
  });

  it("returns an empty array when there are no links", () => {
    expect(detectContentLinks("nothing here")).toEqual([]);
    expect(detectContentLinks("")).toEqual([]);
  });

  it("detects all five entity types correctly", () => {
    const text = [
      "/bookmarks/b1",
      "/documents/d1",
      "/photos/p1",
      "/tasks/t1",
      "/notes/n1",
    ].join(" ");
    const links = detectContentLinks(text);
    expect(links).toHaveLength(5);
    expect(links.map((l) => l.type)).toEqual([
      "bookmark",
      "document",
      "photo",
      "task",
      "note",
    ]);
  });

  it("handles IDs containing hyphens", () => {
    const links = detectContentLinks("/bookmarks/abc-123-def");
    expect(links).toHaveLength(1);
    expect(links[0]!.id).toBe("abc-123-def");
  });

  it("handles IDs containing underscores", () => {
    const links = detectContentLinks("/bookmarks/abc_123");
    expect(links).toHaveLength(1);
    expect(links[0]!.id).toBe("abc_123");
  });

  it("sets url and title correctly", () => {
    const links = detectContentLinks("/documents/myDoc42");
    expect(links).toHaveLength(1);
    expect(links[0]!.url).toBe("/documents/myDoc42");
    expect(links[0]!.title).toBe("document myDoc42");
  });
});

// ---------------------------------------------------------------------------
// fetchContentMetadata
// ---------------------------------------------------------------------------
describe("fetchContentMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and enriches a bookmark link", async () => {
    const bookmarkPayload = {
      title: "Example Site",
      description: "A cool site",
      url: "https://example.com",
      tags: ["web"],
      processingStatus: "completed",
      createdAt: "2025-01-01",
      author: "alice",
      faviconUrl: "fav-storage-id",
      thumbnailUrl: "screenshot-storage-id",
      reviewStatus: "reviewed",
      flagColor: "blue",
      isPinned: true,
    };
    mockedApiFetch.mockResolvedValue(okResponse(bookmarkPayload));

    const link: ContentLink = {
      type: "bookmark",
      id: "bk1",
      url: "/bookmarks/bk1",
      title: "bookmark bk1",
    };

    const result = await fetchContentMetadata(link);

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/bookmarks/bk1");
    expect(result.title).toBe("Example Site");
    expect(result.description).toBe("A cool site");
    expect(result.metadata).toEqual({
      originalUrl: "https://example.com",
      tags: ["web"],
      status: "completed",
      createdAt: "2025-01-01",
      author: "alice",
      faviconStorageId: "fav-storage-id",
      screenshotDesktopStorageId: "screenshot-storage-id",
      reviewStatus: "reviewed",
      flagColor: "blue",
      isPinned: true,
    });
  });

  it("defaults bookmark title to 'Untitled Bookmark' when missing", async () => {
    mockedApiFetch.mockResolvedValue(
      okResponse({ title: "", description: "" }),
    );

    const link: ContentLink = {
      type: "bookmark",
      id: "bk2",
      url: "/bookmarks/bk2",
      title: "bookmark bk2",
    };

    const result = await fetchContentMetadata(link);

    expect(result.title).toBe("Untitled Bookmark");
    expect(result.description).toBe("No description available");
  });

  it("fetches and enriches a task link", async () => {
    const taskPayload = {
      title: "Fix bug",
      description: "Fix the login bug",
      status: "in_progress",
      dueDate: "2025-06-01",
      assignedToId: "user-42",
      tags: ["urgent"],
      processingStatus: "completed",
      createdAt: "2025-01-01",
      reviewStatus: "pending",
      flagColor: null,
      isPinned: false,
      isRecurring: false,
      cronExpression: null,
      nextRunAt: null,
      lastRunAt: null,
      completedAt: null,
    };
    mockedApiFetch.mockResolvedValue(okResponse(taskPayload));

    const link: ContentLink = {
      type: "task",
      id: "t1",
      url: "/tasks/t1",
      title: "task t1",
    };

    const result = await fetchContentMetadata(link);

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/tasks/t1");
    expect(result.title).toBe("Fix bug");
    expect(result.description).toBe("Fix the login bug");
    expect(result.metadata).toEqual({
      status: "in_progress",
      dueDate: "2025-06-01",
      assignedToId: "user-42",
      tags: ["urgent"],
      processingStatus: "completed",
      createdAt: "2025-01-01",
      reviewStatus: "pending",
      flagColor: null,
      isPinned: false,
      isRecurring: false,
      cronExpression: null,
      nextRunAt: null,
      lastRunAt: null,
      completedAt: null,
    });
  });

  it("falls back to truncated content for note description", async () => {
    const longContent = "A".repeat(250);
    mockedApiFetch.mockResolvedValue(
      okResponse({
        title: "My Note",
        description: "",
        content: longContent,
        tags: [],
        processingStatus: "completed",
        createdAt: "2025-01-01",
        reviewStatus: null,
        flagColor: null,
        isPinned: false,
        dueDate: null,
        originalMimeType: "text/plain",
      }),
    );

    const link: ContentLink = {
      type: "note",
      id: "n1",
      url: "/notes/n1",
      title: "note n1",
    };

    const result = await fetchContentMetadata(link);

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/notes/n1");
    expect(result.description).toBe(`${"A".repeat(200)}...`);
  });

  it("returns the original link when the API returns a non-OK response", async () => {
    mockedApiFetch.mockResolvedValue(notOkResponse());

    const link: ContentLink = {
      type: "bookmark",
      id: "bk-fail",
      url: "/bookmarks/bk-fail",
      title: "bookmark bk-fail",
    };

    const result = await fetchContentMetadata(link);

    expect(result).toEqual(link);
  });

  it("returns the original link when the API throws an exception", async () => {
    mockedApiFetch.mockRejectedValue(new Error("Network error"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const link: ContentLink = {
      type: "document",
      id: "d-err",
      url: "/documents/d-err",
      title: "document d-err",
    };

    const result = await fetchContentMetadata(link);

    expect(result).toEqual(link);
    expect(consoleSpy).toHaveBeenCalledWith(
      "Failed to fetch metadata for link:",
      link,
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// fetchContentMetadataBatch
// ---------------------------------------------------------------------------
describe("fetchContentMetadataBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls fetchContentMetadata for each link in parallel", async () => {
    const bookmarkPayload = { title: "B1", description: "desc-b1" };
    const taskPayload = {
      title: "T1",
      description: "desc-t1",
      status: "open",
    };

    mockedApiFetch
      .mockResolvedValueOnce(okResponse(bookmarkPayload))
      .mockResolvedValueOnce(okResponse(taskPayload));

    const links: ContentLink[] = [
      { type: "bookmark", id: "b1", url: "/bookmarks/b1", title: "bookmark b1" },
      { type: "task", id: "t1", url: "/tasks/t1", title: "task t1" },
    ];

    const results = await fetchContentMetadataBatch(links);

    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/bookmarks/b1");
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/tasks/t1");
    expect(results).toHaveLength(2);
  });

  it("returns an array of enriched links", async () => {
    mockedApiFetch
      .mockResolvedValueOnce(
        okResponse({ title: "Enriched B", description: "enriched desc" }),
      )
      .mockResolvedValueOnce(
        okResponse({
          title: "Enriched N",
          description: "enriched note desc",
          content: "some note content",
        }),
      );

    const links: ContentLink[] = [
      { type: "bookmark", id: "b2", url: "/bookmarks/b2", title: "bookmark b2" },
      { type: "note", id: "n2", url: "/notes/n2", title: "note n2" },
    ];

    const results = await fetchContentMetadataBatch(links);

    expect(results[0]!.title).toBe("Enriched B");
    expect(results[0]!.description).toBe("enriched desc");
    expect(results[1]!.title).toBe("Enriched N");
    expect(results[1]!.description).toBe("enriched note desc");
  });
});
