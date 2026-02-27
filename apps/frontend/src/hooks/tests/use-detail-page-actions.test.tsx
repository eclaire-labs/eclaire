// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDetailPageActions } from "@/hooks/use-detail-page-actions";

// ── Mocks ────────────────────────────────────────────────────────────────

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/api-content", () => ({
  togglePin: vi.fn(),
  setFlagColor: vi.fn(),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

import { apiFetch } from "@/lib/api-client";
import { togglePin, setFlagColor } from "@/lib/api-content";
const mockApiFetch = vi.mocked(apiFetch);
const mockTogglePin = vi.mocked(togglePin);
const mockSetFlagColor = vi.mocked(setFlagColor);

// ── Helpers ──────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<Parameters<typeof useDetailPageActions>[0]["item"] & object> = {}) {
  return {
    id: "item-1",
    title: "Test Item",
    isPinned: false,
    flagColor: null as string | null,
    processingStatus: null as string | null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    enabled: true,
    ...overrides,
  };
}

function okResponse() {
  return { ok: true, status: 200, json: () => Promise.resolve({}) } as unknown as Response;
}

function errorResponse(body = { error: "Something went wrong" }) {
  return {
    ok: false,
    status: 500,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function renderActions(itemOverrides?: Parameters<typeof makeItem>[0]) {
  const refresh = vi.fn();
  const onDeleted = vi.fn();
  const onReprocessed = vi.fn();
  const item = itemOverrides === undefined ? makeItem() : makeItem(itemOverrides);

  const { result } = renderHook(() =>
    useDetailPageActions({
      contentType: "notes",
      item,
      refresh,
      onDeleted,
      onReprocessed,
    }),
  );

  return { result, refresh, onDeleted, onReprocessed };
}

// ── Tests ────────────────────────────────────────────────────────────────

beforeEach(() => vi.clearAllMocks());

describe("label", () => {
  it("capitalizes the singular entity name", () => {
    const { result } = renderActions();
    expect(result.current.label).toBe("Note");
  });
});

describe("handlePinToggle", () => {
  it("calls togglePin with !isPinned and refreshes on success", async () => {
    mockTogglePin.mockResolvedValueOnce(okResponse());
    const { result, refresh } = renderActions({ isPinned: false });

    await act(() => result.current.handlePinToggle());

    expect(mockTogglePin).toHaveBeenCalledWith("notes", "item-1", true);
    expect(refresh).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Pinned" }),
    );
  });

  it("shows unpin toast when already pinned", async () => {
    mockTogglePin.mockResolvedValueOnce(okResponse());
    const { result } = renderActions({ isPinned: true });

    await act(() => result.current.handlePinToggle());

    expect(mockTogglePin).toHaveBeenCalledWith("notes", "item-1", false);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Unpinned" }),
    );
  });

  it("shows error toast on failure response", async () => {
    mockTogglePin.mockResolvedValueOnce(errorResponse());
    const { result, refresh } = renderActions();

    await act(() => result.current.handlePinToggle());

    expect(refresh).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
  });
});

describe("handleFlagColorChange", () => {
  it("calls setFlagColor and refreshes on success", async () => {
    mockSetFlagColor.mockResolvedValueOnce(okResponse());
    const { result, refresh } = renderActions();

    await act(() => result.current.handleFlagColorChange("red"));

    expect(mockSetFlagColor).toHaveBeenCalledWith("notes", "item-1", "red");
    expect(refresh).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Flag Updated" }),
    );
  });

  it("shows 'Flag Removed' when color is null", async () => {
    mockSetFlagColor.mockResolvedValueOnce(okResponse());
    const { result } = renderActions({ flagColor: "red" });

    await act(() => result.current.handleFlagColorChange(null));

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Flag Removed" }),
    );
  });
});

describe("handleFlagToggle", () => {
  it("sets orange when no flag", async () => {
    mockSetFlagColor.mockResolvedValueOnce(okResponse());
    const { result } = renderActions({ flagColor: null });

    await act(() => result.current.handleFlagToggle());

    expect(mockSetFlagColor).toHaveBeenCalledWith("notes", "item-1", "orange");
  });

  it("removes flag when already flagged", async () => {
    mockSetFlagColor.mockResolvedValueOnce(okResponse());
    const { result } = renderActions({ flagColor: "blue" });

    await act(() => result.current.handleFlagToggle());

    expect(mockSetFlagColor).toHaveBeenCalledWith("notes", "item-1", null);
  });
});

describe("handleReprocess", () => {
  it("POSTs to reprocess endpoint and calls onReprocessed", async () => {
    mockApiFetch.mockResolvedValueOnce(okResponse());
    const { result, onReprocessed } = renderActions();

    await act(() => result.current.handleReprocess());

    expect(mockApiFetch).toHaveBeenCalledWith("/api/notes/item-1/reprocess", {
      method: "POST",
    });
    expect(onReprocessed).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Reprocessing Started" }),
    );
  });

  it("sends { force: true } when item is stuck", async () => {
    mockApiFetch.mockResolvedValueOnce(okResponse());
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { result } = renderActions({
      processingStatus: "pending",
      createdAt: twentyMinAgo,
      updatedAt: twentyMinAgo,
    });

    await act(() => result.current.handleReprocess());

    expect(mockApiFetch).toHaveBeenCalledWith("/api/notes/item-1/reprocess", {
      method: "POST",
      body: JSON.stringify({ force: true }),
    });
  });

  it("shows error toast on failure", async () => {
    mockApiFetch.mockResolvedValueOnce(errorResponse({ error: "Queue full" }));
    const { result, onReprocessed } = renderActions();

    await act(() => result.current.handleReprocess());

    expect(onReprocessed).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Error",
        description: "Queue full",
      }),
    );
  });
});

describe("confirmDelete", () => {
  it("DELETEs the item, closes dialog, toasts, and calls onDeleted", async () => {
    mockApiFetch.mockResolvedValueOnce(okResponse());
    const { result, onDeleted } = renderActions();

    await act(() => result.current.confirmDelete());

    expect(mockApiFetch).toHaveBeenCalledWith("/api/notes/item-1", {
      method: "DELETE",
    });
    expect(onDeleted).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Note deleted" }),
    );
  });

  it("shows error toast on failure", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("Network error"));
    const { result, onDeleted } = renderActions();

    await act(() => result.current.confirmDelete());

    expect(onDeleted).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
  });
});

describe("isJobStuck", () => {
  it("returns false for non-stuck item", () => {
    const { result } = renderActions({ processingStatus: null });
    expect(result.current.isJobStuck).toBe(false);
  });

  it("returns true for stuck pending item", () => {
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { result } = renderActions({
      processingStatus: "pending",
      createdAt: twentyMinAgo,
      updatedAt: twentyMinAgo,
    });
    expect(result.current.isJobStuck).toBe(true);
  });
});
