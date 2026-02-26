import { useCallback, useEffect, useState } from "react";

// Define page types that can have view preferences
export type PageType = "bookmarks" | "tasks" | "notes" | "documents" | "photos";

// Base view preferences interface
interface BaseViewPreferences {
  viewMode: string;
  sortBy: string;
  sortDir: "asc" | "desc";
}

// Page-specific view preferences with proper typing
export interface BookmarksViewPreferences extends BaseViewPreferences {
  viewMode: "tile" | "list";
  sortBy: "createdAt" | "title" | "url";
}

export interface TasksViewPreferences extends BaseViewPreferences {
  viewMode: "tile" | "list";
  sortBy: "dueDate" | "assignedToId" | "status" | "title";
}

export interface NotesViewPreferences extends BaseViewPreferences {
  viewMode: "tile" | "list";
  sortBy: "date" | "title" | "content";
}

export interface DocumentsViewPreferences extends BaseViewPreferences {
  viewMode: "tile" | "list";
  sortBy: "createdAt" | "title" | "mimeType";
}

export interface PhotosViewPreferences extends BaseViewPreferences {
  viewMode: "tile" | "list" | "gallery";
  sortBy: "dateTaken" | "createdAt" | "title" | "location";
}

// Union type for all view preferences
export type ViewPreferences =
  | BookmarksViewPreferences
  | TasksViewPreferences
  | NotesViewPreferences
  | DocumentsViewPreferences
  | PhotosViewPreferences;

// Default preferences for each page type
const DEFAULT_PREFERENCES: Record<PageType, ViewPreferences> = {
  bookmarks: {
    viewMode: "tile",
    sortBy: "createdAt",
    sortDir: "desc",
  } as BookmarksViewPreferences,
  tasks: {
    viewMode: "tile",
    sortBy: "dueDate",
    sortDir: "asc",
  } as TasksViewPreferences,
  notes: {
    viewMode: "tile",
    sortBy: "date",
    sortDir: "desc",
  } as NotesViewPreferences,
  documents: {
    viewMode: "tile",
    sortBy: "createdAt",
    sortDir: "desc",
  } as DocumentsViewPreferences,
  photos: {
    viewMode: "tile",
    sortBy: "dateTaken",
    sortDir: "desc",
  } as PhotosViewPreferences,
};

// Generate storage key for a page type
const getStorageKey = (pageType: PageType): string =>
  `view-preferences-${pageType}`;

// Read initial preferences from localStorage synchronously to avoid double-render
function readStoredPreferences(
  storageKey: string,
  pageType: PageType,
): ViewPreferences {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        return { ...DEFAULT_PREFERENCES[pageType], ...JSON.parse(stored) };
      }
    } catch {
      // Fall through to defaults
    }
  }
  return DEFAULT_PREFERENCES[pageType];
}

// Hook implementation with union return type
export function useViewPreferences(
  pageType: PageType,
): [
  ViewPreferences,
  (
    key: keyof ViewPreferences,
    value: ViewPreferences[keyof ViewPreferences],
  ) => void,
] {
  const storageKey = getStorageKey(pageType);
  const [preferences, setPreferences] = useState<ViewPreferences>(() =>
    readStoredPreferences(storageKey, pageType),
  );

  // Listen for localStorage changes from other tabs
  useEffect(() => {
    if (typeof window !== "undefined") {
      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === storageKey && e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue);
            setPreferences({ ...DEFAULT_PREFERENCES[pageType], ...parsed });
          } catch {
            // Ignore malformed data
          }
        }
      };

      window.addEventListener("storage", handleStorageChange);
      return () => window.removeEventListener("storage", handleStorageChange);
    }
  }, [pageType, storageKey]);

  // Listen for custom events from the same window
  useEffect(() => {
    if (typeof window !== "undefined") {
      const customEventName = `view-preferences-changed-${pageType}`;

      const handlePreferencesChanged = (e: CustomEvent<ViewPreferences>) => {
        setPreferences(e.detail);
      };

      window.addEventListener(
        customEventName,
        handlePreferencesChanged as EventListener,
      );
      return () =>
        window.removeEventListener(
          customEventName,
          handlePreferencesChanged as EventListener,
        );
    }
  }, [pageType]);

  // Memoized update function using functional setState to avoid stale closure
  const updatePreference = useCallback(
    (
      key: keyof ViewPreferences,
      value: ViewPreferences[keyof ViewPreferences],
    ) => {
      setPreferences((prev) => {
        const newPreferences = { ...prev, [key]: value };

        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(storageKey, JSON.stringify(newPreferences));

            // Dispatch a custom event to notify other components in the same window
            const customEventName = `view-preferences-changed-${pageType}`;
            window.dispatchEvent(
              new CustomEvent(customEventName, {
                detail: newPreferences,
              }),
            );
          } catch {
            // Ignore storage errors
          }
        }

        return newPreferences;
      });
    },
    [storageKey, pageType],
  );

  return [preferences, updatePreference] as const;
}
