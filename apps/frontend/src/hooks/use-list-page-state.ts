import { useCallback, useMemo, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  type PageType,
  type ViewPreferences,
  useViewPreferences,
} from "@/hooks/use-view-preferences";
import { setFlagColor, togglePin } from "@/lib/api-content";

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

export interface SortOption<TItem> {
  value: string;
  label: string;
  compareFn: (a: TItem, b: TItem, dir: "asc" | "desc") => number;
}

export interface ExtraFilterDef<TItem> {
  key: string;
  label: string;
  initialValue: string;
  matchFn: (item: TItem, filterValue: string) => boolean;
}

/** Per-page static configuration object. */
export interface ListPageConfig<TItem extends ListableItem> {
  pageType: PageType;
  contentType: ContentType;
  entityName: string;
  entityNamePlural: string;
  getSearchableText: (item: TItem) => string[];
  extraFilters?: ExtraFilterDef<TItem>[];
  sortOptions: SortOption<TItem>[];
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

  // Computed data
  filteredItems: TItem[];
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
  config: ListPageConfig<TItem>,
  operations: ListPageOperations,
): ListPageState<TItem> {
  const { toast } = useToast();

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

  // Derived: all unique tags
  const allTags = useMemo(
    () => Array.from(new Set(items.flatMap((item) => item.tags ?? []))),
    [items],
  );

  // Derived: active filter count (for mobile badge)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterTag !== "all") count++;
    for (const f of config.extraFilters ?? []) {
      if (extraFilterState[f.key] !== f.initialValue) count++;
    }
    return count;
  }, [filterTag, extraFilterState, config.extraFilters]);

  // Derived: filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Search match
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const texts = config.getSearchableText(item);
        const matchesSearch = texts.some(
          (text) => text?.toLowerCase().includes(q),
        );
        if (!matchesSearch) return false;
      }

      // Tag filter
      if (filterTag !== "all" && !(item.tags ?? []).includes(filterTag)) {
        return false;
      }

      // Extra filters
      for (const f of config.extraFilters ?? []) {
        const val = extraFilterState[f.key] ?? f.initialValue;
        if (!f.matchFn(item, val)) return false;
      }

      return true;
    });
  }, [items, searchQuery, filterTag, extraFilterState, config]);

  // Derived: sorted items
  const sortedItems = useMemo(() => {
    const opt = config.sortOptions.find((o) => o.value === sortBy);
    if (!opt) return filteredItems;
    return [...filteredItems].sort((a, b) => opt.compareFn(a, b, sortDir));
  }, [filteredItems, sortBy, sortDir, config.sortOptions]);

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
      updateViewPreference("sortBy", value as ViewPreferences[keyof ViewPreferences]);
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
        updateViewPreference("viewMode", value as ViewPreferences[keyof ViewPreferences]);
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
        toast({
          title: newPinned
            ? `${capitalize(config.entityName)} pinned`
            : `${capitalize(config.entityName)} unpinned`,
          description: `"${item.title ?? "Untitled"}" has been ${newPinned ? "pinned" : "unpinned"}.`,
        });
      } catch (error) {
        toast({
          title: "Error",
          description:
            error instanceof Error
              ? error.message
              : "Failed to update pin status",
          variant: "destructive",
        });
      }
    },
    [config.contentType, config.entityName, operations, toast],
  );

  // Flag color change
  const handleFlagColorChange = useCallback(
    async (item: TItem, color: FlagColor) => {
      try {
        const response = await setFlagColor(
          config.contentType,
          item.id,
          color,
        );
        if (!response.ok) {
          throw new Error("Failed to update flag color");
        }
        operations.refresh();
        toast({
          title: color
            ? `${capitalize(config.entityName)} flagged`
            : "Flag removed",
          description: color
            ? `"${item.title ?? "Untitled"}" has been flagged as ${color}.`
            : `Flag removed from "${item.title ?? "Untitled"}".`,
        });
      } catch (error) {
        toast({
          title: "Error",
          description:
            error instanceof Error
              ? error.message
              : "Failed to update flag color",
          variant: "destructive",
        });
      }
    },
    [config.contentType, config.entityName, operations, toast],
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
      toast({
        title: `${capitalize(config.entityName)} deleted`,
        description: `"${itemToDelete.title}" has been deleted.`,
      });
    } catch (error) {
      console.error(`Error deleting ${config.entityName}:`, error);
      toast({
        title: "Error",
        description: `Failed to delete ${config.entityName}. Please try again.`,
        variant: "destructive",
      });
    }
  }, [itemToDelete, operations, closeDeleteDialog, toast, config.entityName]);

  return {
    viewMode,
    sortBy,
    sortDir,
    searchQuery,
    filterTag,
    extraFilters: extraFilterState,
    allTags,
    activeFilterCount,
    filteredItems,
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
