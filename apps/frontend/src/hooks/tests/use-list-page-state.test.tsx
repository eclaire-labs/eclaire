// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ListPageConfig,
  type ListPageOperations,
  type ListableItem,
  useListPageState,
} from "@/hooks/use-list-page-state";

// ── Mocks ────────────────────────────────────────────────────────────────

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

let mockPreferences: { viewMode: string; sortBy: string; sortDir: "asc" | "desc" } = {
  viewMode: "tile",
  sortBy: "createdAt",
  sortDir: "desc",
};
const mockUpdatePreference = vi.fn((key: string, value: string) => {
  mockPreferences = { ...mockPreferences, [key]: value } as typeof mockPreferences;
});
vi.mock("@/hooks/use-view-preferences", () => ({
  useViewPreferences: () => [mockPreferences, mockUpdatePreference],
}));

vi.mock("@/lib/api-content", () => ({
  togglePin: vi.fn(),
  setFlagColor: vi.fn(),
}));

import { togglePin, setFlagColor } from "@/lib/api-content";
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
    enabled: true,
    ...overrides,
  };
}

const testConfig: ListPageConfig<TestItem> = {
  pageType: "notes",
  contentType: "notes",
  entityName: "note",
  entityNamePlural: "notes",
  getSearchableText: (item) => [item.title ?? "", item.description ?? "", item.content ?? ""],
  sortOptions: [
    {
      value: "createdAt",
      label: "Date Created",
      compareFn: (a, b, dir) => {
        const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        return dir === "asc" ? diff : -diff;
      },
    },
    {
      value: "title",
      label: "Title",
      compareFn: (a, b, dir) => {
        const diff = (a.title ?? "").localeCompare(b.title ?? "");
        return dir === "asc" ? diff : -diff;
      },
    },
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

function renderState(items: TestItem[] = [], config = testConfig, ops?: ListPageOperations) {
  const operations = ops ?? makeOperations();
  return renderHook(() => useListPageState(items, config, operations));
}

// ── Tests ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockPreferences = { viewMode: "tile", sortBy: "createdAt", sortDir: "desc" };
});

