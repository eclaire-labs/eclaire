import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { apiFetch, getAbsoluteApiUrl } from "@/lib/frontend-api";
import type { Bookmark } from "@/types/bookmark";

// Transform backend bookmark data to frontend format
const transformBookmarkData = (backendBookmark: any): Bookmark => {
  return {
    id: backendBookmark.id,
    title: backendBookmark.title,
    description: backendBookmark.description,
    url: backendBookmark.url,
    normalizedUrl: backendBookmark.normalizedUrl,
    author: backendBookmark.author,
    lang: backendBookmark.lang,
    dueDate: backendBookmark.dueDate,
    pageLastUpdatedAt: backendBookmark.pageLastUpdatedAt,
    contentType: backendBookmark.contentType,
    etag: backendBookmark.etag,
    lastModified: backendBookmark.lastModified,
    tags: backendBookmark.tags || [],
    // Computed URLs for assets
    faviconUrl: backendBookmark.faviconUrl
      ? getAbsoluteApiUrl(backendBookmark.faviconUrl)
      : null,
    thumbnailUrl: backendBookmark.thumbnailUrl
      ? getAbsoluteApiUrl(backendBookmark.thumbnailUrl)
      : null,
    screenshotUrl: backendBookmark.screenshotUrl
      ? getAbsoluteApiUrl(backendBookmark.screenshotUrl)
      : null,
    screenshotMobileUrl: backendBookmark.screenshotMobileUrl
      ? getAbsoluteApiUrl(backendBookmark.screenshotMobileUrl)
      : null,
    screenshotFullPageUrl: backendBookmark.screenshotFullPageUrl
      ? getAbsoluteApiUrl(backendBookmark.screenshotFullPageUrl)
      : null,
    pdfUrl: backendBookmark.pdfUrl
      ? getAbsoluteApiUrl(backendBookmark.pdfUrl)
      : null,
    contentUrl: backendBookmark.contentUrl
      ? getAbsoluteApiUrl(backendBookmark.contentUrl)
      : null,
    readableUrl: backendBookmark.readableUrl
      ? getAbsoluteApiUrl(backendBookmark.readableUrl)
      : null,
    readmeUrl: backendBookmark.readmeUrl
      ? getAbsoluteApiUrl(backendBookmark.readmeUrl)
      : null,
    extractedText: backendBookmark.extractedText,
    // Processing status (unified from backend)
    processingStatus: backendBookmark.processingStatus || null,
    // Timestamps (backend returns ISO strings)
    createdAt: backendBookmark.createdAt || new Date().toISOString(),
    updatedAt: backendBookmark.updatedAt || new Date().toISOString(),
    // Review, flagging, and pinning
    reviewStatus: backendBookmark.reviewStatus || "pending",
    flagColor: backendBookmark.flagColor || null,
    isPinned: backendBookmark.isPinned || false,
    enabled: backendBookmark.enabled ?? true,
    // Raw metadata
    rawMetadata: backendBookmark.rawMetadata,
  };
};

/**
 * React Query hook for bookmarks data fetching and management
 */
export function useBookmarks() {
  const queryClient = useQueryClient();

  const queryKey = ["bookmarks"];

  // Main bookmarks query
  const {
    data: bookmarks = [],
    isLoading,
    error,
    refetch,
  } = useQuery<Bookmark[]>({
    queryKey,
    queryFn: async () => {
      const response = await apiFetch("/api/bookmarks?limit=9999");

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to load bookmarks");
      }

      const data = await response.json();

      // Handle different response structures - ensure we always get an array
      const bookmarksArray = Array.isArray(data)
        ? data
        : data.bookmarks || data.entries || [];

      // Transform backend data to frontend format
      return bookmarksArray.map(transformBookmarkData);
    },
    staleTime: 30000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  // Create bookmark mutation
  const createBookmarkMutation = useMutation({
    mutationFn: async (bookmarkData: { url: string }) => {
      const response = await apiFetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookmarkData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create bookmark");
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch bookmarks
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast.error(`Failed to create bookmark: ${error.message}`);
    },
  });

  // Update bookmark mutation
  const updateBookmarkMutation = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Bookmark>;
    }) => {
      const response = await apiFetch(`/api/bookmarks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update bookmark");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast.error(`Update failed: ${error.message}`);
    },
  });

  // Delete bookmark mutation
  const deleteBookmarkMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiFetch(`/api/bookmarks/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to delete bookmark");
      }

      return;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast.error(`Delete failed: ${error.message}`);
    },
  });

  // Import bookmarks mutation
  const importBookmarksMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await apiFetch("/api/bookmarks/import", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to import bookmarks");
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch bookmarks
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast.error(`Import failed: ${error.message}`);
    },
  });

  // Helper functions
  const createBookmark = useCallback(
    (bookmarkData: { url: string }) => {
      return createBookmarkMutation.mutateAsync(bookmarkData);
    },
    [createBookmarkMutation],
  );

  const updateBookmark = useCallback(
    (id: string, updates: Partial<Bookmark>) => {
      return updateBookmarkMutation.mutateAsync({ id, updates });
    },
    [updateBookmarkMutation],
  );

  const deleteBookmark = useCallback(
    (id: string) => {
      return deleteBookmarkMutation.mutateAsync(id);
    },
    [deleteBookmarkMutation],
  );

  const importBookmarks = useCallback(
    (formData: FormData) => {
      return importBookmarksMutation.mutateAsync(formData);
    },
    [importBookmarksMutation],
  );

  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  return {
    // Data
    bookmarks,

    // States
    isLoading,
    error,

    // Actions
    createBookmark,
    updateBookmark,
    deleteBookmark,
    importBookmarks,
    refresh,

    // Mutation states
    isCreating: createBookmarkMutation.isPending,
    isUpdating: updateBookmarkMutation.isPending,
    isDeleting: deleteBookmarkMutation.isPending,
    isImporting: importBookmarksMutation.isPending,
  };
}

/**
 * Hook for a single bookmark by ID
 */
export function useBookmark(id: string) {
  const queryKey = ["bookmarks", id];

  const {
    data: bookmark,
    isLoading,
    error,
    refetch,
  } = useQuery<Bookmark>({
    queryKey,
    queryFn: async () => {
      const response = await apiFetch(`/api/bookmarks/${id}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to load bookmark");
      }

      const data = await response.json();
      return transformBookmarkData(data);
    },
    enabled: !!id,
    staleTime: 30000, // 30 seconds
  });

  return {
    bookmark,
    isLoading,
    error,
    refresh: refetch,
  };
}
