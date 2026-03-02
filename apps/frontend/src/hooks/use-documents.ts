import { getAbsoluteApiUrl } from "@/lib/api-client";
import type { Document } from "@/types/document";
import { createCrudHooks } from "./create-crud-hooks";

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
  fileUrl: raw.fileUrl ? getAbsoluteApiUrl(raw.fileUrl) : null,
  thumbnailUrl: raw.thumbnailUrl ? getAbsoluteApiUrl(raw.thumbnailUrl) : null,
  screenshotUrl: raw.screenshotUrl
    ? getAbsoluteApiUrl(raw.screenshotUrl)
    : null,
  pdfUrl: raw.pdfUrl ? getAbsoluteApiUrl(raw.pdfUrl) : null,
  contentUrl: raw.contentUrl ? getAbsoluteApiUrl(raw.contentUrl) : null,
  extractedText: raw.extractedText,
  processingStatus: raw.processingStatus || null,
  createdAt: raw.createdAt || new Date().toISOString(),
  updatedAt: raw.updatedAt || new Date().toISOString(),
  reviewStatus: raw.reviewStatus || "pending",
  flagColor: raw.flagColor || null,
  isPinned: raw.isPinned || false,
  enabled: raw.enabled ?? true,
});

const { useList, useSingle } = createCrudHooks<Document>({
  resourceName: "documents",
  apiPath: "/api/documents",
  transform: transformDocumentData,
});

export function useDocuments() {
  const { items: documents, createItem, updateItem, deleteItem, ...rest } =
    useList();

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
