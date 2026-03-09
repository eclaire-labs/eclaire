// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
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

const { mockToast } = vi.hoisted(() => {
  const mockToast = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  });
  return { mockToast };
});
vi.mock("sonner", () => ({
  toast: mockToast,
}));

import { apiFetch } from "@/lib/api-client";
import { setFlagColor, togglePin } from "@/lib/api-content";

const mockApiFetch = vi.mocked(apiFetch);
const mockTogglePin = vi.mocked(togglePin);
const mockSetFlagColor = vi.mocked(setFlagColor);

// ── Helpers ──────────────────────────────────────────────────────────────

function makeItem(
  overrides: Partial<
    Parameters<typeof useDetailPageActions>[0]["item"] & object
  > = {},
) {
  return {
    id: "item-1",
    title: "Test Item",
    isPinned: false,
    flagColor: null as string | null,
    processingStatus: null as string | null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    processingEnabled: true,
    ...overrides,
  };
}

function okResponse() {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
  } as unknown as Response;
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
  const item =
    itemOverrides === undefined ? makeItem() : makeItem(itemOverrides);

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
    expect(mockToast.success).toHaveBeenCalledWith(
      "Pinned",
      expect.objectContaining({ description: expect.any(String) }),
    );
  });

  it("shows unpin toast when already pinned", async () => {
    mockTogglePin.mockResolvedValueOnce(okResponse());
    const { result } = renderActions({ isPinned: true });

    await act(() => result.current.handlePinToggle());

    expect(mockTogglePin).toHaveBeenCalledWith("notes", "item-1", false);
    expect(mockToast.success).toHaveBeenCalledWith(
      "Unpinned",
      expect.objectContaining({ description: expect.any(String) }),
    );
  });

  it("shows error toast on failure response", async () => {
    mockTogglePin.mockResolvedValueOnce(errorResponse());
    const { result, refresh } = renderActions();

    await act(() => result.current.handlePinToggle());

    expect(refresh).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledWith(
      "Error",
      expect.objectContaining({ description: expect.any(String) }),
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
    expect(mockToast.success).toHaveBeenCalledWith(
      "Flag Updated",
      expect.objectContaining({ description: expect.any(String) }),
    );
  });

  it("shows 'Flag Removed' when color is null", async () => {
    mockSetFlagColor.mockResolvedValueOnce(okResponse());
    const { result } = renderActions({ flagColor: "red" });

    await act(() => result.current.handleFlagColorChange(null));

    expect(mockToast.success).toHaveBeenCalledWith(
      "Flag Removed",
      expect.objectContaining({ description: expect.any(String) }),
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
    expect(mockToast.success).toHaveBeenCalledWith(
      "Reprocessing Started",
      expect.objectContaining({ description: expect.any(String) }),
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
    expect(mockToast.error).toHaveBeenCalledWith(
      "Error",
      expect.objectContaining({ description: "Queue full" }),
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
    expect(mockToast.success).toHaveBeenCalledWith(
      "Note deleted",
      expect.objectContaining({ description: expect.any(String) }),
    );
  });

  it("shows error toast on failure", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("Network error"));
    const { result, onDeleted } = renderActions();

    await act(() => result.current.confirmDelete());

    expect(onDeleted).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledWith(
      "Error",
      expect.objectContaining({ description: expect.any(String) }),
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
