// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ListableItem,
  type ListPageConfig,
  type ListPageOperations,
  useListPageState,
} from "@/hooks/use-list-page-state";

// ── Mocks ────────────────────────────────────────────────────────────────

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

let mockPreferences: {
  viewMode: string;
  sortBy: string;
  sortDir: "asc" | "desc";
} = {
  viewMode: "tile",
  sortBy: "createdAt",
  sortDir: "desc",
};
const mockUpdatePreference = vi.fn((key: string, value: string) => {
  mockPreferences = {
    ...mockPreferences,
    [key]: value,
  } as typeof mockPreferences;
});
vi.mock("@/hooks/use-view-preferences", () => ({
  useViewPreferences: () => [mockPreferences, mockUpdatePreference],
}));

vi.mock("@/lib/api-content", () => ({
  togglePin: vi.fn(),
  setFlagColor: vi.fn(),
}));

import { setFlagColor, togglePin } from "@/lib/api-content";

const mockTogglePin = vi.mocked(togglePin);
const mockSetFlagColor = vi.mocked(setFlagColor);

// ── Helpers ──────────────────────────────────────────────────────────────

interface TestItem extends ListableItem {
  content?: string;
}

function makeItem(id: string, overrides: Partial<TestItem> = {}): TestItem {
  return {
    id,
    title: `Item ${id}`,
    description: null,
    tags: [],
    createdAt: "2025-01-01T00:00:00Z",
    isPinned: false,
    flagColor: null,
    processingStatus: null,
    processingEnabled: true,
    ...overrides,
  };
}

const testConfig: ListPageConfig<TestItem> = {
  pageType: "notes",
  contentType: "notes",
  entityName: "note",
  entityNamePlural: "notes",
  sortOptions: [
    { value: "createdAt", label: "Date Created" },
    { value: "title", label: "Title" },
  ],
  groupableSortKeys: ["createdAt"],
  getGroupDate: (item) => item.createdAt,
};

function makeOperations(): ListPageOperations {
  return {
    refresh: vi.fn(),
    deleteItem: vi.fn().mockResolvedValue(undefined),
  };
}

const defaultTags = ["work", "personal"];

function renderState(
  items: TestItem[] = [],
  allTags: string[] = defaultTags,
  config = testConfig,
  ops?: ListPageOperations,
) {
  const operations = ops ?? makeOperations();
  return renderHook(() => useListPageState(items, allTags, config, operations));
}

// ── Tests ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockPreferences = { viewMode: "tile", sortBy: "createdAt", sortDir: "desc" };
});

describe("serverParams", () => {
  it("includes sortBy and sortDir from preferences", () => {
    mockPreferences = { viewMode: "tile", sortBy: "title", sortDir: "asc" };
    const { result } = renderState();
    expect(result.current.serverParams.sortBy).toBe("title");
    expect(result.current.serverParams.sortDir).toBe("asc");
  });

  it("includes tag filter when not 'all'", () => {
    const { result } = renderState();

    act(() => {
      result.current.handleTagFilterChange("work");
    });

    expect(result.current.serverParams.tags).toBe("work");
  });

  it("does not include tag filter when 'all'", () => {
    const { result } = renderState();
    expect(result.current.serverParams.tags).toBeUndefined();
  });

  it("includes extra filter values that differ from initial", () => {
    const configWithExtra: ListPageConfig<TestItem> = {
      ...testConfig,
      extraFilters: [{ key: "status", label: "Status", initialValue: "all" }],
    };

    const { result } = renderState([], defaultTags, configWithExtra);

    act(() => {
      result.current.setExtraFilter("status", "active");
    });

    expect(result.current.serverParams.status).toBe("active");
  });
});

describe("sortedItems passthrough", () => {
  it("returns items as-is (server handles sorting)", () => {
    const items = [
      makeItem("1", { title: "Charlie" }),
      makeItem("2", { title: "Alpha" }),
    ];

    const { result } = renderState(items);

    expect(result.current.sortedItems).toEqual(items);
  });
});

describe("computed state", () => {
  it("allTags returns the provided tags", () => {
    const tags = ["a", "b", "c"];
    const { result } = renderState([], tags);
    expect(result.current.allTags).toEqual(tags);
  });

  it("activeFilterCount is 0 with no active filters", () => {
    const { result } = renderState();
    expect(result.current.activeFilterCount).toBe(0);
  });

  it("activeFilterCount counts tag filter", () => {
    const { result } = renderState();

    act(() => {
      result.current.handleTagFilterChange("work");
    });

    expect(result.current.activeFilterCount).toBe(1);
  });

  it("activeFilterCount counts extra filters", () => {
    const configWithExtra: ListPageConfig<TestItem> = {
      ...testConfig,
      extraFilters: [{ key: "status", label: "Status", initialValue: "all" }],
    };

    const { result } = renderState([], defaultTags, configWithExtra);

    act(() => {
      result.current.setExtraFilter("status", "active");
    });

    expect(result.current.activeFilterCount).toBe(1);
  });

  it("isGrouped is true when sortBy is in groupableSortKeys", () => {
    mockPreferences = {
      viewMode: "tile",
      sortBy: "createdAt",
      sortDir: "desc",
    };
    const { result } = renderState();
    expect(result.current.isGrouped).toBe(true);
  });

  it("isGrouped is false when sortBy is not in groupableSortKeys", () => {
    mockPreferences = { viewMode: "tile", sortBy: "title", sortDir: "asc" };
    const { result } = renderState();
    expect(result.current.isGrouped).toBe(false);
  });
});

