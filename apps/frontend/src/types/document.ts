import type { Document as ApiDocument } from "@eclaire/api-types";

// Extend the API Document type with fields used by the frontend
export interface Document extends ApiDocument {
  rawMetadata: any;
  originalMimeType: string | null;
  userId: string;
}
