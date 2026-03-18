export interface Bookmark {
  id: string;
  url: string;
  normalizedUrl?: string;
  title: string;
  description: string | null;
  tags: string[] | null;
  createdAt: string;
  updatedAt?: string;
  processingStatus?: string;
  userId?: string;
  // New fields for review, flagging, and pinning
  reviewStatus: "pending" | "accepted" | "rejected" | null;
  flagColor: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned: boolean;
  dueDate: string | null;
  processingEnabled?: boolean;
}

export interface BookmarkListResponse {
  items: Bookmark[];
  totalCount: number;
  limit: number;
  offset: number;
}

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  fullName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  avatarColor: string | null;
  timezone: string | null;
  city: string | null;
  country: string | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: any;
}

export interface Document {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  dueDate: string | null;

  // File metadata
  originalFilename: string | null;
  mimeType: string;
  fileSize: number | null;

  // Processing status
  processingStatus: "pending" | "processing" | "completed" | "failed" | null;

  // Review and organization
  reviewStatus: "pending" | "accepted" | "rejected";
  flagColor: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned: boolean;

  // Asset URLs
  fileUrl: string | null;
  thumbnailUrl: string | null;
  screenshotUrl: string | null;
  pdfUrl: string | null;
  contentUrl: string | null;

  // Content metadata
  extractedText: string | null;
}

export interface DocumentListResponse {
  items: Document[];
  totalCount: number;
  limit: number;
  offset: number;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  dueDate: string | null;

  // Processing status
  processingStatus: string | null;

  // Review and organization
  reviewStatus: "pending" | "accepted" | "rejected";
  flagColor: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned: boolean;

  // File metadata
  originalMimeType?: string | null;
  fileSize?: number | null;
  metadata?: Record<string, unknown> | null;
  processingEnabled?: boolean;
}

export interface NoteListResponse {
  items: Note[];
  totalCount: number;
  limit: number;
  offset: number;
}

export interface Photo {
  id: string;
  title: string;
  description: string | null;

  // Display URLs
  imageUrl: string;
  thumbnailUrl: string | null;
  originalUrl: string;
  convertedJpgUrl: string | null;

  // Basic metadata
  tags: string[];
  createdAt: string;
  updatedAt: string;
  dueDate: string | null;
  dateTaken: string | null;
  deviceId: string | null;

  // File information
  originalFilename: string;
  mimeType: string;
  fileSize: number;

  // EXIF Data
  cameraMake: string | null;
  cameraModel: string | null;
  lensModel: string | null;
  iso: number | null;
  fNumber: number | null;
  exposureTime: number | null;
  orientation: number | null;
  imageWidth: number | null;
  imageHeight: number | null;

  // Location Data
  latitude: number | null;
  longitude: number | null;
  altitude?: number | null;
  locationCity: string | null;
  locationCountryIso2: string | null;
  locationCountryName: string | null;

  // AI Generated Data
  photoType: string | null;
  extractedText: string | null;
  dominantColors: string[] | null;

  // Review and Workflow
  reviewStatus: "pending" | "accepted" | "rejected";
  flagColor: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned: boolean;

  // Processing Status
  processingStatus: string | null;
  isOriginalViewable: boolean;
  processingEnabled: boolean;
}

export interface PhotoListResponse {
  items: Photo[];
  totalCount: number;
  limit: number;
  offset: number;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  priority: string | null;
  dueDate: string | null;
  tags: string[] | null;
  createdAt: string;
  updatedAt?: string;
  userId?: string;
  // Recurrence fields
  isRecurring: boolean;
  cronExpression: string | null;
  recurrenceEndDate: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  processingEnabled?: boolean;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  messages?: Message[];
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  metadata?: any;
}
