import { useEffect, useState } from "react";

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

// Hook implementation with union return type
export function useViewPreferences(
  pageType: PageType,
): [
  ViewPreferences,
  (
    key: keyof ViewPreferences,
    value: ViewPreferences[keyof ViewPreferences],
  ) => void,
  boolean,
] {
  const [preferences, setPreferences] = useState<ViewPreferences>(
    DEFAULT_PREFERENCES[pageType],
  );
  const [isLoaded, setIsLoaded] = useState(false);
  const storageKey = getStorageKey(pageType);

  // Load preferences from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          setPreferences({ ...DEFAULT_PREFERENCES[pageType], ...parsed });
        }
      } catch (error) {
        console.warn(`Failed to load view preferences for ${pageType}:`, error);
      }
    }
    setIsLoaded(true);
  }, [pageType, storageKey]);

  // Listen for localStorage changes from other tabs
  useEffect(() => {
    if (typeof window !== "undefined") {
      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === storageKey && e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue);
            setPreferences({ ...DEFAULT_PREFERENCES[pageType], ...parsed });
          } catch (error) {
            console.warn(
              `Failed to parse view preferences for ${pageType} from storage event:`,
              error,
            );
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

  // Update preference function
  const updatePreference = (
    key: keyof ViewPreferences,
    value: ViewPreferences[keyof ViewPreferences],
  ) => {
    const newPreferences = { ...preferences, [key]: value };
    setPreferences(newPreferences);

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
      } catch (error) {
        console.error(
          `Failed to save view preferences for ${pageType}:`,
          error,
        );
      }
    }
  };

  return [preferences, updatePreference, isLoaded] as const;
}
