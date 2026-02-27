import type { Task as ApiTask, TaskComment as ApiTaskComment } from "@eclaire/api-types";

// Re-export base types — Task matches the API exactly
export type Task = ApiTask;
export type TaskComment = ApiTaskComment;
export type TaskStatus = Task["status"];

// Frontend-only user type for assignee dropdowns
export interface User {
  id: string;
  displayName: string | null;
  userType: "user" | "assistant" | "worker";
  email?: string;
  fullName?: string | null;
  avatarUrl?: string | null;
}
