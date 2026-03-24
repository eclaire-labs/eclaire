import { normalizeApiUrl } from "@/lib/api-client";
import type { Media } from "@/types/media";
import { createCrudHooks, type ListParams } from "./create-crud-hooks";

// biome-ignore lint/suspicious/noExplicitAny: backend API response shape is not statically typed
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
  thumbnailUrl: raw.thumbnailUrl ? normalizeApiUrl(raw.thumbnailUrl) : null,
  duration: raw.duration,
  channels: raw.channels,
  sampleRate: raw.sampleRate,
  bitrate: raw.bitrate,
  codec: raw.codec,
  language: raw.language,
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
    createItem,
    updateItem,
    deleteItem,
    ...rest
  } = useList(params);

  return {
    media,
    ...rest,
    createMedia: (formData: FormData) => createItem(formData),
    updateMedia: updateItem,
    deleteMedia: deleteItem,
  };
}

export function useMediaItem(id: string) {
  const { item: media, ...rest } = useSingle(id);
  return { media, ...rest };
}
