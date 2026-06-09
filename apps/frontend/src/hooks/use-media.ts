import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiFetch, normalizeApiUrl } from "@/lib/api-client";
import type { Media } from "@/types/media";

import { createCrudHooks, type ListParams } from "./create-crud-hooks";

export const transformMediaData = (raw: any): Media => ({
  id: raw.id,
  title: raw.title,
  description: raw.description,
  originalFilename: raw.originalFilename,
  mimeType: raw.mimeType,
  fileSize: raw.fileSize,
  tags: raw.tags || [],
  mediaType: raw.mediaType,
  mediaUrl: raw.mediaUrl ? normalizeApiUrl(raw.mediaUrl) : "",
  sourceUrl: raw.sourceUrl || null,
  thumbnailUrl: raw.thumbnailUrl ? normalizeApiUrl(raw.thumbnailUrl) : null,
  duration: raw.duration,
  channels: raw.channels,
  sampleRate: raw.sampleRate,
  bitrate: raw.bitrate,
  codec: raw.codec,
  language: raw.language,
  width: raw.width ?? null,
  height: raw.height ?? null,
  frameRate: raw.frameRate ?? null,
  videoCodec: raw.videoCodec ?? null,
  extractedText: raw.extractedText || null,
  contentUrl: raw.contentUrl || null,
  processingStatus: raw.processingStatus || null,
  createdAt: raw.createdAt || new Date().toISOString(),
  updatedAt: raw.updatedAt || new Date().toISOString(),
  dueDate: raw.dueDate || null,
  reviewStatus: raw.reviewStatus || "pending",
  flagColor: raw.flagColor || null,
  isPinned: raw.isPinned || false,
  processingEnabled: raw.processingEnabled ?? true,
});

const { useList, useSingle } = createCrudHooks<Media>({
  resourceName: "media",
  apiPath: "/api/media",
  transform: transformMediaData,
});

export function useMedia(params: ListParams = {}) {
  const {
    items: media,
    queryKey,
    queryClient,
    createItem,
    updateItem,
    deleteItem,
    ...rest
  } = useList(params);

  const importMutation = useMutation({
    mutationFn: async (data: {
      url: string;
      title?: string;
      description?: string;
      tags: string[];
    }) => {
      const response = await apiFetch("/api/media/import", {
        method: "POST",
        body: JSON.stringify(data),
      });
      return (await response.json()) as Media;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error: Error) =>
      toast.error("Import Error", { description: error.message }),
  });

  return {
    media,
    ...rest,
    createMedia: (formData: FormData) => createItem(formData),
    updateMedia: updateItem,
    deleteMedia: deleteItem,
    importMedia: importMutation.mutateAsync,
    isImporting: importMutation.isPending,
  };
}

export function useMediaItem(id: string) {
  const { item: media, ...rest } = useSingle(id);
  return { media, ...rest };
}
