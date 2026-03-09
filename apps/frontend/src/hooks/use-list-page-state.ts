import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  type PageType,
  useViewPreferences,
  type ViewPreferences,
} from "@/hooks/use-view-preferences";
import { setFlagColor, togglePin } from "@/lib/api-content";
import type { ListParams } from "./create-crud-hooks";
import { useDebouncedValue } from "./use-debounced-value";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal interface that all entity types satisfy. */
export interface ListableItem {
  id: string;
  title: string | null;
  description?: string | null;
  tags: string[];
  createdAt: string;
  isPinned: boolean;
  flagColor: "red" | "yellow" | "orange" | "green" | "blue" | null;
  processingStatus: string | null;
  enabled: boolean;
}

export type FlagColor = "red" | "yellow" | "orange" | "green" | "blue" | null;

export type ContentType =
  | "bookmarks"
  | "tasks"
  | "notes"
  | "photos"
  | "documents";

export interface SortOption {
  value: string;
  label: string;
}

export interface ExtraFilterDef {
  key: string;
  label: string;
  initialValue: string;
  /** Options for the filter dropdown. */
  options?: { value: string; label: string }[];
}

/** Per-page static configuration object. */
export interface ListPageConfig<TItem extends ListableItem> {
  pageType: PageType;
  contentType: ContentType;
  entityName: string;
  entityNamePlural: string;
  sortOptions: SortOption[];
  extraFilters?: ExtraFilterDef[];
  /** Which sortBy keys should trigger date-based grouping. */
  groupableSortKeys: string[];
  /** Extract the date value to group by, given the current sortBy key. */
  getGroupDate: (item: TItem, sortBy: string) => string | number | null;
}

