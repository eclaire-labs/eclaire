import type { Document as ApiDocument } from "@eclaire/api-types";

// Extend the API Document type with fields used by the frontend
export interface Document extends ApiDocument {
  // biome-ignore lint/suspicious/noExplicitAny: raw metadata structure varies by document type and upload source
  rawMetadata: any;
  originalMimeType: string | null;
  userId: string;
}
