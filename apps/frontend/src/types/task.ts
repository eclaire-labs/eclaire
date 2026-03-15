import type {
  Task as ApiTask,
  TaskComment as ApiTaskComment,
} from "@eclaire/api-types";

// Re-export base types — Task matches the API exactly, plus execution status
export type Task = ApiTask & {
  lastExecutionStatus?: string | null;
  lastExecutionError?: string | null;
  lastExecutionAt?: string | null;
};
export type TaskComment = ApiTaskComment;
export type TaskStatus = Task["status"];

export interface TaskExecution {
  id: string;
  taskId: string;
  userId: string;
  scheduleKey: string | null;
  jobId: string | null;
  status: "running" | "completed" | "failed" | "skipped";
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  resultSummary: string | null;
  createdAt: string;
}

// Frontend-only user type for assignee dropdowns
export interface User {
  id: string;
  displayName: string | null;
  userType: "user" | "assistant" | "worker";
  email?: string;
  fullName?: string | null;
  avatarUrl?: string | null;
}
