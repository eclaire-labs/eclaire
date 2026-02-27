/**
 * Generic CRUD hook factory.
 *
 * Each entity hook (notes, bookmarks, …) calls `createCrudHooks` once at
 * module level and re-exports thin wrappers that preserve the entity-specific
 * consumer API.
 *
 * Design notes:
 * - Uses `useQuery` (NOT `useInfiniteQuery`) because list pages do
 *   client-side filtering/sorting via `useListPageState`, which requires all
 *   items loaded at once.
 * - `apiFetch` already sets `Content-Type: application/json` for non-FormData
 *   bodies and throws on 4xx/5xx with a parsed error message, so mutations
 *   don't need redundant response-ok checks or Content-Type headers.
 */

import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export interface ListHookResult<TItem> {
  items: TItem[];
  isLoading: boolean;
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
  queryKey: readonly string[];
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

  const listQueryKey = [resourceName] as const;

  /** Hook for the full item list with create / update / delete mutations. */
  function useList(): ListHookResult<TItem> {
    const queryClient = useQueryClient();

    const {
      data: items = [],
      isLoading,
      error,
      refetch,
    } = useQuery<TItem[]>({
      queryKey: listQueryKey,
      queryFn: async () => {
        const response = await apiFetch(`${apiPath}?limit=10000`);
        const data = await response.json();
        return data.items.map(transform);
      },
      staleTime: listStaleTime,
      gcTime: 5 * 60 * 1000,
    });

    const createMutation = useMutation({
      // biome-ignore lint/suspicious/noExplicitAny: create input varies per entity
      mutationFn: async (input: any) => {
        const body =
          input instanceof FormData ? input : JSON.stringify(input);
        const response = await apiFetch(apiPath, {
          method: "POST",
          body,
        });
        return response.json();
      },
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: listQueryKey }),
      onError: (error: Error) =>
        toast.error(`Create failed: ${error.message}`),
    });

    const updateMutation = useMutation({
      mutationFn: async ({
        id,
        updates,
      }: { id: string; updates: Partial<TItem> }) => {
        const response = await apiFetch(`${apiPath}/${id}`, {
          method: updateMethod,
          body: JSON.stringify(updates),
        });
        return response.json();
      },
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: listQueryKey }),
      onError: (error: Error) =>
        toast.error(`Update failed: ${error.message}`),
    });

    const deleteMutation = useMutation({
      mutationFn: async (id: string) => {
        await apiFetch(`${apiPath}/${id}`, { method: "DELETE" });
      },
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: listQueryKey }),
      onError: (error: Error) =>
        toast.error(`Delete failed: ${error.message}`),
    });

    return {
      items,
      isLoading,
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
