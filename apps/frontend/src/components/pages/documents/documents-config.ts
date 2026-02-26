import type { ListPageConfig } from "@/hooks/use-list-page-state";
import { getTimestamp } from "@/lib/list-page-utils";
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

  getSearchableText: (item) => [
    item.title,
    item.description ?? "",
    item.originalFilename ?? "",
    item.extractedText ?? "",
    getDocumentTypeLabel(item.mimeType),
    ...item.tags,
  ],

  sortOptions: [
    {
      value: "date",
      label: "Date Added",
      compareFn: (a, b, dir) => {
        const diff = getTimestamp(a.createdAt) - getTimestamp(b.createdAt);
        const result =
          diff || a.title.toLowerCase().localeCompare(b.title.toLowerCase());
        return dir === "asc" ? result : -result;
      },
    },
    {
      value: "title",
      label: "Title",
      compareFn: (a, b, dir) => {
        const cmp = a.title.toLowerCase().localeCompare(b.title.toLowerCase());
        return dir === "asc" ? cmp : -cmp;
      },
    },
    {
      value: "mimeType",
      label: "Type",
      compareFn: (a, b, dir) => {
        const typeA = getDocumentTypeLabel(a.mimeType).toLowerCase();
        const typeB = getDocumentTypeLabel(b.mimeType).toLowerCase();
        const cmp = typeA.localeCompare(typeB);
        const result =
          cmp || a.title.toLowerCase().localeCompare(b.title.toLowerCase());
        return dir === "asc" ? result : -result;
      },
    },
  ],

  groupableSortKeys: ["date"],

  getGroupDate: (item, sortBy) => {
    if (sortBy === "date") return item.createdAt;
    return null;
  },
};