describe("handlers", () => {
  it("clearSearch resets search query", () => {
    const { result } = renderState();

    act(() => {
      result.current.handleSearchChange({
        target: { value: "query" },
      } as React.ChangeEvent<HTMLInputElement>);
    });
    expect(result.current.searchQuery).toBe("query");

    act(() => {
      result.current.clearSearch();
    });
    expect(result.current.searchQuery).toBe("");
  });

  it("clearAllFilters resets tag and extra filters", () => {
    const configWithExtra: ListPageConfig<TestItem> = {
      ...testConfig,
      extraFilters: [{ key: "status", label: "Status", initialValue: "all" }],
    };

    const { result } = renderState(
      [makeItem("1", { tags: ["work"] })],
      defaultTags,
      configWithExtra,
    );

    act(() => {
      result.current.handleTagFilterChange("work");
      result.current.setExtraFilter("status", "active");
    });
    expect(result.current.activeFilterCount).toBe(2);

    act(() => {
      result.current.clearAllFilters();
    });
    expect(result.current.filterTag).toBe("all");
    expect(result.current.extraFilters.status).toBe("all");
    expect(result.current.activeFilterCount).toBe(0);
  });

  it("handleSortByChange updates preference", () => {
    const { result } = renderState();

    act(() => {
      result.current.handleSortByChange("title");
    });

    expect(mockUpdatePreference).toHaveBeenCalledWith("sortBy", "title");
  });

  it("toggleSortDir flips direction", () => {
    mockPreferences = {
      viewMode: "tile",
      sortBy: "createdAt",
      sortDir: "desc",
    };
    const { result } = renderState();

    act(() => {
      result.current.toggleSortDir();
    });

    expect(mockUpdatePreference).toHaveBeenCalledWith("sortDir", "asc");
  });
});

describe("pin/flag actions", () => {
  function okResponse() {
    return { ok: true, status: 200 } as unknown as Response;
  }

  it("handlePinToggle calls togglePin and refreshes", async () => {
    mockTogglePin.mockResolvedValueOnce(okResponse());
    const ops = makeOperations();
    const { result } = renderState(
      [makeItem("1")],
      defaultTags,
      testConfig,
      ops,
    );

    const item = result.current.sortedItems[0]!;
    await act(() => result.current.handlePinToggle(item));

    expect(mockTogglePin).toHaveBeenCalledWith("notes", "1", true);
    expect(ops.refresh).toHaveBeenCalled();
  });

  it("handleFlagColorChange calls setFlagColor and refreshes", async () => {
    mockSetFlagColor.mockResolvedValueOnce(okResponse());
    const ops = makeOperations();
    const { result } = renderState(
      [makeItem("1")],
      defaultTags,
      testConfig,
      ops,
    );

    const item = result.current.sortedItems[0]!;
    await act(() => result.current.handleFlagColorChange(item, "red"));

    expect(mockSetFlagColor).toHaveBeenCalledWith("notes", "1", "red");
    expect(ops.refresh).toHaveBeenCalled();
  });
});

describe("delete flow", () => {
  it("openDeleteDialog → handleDeleteConfirmed calls deleteItem and closes", async () => {
    const ops = makeOperations();
    const { result } = renderState(
      [makeItem("1")],
      defaultTags,
      testConfig,
      ops,
    );

    act(() => {
      result.current.openDeleteDialog("1", "Item 1");
    });
    expect(result.current.isConfirmDeleteDialogOpen).toBe(true);
    expect(result.current.itemToDelete).toEqual({ id: "1", title: "Item 1" });

    await act(() => result.current.handleDeleteConfirmed());

    expect(ops.deleteItem).toHaveBeenCalledWith("1");
    expect(result.current.isConfirmDeleteDialogOpen).toBe(false);
    expect(result.current.itemToDelete).toBeNull();
  });

  it("closeDeleteDialog resets state", () => {
    const { result } = renderState();

    act(() => {
      result.current.openDeleteDialog("1", "Item 1");
    });

    act(() => {
      result.current.closeDeleteDialog();
    });

    expect(result.current.isConfirmDeleteDialogOpen).toBe(false);
    expect(result.current.itemToDelete).toBeNull();
  });
});
