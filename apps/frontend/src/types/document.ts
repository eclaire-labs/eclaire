export interface Document {
  id: string;
  title: string;
  description: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  fileSize: number | null;
  createdAt: string; // ISO timestamp string
  updatedAt: string; // ISO timestamp string
  dueDate: string | null; // Due date in ISO format
  tags: string[]; // Populated from join with documentsTags

  // URLs for accessing assets (null if asset doesn't exist)
  fileUrl: string | null; // Original file download URL
  thumbnailUrl: string | null; // Thumbnail image URL (800x600 JPG)
  screenshotUrl: string | null; // Screenshot image URL (1920x1440 JPG)
  pdfUrl: string | null; // Generated PDF URL
  contentUrl: string | null; // Extracted content URL (markdown)

  // Extracted text content stored in DB
  extractedText: string | null;

  // Processing status (unified from backend)
  processingStatus: "pending" | "processing" | "completed" | "failed" | null;

  // Document metadata
  rawMetadata: any; // Raw metadata from upload
  originalMimeType: string | null; // Original MIME type

  // User management fields
  userId: string; // User who owns the document
  reviewStatus: "pending" | "accepted" | "rejected";
  flagColor: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned: boolean;
  enabled: boolean;
}
