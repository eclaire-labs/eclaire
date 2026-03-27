import type {
  Task as ApiTask,
  TaskComment as ApiTaskComment,
  TaskOccurrence as ApiTaskOccurrence,
  InboxTask as ApiInboxTask,
  InboxResponse as ApiInboxResponse,
} from "@eclaire/api-types";

// Re-export base types — Task matches the API exactly
export type Task = ApiTask;
export type TaskComment = ApiTaskComment;
export type TaskOccurrence = ApiTaskOccurrence;
export type InboxTask = ApiInboxTask;
export type InboxResponse = ApiInboxResponse;
export type TaskStatus = Task["taskStatus"];
export type TaskDelegateMode = Task["delegateMode"];
export type TaskAttentionStatus = Task["attentionStatus"];
export type TaskReviewStatus = Task["reviewStatus"];
export type TaskScheduleType = Task["scheduleType"];

// Frontend-only user type for assignee dropdowns
export interface User {
  id: string;
  displayName: string | null;
  userType: "user" | "assistant" | "worker";
  email?: string;
  fullName?: string | null;
  avatarUrl?: string | null;
}