describe("filtering", () => {
  const items = [
    makeItem("1", { title: "Alpha Note", tags: ["work"], content: "hello world" }),
    makeItem("2", { title: "Beta Note", tags: ["personal"] }),
    makeItem("3", { title: "Gamma Note", tags: ["work", "personal"] }),
  ];

  it("returns all items with no search or filter", () => {
    const { result } = renderState(items);
    expect(result.current.filteredItems).toHaveLength(3);
  });

  it("filters by search query (title match)", () => {
    const { result } = renderState(items);

    act(() => {
      result.current.handleSearchChange({
        target: { value: "alpha" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.filteredItems).toHaveLength(1);
    expect(result.current.filteredItems[0]!.id).toBe("1");
  });

  it("filters by search query (content match)", () => {
    const { result } = renderState(items);

    act(() => {
      result.current.handleSearchChange({
        target: { value: "hello" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.filteredItems).toHaveLength(1);
    expect(result.current.filteredItems[0]!.id).toBe("1");
  });

  it("filters by tag", () => {
    const { result } = renderState(items);

    act(() => {
      result.current.handleTagFilterChange("personal");
    });

    expect(result.current.filteredItems).toHaveLength(2);
    expect(result.current.filteredItems.map((i) => i.id).sort()).toEqual(["2", "3"]);
  });

  it("combines search and tag filter", () => {
    const { result } = renderState(items);

    act(() => {
      result.current.handleSearchChange({
        target: { value: "gamma" },
      } as React.ChangeEvent<HTMLInputElement>);
      result.current.handleTagFilterChange("work");
    });

    expect(result.current.filteredItems).toHaveLength(1);
    expect(result.current.filteredItems[0]!.id).toBe("3");
  });

  it("applies extra filters", () => {
    const configWithExtra: ListPageConfig<TestItem> = {
      ...testConfig,
      extraFilters: [
        {
          key: "pinned",
          label: "Pinned",
          initialValue: "all",
          matchFn: (item, value) => value === "all" || (value === "pinned" && item.isPinned),
        },
      ],
    };

    const itemsWithPin = [
      makeItem("1", { isPinned: true }),
      makeItem("2", { isPinned: false }),
    ];

    const { result } = renderState(itemsWithPin, configWithExtra);

    act(() => {
      result.current.setExtraFilter("pinned", "pinned");
    });

    expect(result.current.filteredItems).toHaveLength(1);
    expect(result.current.filteredItems[0]!.id).toBe("1");
  });
});

describe("sorting", () => {
  it("sorts by selected option and direction", () => {
    mockPreferences = { viewMode: "tile", sortBy: "title", sortDir: "asc" };

    const items = [
      makeItem("1", { title: "Charlie" }),
      makeItem("2", { title: "Alpha" }),
      makeItem("3", { title: "Bravo" }),
    ];

    const { result } = renderState(items);

    expect(result.current.sortedItems.map((i) => i.title)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ]);
  });

  it("respects descending direction", () => {
    mockPreferences = { viewMode: "tile", sortBy: "title", sortDir: "desc" };

    const items = [
      makeItem("1", { title: "Alpha" }),
      makeItem("2", { title: "Charlie" }),
      makeItem("3", { title: "Bravo" }),
    ];

    const { result } = renderState(items);

    expect(result.current.sortedItems.map((i) => i.title)).toEqual([
      "Charlie",
      "Bravo",
      "Alpha",
    ]);
  });
});

describe("computed state", () => {
  it("allTags returns unique tags from all items", () => {
    const items = [
      makeItem("1", { tags: ["a", "b"] }),
      makeItem("2", { tags: ["b", "c"] }),
    ];

    const { result } = renderState(items);
    expect(result.current.allTags.sort()).toEqual(["a", "b", "c"]);
  });

  it("activeFilterCount is 0 with no active filters", () => {
    const { result } = renderState([]);
    expect(result.current.activeFilterCount).toBe(0);
  });

  it("activeFilterCount counts tag filter", () => {
    const { result } = renderState([makeItem("1", { tags: ["work"] })]);

    act(() => {
      result.current.handleTagFilterChange("work");
    });

    expect(result.current.activeFilterCount).toBe(1);
  });

  it("activeFilterCount counts extra filters", () => {
    const configWithExtra: ListPageConfig<TestItem> = {
      ...testConfig,
      extraFilters: [
        {
          key: "status",
          label: "Status",
          initialValue: "all",
          matchFn: () => true,
        },
      ],
    };

    const { result } = renderState([], configWithExtra);

    act(() => {
      result.current.setExtraFilter("status", "active");
    });

    expect(result.current.activeFilterCount).toBe(1);
  });

  it("isGrouped is true when sortBy is in groupableSortKeys", () => {
    mockPreferences = { viewMode: "tile", sortBy: "createdAt", sortDir: "desc" };
    const { result } = renderState([]);
    expect(result.current.isGrouped).toBe(true);
  });

  it("isGrouped is false when sortBy is not in groupableSortKeys", () => {
    mockPreferences = { viewMode: "tile", sortBy: "title", sortDir: "asc" };
    const { result } = renderState([]);
    expect(result.current.isGrouped).toBe(false);
  });
});

describe("handlers", () => {
  it("clearSearch resets search query", () => {
    const { result } = renderState([makeItem("1")]);

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
      extraFilters: [
        {
          key: "status",
          label: "Status",
          initialValue: "all",
          matchFn: () => true,
        },
      ],
    };

    const { result } = renderState([makeItem("1", { tags: ["work"] })], configWithExtra);

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
    const { result } = renderState([]);

    act(() => {
      result.current.handleSortByChange("title");
    });

    expect(mockUpdatePreference).toHaveBeenCalledWith("sortBy", "title");
  });

  it("toggleSortDir flips direction", () => {
    mockPreferences = { viewMode: "tile", sortBy: "createdAt", sortDir: "desc" };
    const { result } = renderState([]);

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
    const { result } = renderState([makeItem("1")], testConfig, ops);

    const item = result.current.sortedItems[0]!;
    await act(() => result.current.handlePinToggle(item));

    expect(mockTogglePin).toHaveBeenCalledWith("notes", "1", true);
    expect(ops.refresh).toHaveBeenCalled();
  });

  it("handleFlagColorChange calls setFlagColor and refreshes", async () => {
    mockSetFlagColor.mockResolvedValueOnce(okResponse());
    const ops = makeOperations();
    const { result } = renderState([makeItem("1")], testConfig, ops);

    const item = result.current.sortedItems[0]!;
    await act(() => result.current.handleFlagColorChange(item, "red"));

    expect(mockSetFlagColor).toHaveBeenCalledWith("notes", "1", "red");
    expect(ops.refresh).toHaveBeenCalled();
  });
});

describe("delete flow", () => {
  it("openDeleteDialog → handleDeleteConfirmed calls deleteItem and closes", async () => {
    const ops = makeOperations();
    const { result } = renderState([makeItem("1")], testConfig, ops);

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
    const { result } = renderState([makeItem("1")]);

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
