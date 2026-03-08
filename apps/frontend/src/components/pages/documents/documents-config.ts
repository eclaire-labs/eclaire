import type { ListPageConfig } from "@/hooks/use-list-page-state";
import type { Document } from "@/types/document";

// --- Helper Functions ---

/** Format byte size to a human-readable string. */
export function formatFileSize(
  bytes: number | null | undefined,
): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes) || bytes < 0)
    return "N/A";
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

/** Get simplified document type label from MIME type. */
export function getDocumentTypeLabel(
  mimeType: string | null | undefined,
): string {
  if (!mimeType) return "File";
  const lowerMime = mimeType.toLowerCase();
  if (lowerMime.includes("pdf")) return "PDF";
  if (lowerMime.includes("word")) return "Word";
  if (lowerMime.includes("excel") || lowerMime.includes("spreadsheet"))
    return "Excel";
  if (lowerMime.includes("powerpoint") || lowerMime.includes("presentation"))
    return "PowerPoint";
  if (lowerMime.includes("rtf")) return "RTF";
  if (lowerMime.includes("markdown")) return "Markdown";
  if (lowerMime.includes("html")) return "HTML";
  if (lowerMime.includes("csv")) return "CSV";
  if (lowerMime.includes("json")) return "JSON";
  if (lowerMime.includes("xml")) return "XML";
  if (lowerMime.includes("apple.pages")) return "Pages";
  if (lowerMime.includes("apple.numbers")) return "Numbers";
  if (lowerMime.includes("apple.keynote")) return "Keynote";
  if (lowerMime.includes("text")) return "Text";
  if (lowerMime.includes("zip")) return "Archive";
  const parts = lowerMime.split("/");
  return parts[parts.length - 1]?.toUpperCase() || "File";
}

// --- Config ---

export const documentsConfig: ListPageConfig<Document> = {
  pageType: "documents",
  contentType: "documents",
  entityName: "document",
  entityNamePlural: "Documents",

  sortOptions: [
    { value: "createdAt", label: "Date Added" },
    { value: "title", label: "Title" },
    { value: "mimeType", label: "Type" },
  ],

  groupableSortKeys: ["createdAt"],

  getGroupDate: (item, sortBy) => {
    if (sortBy === "createdAt") return item.createdAt;
    return null;
  },
};
