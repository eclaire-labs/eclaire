import type { Note as ApiNote } from "@eclaire/api-types";

// Extend the API Note type with fields used by the frontend
export interface Note extends ApiNote {
  userId: string;
  rawMetadata: string | null;
  userAgent: string | null;
  enabled: boolean;
}
