/**
 * Hook for the unified `/api/all` endpoint (cursor-paginated search across
 * tasks, bookmarks, documents, photos, and notes).
 *
 * Used by the All / Flagged / Pinned / Pending / Due Now pages, each of which
 * passes a different set of fixed filters.
 */

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { apiFetch } from "@/lib/api-client";

export type AllItemType = "task" | "bookmark" | "document" | "photo" | "note";

export type FlagColor = "red" | "yellow" | "orange" | "green" | "blue";

export interface AllItem {
  id: string;
  title: string;
  description: string;
  type: AllItemType;
  createdAt: string;
  dueDate?: string | null;
  tags: string[];
  reviewStatus?: "pending" | "accepted" | "rejected";
  flagColor?: FlagColor | null;
  isPinned?: boolean;
}

interface AllItemsPage {
  items: AllItem[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount?: number;
}

/** Filters supported by `/api/all` that the All* pages use. */
export interface AllItemsFilters {
  /** Full-text search. */
  text?: string;
  /** Comma-separated tag filter. */
  tags?: string;
  /** Comma-separated item type filter. */
  types?: string;
  /** Only flagged items. */
  flagged?: boolean;
  /** Only pinned items. */
  isPinned?: boolean;
  /** Filter by review status (e.g. "pending"). */
  reviewStatus?: string;
  /** Filter by due status (e.g. "due_now"). */
  dueStatus?: string;
}

export function useAllItems(filters: AllItemsFilters = {}) {
  const { text, tags, types, flagged, isPinned, reviewStatus, dueStatus } =
    filters;

  // Normalize filters into string query params (skip undefined/empty)
  const serverParams = useMemo(() => {
    const params: Record<string, string> = {};
    const entries: [string, string | boolean | undefined][] = [
      ["text", text],
      ["tags", tags],
      ["types", types],
      ["flagged", flagged],
      ["isPinned", isPinned],
      ["reviewStatus", reviewStatus],
      ["dueStatus", dueStatus],
    ];
    for (const [key, value] of entries) {
      if (value !== undefined && value !== "") {
        params[key] = String(value);
      }
    }
    return params;
  }, [text, tags, types, flagged, isPinned, reviewStatus, dueStatus]);

  const {
    data,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<AllItemsPage>({
    queryKey: ["all-items", serverParams],
    queryFn: async ({ pageParam }) => {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(serverParams)) {
        if (value) searchParams.set(key, value);
      }
      if (pageParam) searchParams.set("cursor", pageParam as string);
      const response = await apiFetch(`/api/all?${searchParams.toString()}`);
      return response.json();
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 5 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  const totalCount = data?.pages[0]?.totalCount;

  return {
    items,
    totalCount,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
  };
}
