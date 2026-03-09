import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch, normalizeApiUrl } from "@/lib/api-client";
import type { Bookmark } from "@/types/bookmark";
import { createCrudHooks, type ListParams } from "./create-crud-hooks";

// biome-ignore lint/suspicious/noExplicitAny: backend API response shape is not statically typed
export const transformBookmarkData = (raw: any): Bookmark => ({
  id: raw.id,
  title: raw.title,
  description: raw.description,
  url: raw.url,
  normalizedUrl: raw.normalizedUrl,
  author: raw.author,
  lang: raw.lang,
  dueDate: raw.dueDate,
  pageLastUpdatedAt: raw.pageLastUpdatedAt,
  contentType: raw.contentType,
  etag: raw.etag,
  lastModified: raw.lastModified,
  tags: raw.tags || [],
  faviconUrl: raw.faviconUrl ? normalizeApiUrl(raw.faviconUrl) : null,
  thumbnailUrl: raw.thumbnailUrl ? normalizeApiUrl(raw.thumbnailUrl) : null,
  screenshotUrl: raw.screenshotUrl ? normalizeApiUrl(raw.screenshotUrl) : null,
  screenshotMobileUrl: raw.screenshotMobileUrl
    ? normalizeApiUrl(raw.screenshotMobileUrl)
    : null,
  screenshotFullPageUrl: raw.screenshotFullPageUrl
    ? normalizeApiUrl(raw.screenshotFullPageUrl)
    : null,
  pdfUrl: raw.pdfUrl ? normalizeApiUrl(raw.pdfUrl) : null,
  contentUrl: raw.contentUrl ? normalizeApiUrl(raw.contentUrl) : null,
  readableUrl: raw.readableUrl ? normalizeApiUrl(raw.readableUrl) : null,
  readmeUrl: raw.readmeUrl ? normalizeApiUrl(raw.readmeUrl) : null,
  extractedText: raw.extractedText,
  processingStatus: raw.processingStatus || null,
  createdAt: raw.createdAt || new Date().toISOString(),
  updatedAt: raw.updatedAt || new Date().toISOString(),
  reviewStatus: raw.reviewStatus || "pending",
  flagColor: raw.flagColor || null,
  isPinned: raw.isPinned || false,
  processingEnabled: raw.processingEnabled ?? true,
  rawMetadata: raw.rawMetadata,
});

const { useList, useSingle } = createCrudHooks<Bookmark>({
  resourceName: "bookmarks",
  apiPath: "/api/bookmarks",
  transform: transformBookmarkData,
});

export function useBookmarks(params: ListParams = {}) {
  const {
    items: bookmarks,
    queryKey,
    queryClient,
    createItem,
    updateItem,
    deleteItem,
    ...rest
  } = useList(params);

  const importMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await apiFetch("/api/bookmarks/import", {
        method: "POST",
        body: formData,
      });
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error: Error) => toast.error(`Import failed: ${error.message}`),
  });

  return {
    bookmarks,
    ...rest,
    createBookmark: (data: { url: string }) => createItem(data),
    updateBookmark: updateItem,
    deleteBookmark: deleteItem,
    importBookmarks: (formData: FormData) =>
      importMutation.mutateAsync(formData),
    isImporting: importMutation.isPending,
  };
}

export function useBookmark(id: string) {
  const { item: bookmark, ...rest } = useSingle(id);
  return { bookmark, ...rest };
}
