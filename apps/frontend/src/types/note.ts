export interface Note {
  id: string;
  userId: string;
  title: string;
  content: string | null;
  description: string | null; // Auto-generated from content by backend
  rawMetadata: string | null;
  originalMimeType: string | null;
  userAgent: string | null;
  createdAt: string; // ISO 8601 timestamp from backend
  updatedAt: string; // ISO 8601 timestamp from backend
  dueDate: string | null; // ISO 8601 timestamp for due date
  tags: string[]; // Populated from join with notesTags

  // Processing status
  processingStatus: "pending" | "processing" | "completed" | "failed" | null;

  // New fields for review, flagging, and pinning
  reviewStatus: "pending" | "accepted" | "rejected";
  flagColor: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned: boolean;
  enabled: boolean; // Whether processing is enabled for this note
}

// Use Note directly instead of extending with date field
export interface NoteEntry extends Note {}
