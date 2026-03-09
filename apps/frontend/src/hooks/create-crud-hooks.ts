/**
 * Generic CRUD hook factory with cursor-based pagination.
 *
 * Each entity hook (notes, bookmarks, …) calls `createCrudHooks` once at
 * module level and re-exports thin wrappers that preserve the entity-specific
 * consumer API.
 *
 * Design notes:
 * - Uses `useInfiniteQuery` for server-side paginated fetching with cursor.
 * - Filtering, sorting, and search are server-side via query params.
 * - `apiFetch` already sets `Content-Type: application/json` for non-FormData
 *   bodies and throws on 4xx/5xx with a parsed error message.
 */

import {
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface CrudHookConfig<TItem> {
  /** Plural resource name used as the React Query key (e.g. "notes"). */
  resourceName: string;
  /** API base path (e.g. "/api/notes"). */
  apiPath: string;
  /** Maps a raw backend object to the frontend type. */
  // biome-ignore lint/suspicious/noExplicitAny: backend response shape is untyped
  transform: (raw: any) => TItem;
  /** HTTP method for updates. Default "PATCH". */
  updateMethod?: "PUT" | "PATCH";
  /** Override list staleTime (default 5 min). */
  listStaleTime?: number;
}

/** Server-side query parameters for list endpoints. */
export interface ListParams {
  text?: string;
  tags?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  startDate?: string;
  endDate?: string;
  dueDateStart?: string;
  dueDateEnd?: string;
  limit?: number;
  /** Entity-specific extra filters (e.g. status for tasks). */
  [key: string]: string | number | undefined;
}

// ---------------------------------------------------------------------------
// API response type (cursor-paginated)
// ---------------------------------------------------------------------------

interface CursorPage<TItem> {
  items: TItem[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount?: number;
}

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export interface ListHookResult<TItem> {
  items: TItem[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  totalCount: number | undefined;
  error: Error | null;
  // biome-ignore lint/suspicious/noExplicitAny: create input varies per entity
  createItem: (input: any) => Promise<any>;
  updateItem: (id: string, updates: Partial<TItem>) => Promise<unknown>;
  deleteItem: (id: string) => Promise<void>;
  refresh: () => void;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  /** Exposed so entity hooks can build extra mutations that invalidate the list. */
  queryKey: readonly unknown[];
  /** Exposed so entity hooks can call `invalidateQueries`. */
  queryClient: QueryClient;
}

export interface SingleHookResult<TItem> {
  item: TItem | undefined;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCrudHooks<TItem>(config: CrudHookConfig<TItem>) {
  const {
    resourceName,
    apiPath,
    transform,
    updateMethod = "PATCH",
    listStaleTime = 5 * 60 * 1000,
  } = config;

  /**
   * Hook for paginated item list with create / update / delete mutations.
   * Pass server-side params (search, sort, filters) to control what's fetched.
   */
  function useList(params: ListParams = {}): ListHookResult<TItem> {
    const queryClient = useQueryClient();

    // Query key includes all params so changing any param resets pagination
    const listQueryKey = [resourceName, params] as const;

    const {
      data,
      isLoading,
      error,
      refetch,
      fetchNextPage: fetchNext,
      hasNextPage: hasNext,
      isFetchingNextPage,
    } = useInfiniteQuery<CursorPage<TItem>>({
      queryKey: listQueryKey,
      queryFn: async ({ pageParam }) => {
        const searchParams = new URLSearchParams();
        // Add all non-undefined params
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined && value !== "") {
            searchParams.set(key, String(value));
          }
        }
        // Add cursor for subsequent pages
        if (pageParam) {
          searchParams.set("cursor", pageParam as string);
        }
        const url = `${apiPath}?${searchParams.toString()}`;
        const response = await apiFetch(url);
        const page = await response.json();
        return {
          items: page.items.map(transform),
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          totalCount: page.totalCount,
        };
      },
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: listStaleTime,
      gcTime: 5 * 60 * 1000,
    });

    // Flatten all pages into a single items array
    const items = useMemo(
      () => data?.pages.flatMap((page) => page.items) ?? [],
      [data],
    );

    // Total count from first page
    const totalCount = data?.pages[0]?.totalCount;

    // Invalidation key (covers all param variations for this resource)
    const invalidationKey = [resourceName] as const;

    const createMutation = useMutation({
      // biome-ignore lint/suspicious/noExplicitAny: create input varies per entity
      mutationFn: async (input: any) => {
        const body = input instanceof FormData ? input : JSON.stringify(input);
        const response = await apiFetch(apiPath, {
          method: "POST",
          body,
        });
        return response.json();
      },
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: invalidationKey }),
      onError: (error: Error) => toast.error(`Create failed: ${error.message}`),
    });

    const updateMutation = useMutation({
      mutationFn: async ({
        id,
        updates,
      }: {
        id: string;
        updates: Partial<TItem>;
      }) => {
        const response = await apiFetch(`${apiPath}/${id}`, {
          method: updateMethod,
          body: JSON.stringify(updates),
        });
        return response.json();
      },
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: invalidationKey }),
      onError: (error: Error) => toast.error(`Update failed: ${error.message}`),
    });

    const deleteMutation = useMutation({
      mutationFn: async (id: string) => {
        await apiFetch(`${apiPath}/${id}`, { method: "DELETE" });
      },
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: invalidationKey }),
      onError: (error: Error) => toast.error(`Delete failed: ${error.message}`),
    });

    return {
      items,
      isLoading,
      isFetchingNextPage,
      hasNextPage: hasNext ?? false,
      fetchNextPage: fetchNext,
      totalCount,
      error,
      createItem: createMutation.mutateAsync,
      updateItem: (id: string, updates: Partial<TItem>) =>
        updateMutation.mutateAsync({ id, updates }),
      deleteItem: deleteMutation.mutateAsync,
      refresh: refetch,
      isCreating: createMutation.isPending,
      isUpdating: updateMutation.isPending,
      isDeleting: deleteMutation.isPending,
      queryKey: listQueryKey,
      queryClient,
    };
  }

  /** Hook for a single item by ID. */
  function useSingle(id: string): SingleHookResult<TItem> {
    const {
      data: item,
      isLoading,
      error,
      refetch,
    } = useQuery<TItem>({
      queryKey: [resourceName, id],
      queryFn: async () => {
        const response = await apiFetch(`${apiPath}/${id}`);
        const data = await response.json();
        return transform(data);
      },
      enabled: !!id,
      staleTime: 30_000,
    });

    return { item, isLoading, error, refresh: refetch };
  }

  return { useList, useSingle };
}
