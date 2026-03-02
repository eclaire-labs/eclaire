import { beforeEach, describe, expect, it, vi } from "vitest";
import { togglePin, setFlagColor, updateReviewStatus } from "@/lib/api-content";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

describe("togglePin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls correct URL for bookmarks", async () => {
    await togglePin("bookmarks", "abc-123", true);
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/bookmarks/abc-123/pin",
      expect.anything(),
    );
  });

  it("calls correct URL for tasks", async () => {
    await togglePin("tasks", "task-42", false);
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/tasks/task-42/pin",
      expect.anything(),
    );
  });

  it("sends { isPinned: true } when pinning", async () => {
    await togglePin("bookmarks", "id-1", true);
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ isPinned: true }),
      }),
    );
  });

  it("sends { isPinned: false } when unpinning", async () => {
    await togglePin("bookmarks", "id-1", false);
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ isPinned: false }),
      }),
    );
  });
});

describe("setFlagColor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls correct URL for notes", async () => {
    await setFlagColor("notes", "note-7", "red");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/notes/note-7/flag",
      expect.anything(),
    );
  });

  it("sends correct body with color value", async () => {
    await setFlagColor("photos", "photo-1", "blue");
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ flagColor: "blue" }),
      }),
    );
  });

  it("sends { flagColor: null } to clear flag", async () => {
    await setFlagColor("documents", "doc-5", null);
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ flagColor: null }),
      }),
    );
  });
});

describe("updateReviewStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls correct URL for documents", async () => {
    await updateReviewStatus("documents", "doc-99", "pending");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/documents/doc-99/review",
      expect.anything(),
    );
  });

  it("sends { reviewStatus: 'accepted' }", async () => {
    await updateReviewStatus("tasks", "task-1", "accepted");
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ reviewStatus: "accepted" }),
      }),
    );
  });
});

describe("all content functions use PATCH method", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("togglePin uses PATCH", async () => {
    await togglePin("bookmarks", "id-1", true);
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("setFlagColor uses PATCH", async () => {
    await setFlagColor("notes", "id-2", "green");
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("updateReviewStatus uses PATCH", async () => {
    await updateReviewStatus("documents", "id-3", "rejected");
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});

describe("URL construction for all content types", () => {
  const contentTypes = [
    "bookmarks",
    "tasks",
    "notes",
    "photos",
    "documents",
  ] as const;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("constructs correct pin URL for every content type", async () => {
    for (const type of contentTypes) {
      vi.clearAllMocks();
      await togglePin(type, "id-1", true);
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/api/${type}/id-1/pin`,
        expect.anything(),
      );
    }
  });
});
