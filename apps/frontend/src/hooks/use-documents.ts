import { normalizeApiUrl } from "@/lib/api-client";
import type { Document } from "@/types/document";
import { createCrudHooks, type ListParams } from "./create-crud-hooks";

// biome-ignore lint/suspicious/noExplicitAny: backend API response shape is not statically typed
export const transformDocumentData = (raw: any): Document => ({
  id: raw.id,
  userId: raw.userId || "",
  title: raw.title,
  description: raw.description,
  originalFilename: raw.originalFilename,
  dueDate: raw.dueDate,
  mimeType: raw.mimeType,
  fileSize: raw.fileSize,
  rawMetadata: raw.rawMetadata,
  originalMimeType: raw.originalMimeType,
  tags: raw.tags || [],
  fileUrl: raw.fileUrl ? normalizeApiUrl(raw.fileUrl) : null,
  thumbnailUrl: raw.thumbnailUrl ? normalizeApiUrl(raw.thumbnailUrl) : null,
  screenshotUrl: raw.screenshotUrl ? normalizeApiUrl(raw.screenshotUrl) : null,
  pdfUrl: raw.pdfUrl ? normalizeApiUrl(raw.pdfUrl) : null,
  contentUrl: raw.contentUrl ? normalizeApiUrl(raw.contentUrl) : null,
  extractedText: raw.extractedText,
  processingStatus: raw.processingStatus || null,
  createdAt: raw.createdAt || new Date().toISOString(),
  updatedAt: raw.updatedAt || new Date().toISOString(),
  reviewStatus: raw.reviewStatus || "pending",
  flagColor: raw.flagColor || null,
  isPinned: raw.isPinned || false,
  processingEnabled: raw.processingEnabled ?? true,
});

const { useList, useSingle } = createCrudHooks<Document>({
  resourceName: "documents",
  apiPath: "/api/documents",
  transform: transformDocumentData,
});

export function useDocuments(params: ListParams = {}) {
  const {
    items: documents,
    createItem,
    updateItem,
    deleteItem,
    ...rest
  } = useList(params);

  return {
    documents,
    ...rest,
    createDocument: (formData: FormData) => createItem(formData),
    updateDocument: updateItem,
    deleteDocument: deleteItem,
  };
}

export function useDocument(id: string) {
  const { item: document, ...rest } = useSingle(id);
  return { document, ...rest };
}