/** What the page must supply besides the config (from its React Query hook). */
export interface ListPageOperations {
  refresh: () => void;
  deleteItem: (id: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface ListPageState<TItem extends ListableItem> {
  // View preferences
  viewMode: string;
  sortBy: string;
  sortDir: "asc" | "desc";

  // Search & filter
  searchQuery: string;
  filterTag: string;
  extraFilters: Record<string, string>;
  allTags: string[];
  activeFilterCount: number;

  // Server params (to pass to the CRUD hook)
  serverParams: ListParams;

  // Items come from the server (passed through, not filtered/sorted locally)
  sortedItems: TItem[];
  isGrouped: boolean;

  // Focus
  focusedIndex: number;
  setFocusedIndex: (index: number) => void;

  // Filter dialog (mobile)
  isFilterDialogOpen: boolean;
  setIsFilterDialogOpen: (open: boolean) => void;

  // Delete confirmation
  isConfirmDeleteDialogOpen: boolean;
  itemToDelete: { id: string; title: string } | null;

  // Search ref (for focus-after-clear)
  searchInputRef: React.RefObject<HTMLInputElement | null>;

  // Handlers
  handleSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  clearSearch: () => void;
  handleTagFilterChange: (value: string) => void;
  setExtraFilter: (key: string, value: string) => void;
  handleSortByChange: (value: string) => void;
  toggleSortDir: () => void;
  handleViewModeChange: (value: string) => void;
  clearAllFilters: () => void;
  handlePinToggle: (item: TItem) => Promise<void>;
  handleFlagColorChange: (item: TItem, color: FlagColor) => Promise<void>;
  handleChatClick: (item: TItem) => void;
  openDeleteDialog: (id: string, title: string) => void;
  handleDeleteConfirmed: () => Promise<void>;
  closeDeleteDialog: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useListPageState<TItem extends ListableItem>(
  items: TItem[],
  allTags: string[],
  config: ListPageConfig<TItem>,
  operations: ListPageOperations,
): ListPageState<TItem> {
  // View preferences (persisted in localStorage)
  const [viewPreferences, updateViewPreference] = useViewPreferences(
    config.pageType,
  );
  const { viewMode, sortBy, sortDir } = viewPreferences;

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTag, setFilterTag] = useState("all");
  const [extraFilterState, setExtraFilterState] = useState<
    Record<string, string>
  >(() => {
    const init: Record<string, string> = {};
    for (const f of config.extraFilters ?? []) {
      init[f.key] = f.initialValue;
    }
    return init;
  });

  // Debounce search for server requests
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  // UI state
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] =
    useState(false);
  const [itemToDelete, setItemToDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Derived: active filter count (for mobile badge)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterTag !== "all") count++;
    for (const f of config.extraFilters ?? []) {
      if (extraFilterState[f.key] !== f.initialValue) count++;
    }
    return count;
  }, [filterTag, extraFilterState, config.extraFilters]);

  // Build server params from current state
  const serverParams: ListParams = useMemo(() => {
    const params: ListParams = {
      sortBy,
      sortDir,
    };
    if (debouncedSearch) {
      params.text = debouncedSearch;
    }
    if (filterTag !== "all") {
      params.tags = filterTag;
    }
    // Include extra filters that aren't at their initial value
    for (const f of config.extraFilters ?? []) {
      const val = extraFilterState[f.key];
      if (val && val !== f.initialValue) {
        params[f.key] = val;
      }
    }
    return params;
  }, [
    sortBy,
    sortDir,
    debouncedSearch,
    filterTag,
    extraFilterState,
    config.extraFilters,
  ]);

  // Items from server are already sorted — pass through directly
  const sortedItems = items;

  // Derived: should show date group headers?
  const isGrouped = config.groupableSortKeys.includes(sortBy);

  // ---- Handlers ----

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
      setFocusedIndex(-1);
    },
    [],
  );

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    searchInputRef.current?.focus();
  }, []);

  const handleTagFilterChange = useCallback((value: string) => {
    setFilterTag(value);
    setFocusedIndex(-1);
  }, []);

  const setExtraFilter = useCallback((key: string, value: string) => {
    setExtraFilterState((prev) => ({ ...prev, [key]: value }));
    setFocusedIndex(-1);
  }, []);

  const handleSortByChange = useCallback(
    (value: string) => {
      updateViewPreference(
        "sortBy",
        value as ViewPreferences[keyof ViewPreferences],
      );
      setFocusedIndex(-1);
    },
    [updateViewPreference],
  );

  const toggleSortDir = useCallback(() => {
    updateViewPreference("sortDir", sortDir === "asc" ? "desc" : "asc");
    setFocusedIndex(-1);
  }, [updateViewPreference, sortDir]);

  const handleViewModeChange = useCallback(
    (value: string) => {
      if (value) {
        updateViewPreference(
          "viewMode",
          value as ViewPreferences[keyof ViewPreferences],
        );
        setFocusedIndex(-1);
      }
    },
    [updateViewPreference],
  );

  const clearAllFilters = useCallback(() => {
    setFilterTag("all");
    const reset: Record<string, string> = {};
    for (const f of config.extraFilters ?? []) {
      reset[f.key] = f.initialValue;
    }
    setExtraFilterState(reset);
    setFocusedIndex(-1);
  }, [config.extraFilters]);

  // Pin toggle
  const handlePinToggle = useCallback(
    async (item: TItem) => {
      const newPinned = !item.isPinned;
      try {
        const response = await togglePin(
          config.contentType,
          item.id,
          newPinned,
        );
        if (!response.ok) {
          throw new Error(
            `Failed to ${newPinned ? "pin" : "unpin"} ${config.entityName}`,
          );
        }
        operations.refresh();
        toast.success(
          newPinned
            ? `${capitalize(config.entityName)} pinned`
            : `${capitalize(config.entityName)} unpinned`,
          {
            description: `"${item.title ?? "Untitled"}" has been ${newPinned ? "pinned" : "unpinned"}.`,
          },
        );
      } catch (error) {
        toast.error("Error", {
          description:
            error instanceof Error
              ? error.message
              : "Failed to update pin status",
        });
      }
    },
    [config.contentType, config.entityName, operations],
  );

  // Flag color change
  const handleFlagColorChange = useCallback(
    async (item: TItem, color: FlagColor) => {
      try {
        const response = await setFlagColor(config.contentType, item.id, color);
        if (!response.ok) {
          throw new Error("Failed to update flag color");
        }
        operations.refresh();
        toast.success(
          color ? `${capitalize(config.entityName)} flagged` : "Flag removed",
          {
            description: color
              ? `"${item.title ?? "Untitled"}" has been flagged as ${color}.`
              : `Flag removed from "${item.title ?? "Untitled"}".`,
          },
        );
      } catch (error) {
        toast.error("Error", {
          description:
            error instanceof Error
              ? error.message
              : "Failed to update flag color",
        });
      }
    },
    [config.contentType, config.entityName, operations],
  );

  // Chat
  const handleChatClick = useCallback(
    (item: TItem) => {
      if (
        typeof window !== "undefined" &&
        // biome-ignore lint/suspicious/noExplicitAny: global window extension for assistant
        (window as any).openAssistantWithAssets
      ) {
        // biome-ignore lint/suspicious/noExplicitAny: global window extension for assistant
        (window as any).openAssistantWithAssets([
          {
            type: config.contentType.replace(/s$/, ""), // "bookmarks" -> "bookmark"
            id: item.id,
            title: item.title,
          },
        ]);
      }
    },
    [config.contentType],
  );

  // Delete
  const openDeleteDialog = useCallback((id: string, title: string) => {
    setItemToDelete({ id, title });
    setIsConfirmDeleteDialogOpen(true);
  }, []);

  const closeDeleteDialog = useCallback(() => {
    setIsConfirmDeleteDialogOpen(false);
    setItemToDelete(null);
  }, []);

  const handleDeleteConfirmed = useCallback(async () => {
    if (!itemToDelete) return;
    try {
      await operations.deleteItem(itemToDelete.id);
      closeDeleteDialog();
      toast.success(`${capitalize(config.entityName)} deleted`, {
        description: `"${itemToDelete.title}" has been deleted.`,
      });
    } catch (error) {
      console.error(`Error deleting ${config.entityName}:`, error);
      toast.error("Error", {
        description: `Failed to delete ${config.entityName}. Please try again.`,
      });
    }
  }, [itemToDelete, operations, closeDeleteDialog, config.entityName]);

  return {
    viewMode,
    sortBy,
    sortDir,
    searchQuery,
    filterTag,
    extraFilters: extraFilterState,
    allTags,
    activeFilterCount,
    serverParams,
    sortedItems,
    isGrouped,
    focusedIndex,
    setFocusedIndex,
    isFilterDialogOpen,
    setIsFilterDialogOpen,
    isConfirmDeleteDialogOpen,
    itemToDelete,
    searchInputRef,
    handleSearchChange,
    clearSearch,
    handleTagFilterChange,
    setExtraFilter,
    handleSortByChange,
    toggleSortDir,
    handleViewModeChange,
    clearAllFilters,
    handlePinToggle,
    handleFlagColorChange,
    handleChatClick,
    openDeleteDialog,
    handleDeleteConfirmed,
    closeDeleteDialog,
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
