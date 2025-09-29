export interface User {
  id: string;
  displayName: string | null;
  userType: "user" | "assistant" | "worker";
  email?: string;
  fullName?: string | null;
  avatarUrl?: string | null;
}

export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  content: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  user: {
    id: string;
    displayName: string | null;
    userType: "user" | "assistant" | "worker";
  };
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: "not-started" | "in-progress" | "completed";
  dueDate: string | null; // ISO string from API - already present but ensuring consistency
  assignedToId: string | null;
  tags: string[];
  createdAt: string; // ISO string from API
  updatedAt: string; // ISO string from API
  userId: string;

  // Processing status
  processingStatus: "pending" | "processing" | "completed" | "failed" | null;

  // New fields for review, flagging, and pinning
  reviewStatus: "pending" | "accepted" | "rejected";
  flagColor: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned: boolean;
  enabled: boolean;

  // Recurrence fields
  isRecurring: boolean;
  cronExpression: string | null;
  recurrenceEndDate: string | null; // ISO string
  recurrenceLimit: number | null;
  runImmediately: boolean;
  nextRunAt: string | null; // ISO string
  lastRunAt: string | null; // ISO string
  completedAt: string | null; // ISO string

  // Comments array (populated when fetching task details)
  comments?: TaskComment[];
}

export type TaskStatus = "not-started" | "in-progress" | "completed";
