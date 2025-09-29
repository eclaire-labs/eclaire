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
  filename: string;
  filetype: string;
  filesize: number;
  tags: string[] | null;
  createdAt: string;
  updatedAt?: string;
  processingStatus?: string;
  userId?: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[] | null;
  createdAt: string;
  updatedAt?: string;
  userId?: string;
}

export interface Photo {
  id: string;
  filename: string;
  filetype: string;
  filesize: number;
  tags: string[] | null;
  description: string | null;
  createdAt: string;
  updatedAt?: string;
  processingStatus?: string;
  userId?: string;
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
