/**
 * History list hook with infinite (offset-based) pagination.
 *
 * Note: unlike the content endpoints, `/api/history` is offset/limit
 * paginated (`{items, totalCount, limit, offset}`) rather than
 * cursor-paginated, so this hook can't be built on `createCrudHooks`
 * (which assumes `{items, nextCursor, hasMore}`). It mirrors the same
 * consumer API instead. History is read-only — there are no mutations.
 */

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { apiFetch } from "@/lib/api-client";

// Types for history items (matching the API response structure)
export type HistoryAction =
  | "create"
  | "update"
  | "delete"
  | "api_call"
  | "ai_prompt_image_response"
  | "ai_prompt_text_response"
  | "ai_prompt_error"
  | "api_content_upload"
  | "api_error_general";

export type HistoryItemType =
  | "task"
  | "note"
  | "bookmark"
  | "document"
  | "photo"
  | "api"
  | "prompt"
  | "api_error"
  | "content_submission";

export type HistoryActor = "human" | "agent" | "system" | "service";

export interface HistoryItem {
  id: string;
  action: HistoryAction;
  itemType: HistoryItemType;
  itemId: string;
  itemName: string;
  beforeData: any | null;
  afterData: any | null;
  actor: HistoryActor;
  timestamp: string;
}

interface HistoryPage {
  items: HistoryItem[];
  totalCount: number;
  limit?: number;
  offset?: number;
}

const PAGE_SIZE = 50;

export function useHistory() {
  const {
    data,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<HistoryPage>({
    queryKey: ["history"],
    queryFn: async ({ pageParam }) => {
      const searchParams = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(pageParam ?? 0),
      });
      const response = await apiFetch(`/api/history?${searchParams}`);
      if (!response.ok) {
        throw new Error("Failed to load history");
      }
      return response.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce(
        (count, page) => count + page.items.length,
        0,
      );
      // Stop when everything is loaded or the server returns an empty page
      if (lastPage.items.length === 0 || loadedCount >= lastPage.totalCount) {
        return undefined;
      }
      return loadedCount;
    },
    staleTime: 2 * 60 * 1000,
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
    refresh: refetch,
    fetchNextPage,
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
  };
}
