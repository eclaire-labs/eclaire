/**
 * Task comment CRUD operations.
 */

import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api-client";
import type { TaskComment } from "@/types/task";

/**
 * Get comments for a task
 */
export async function getTaskComments(taskId: string): Promise<TaskComment[]> {
  const response = await apiGet(`/api/tasks/${taskId}/comments`);
  if (!response.ok) {
    throw new Error("Failed to fetch task comments");
  }
  return response.json();
}

/**
 * Create a new comment on a task
 */
export async function createTaskComment(
  taskId: string,
  content: string,
): Promise<TaskComment> {
  const response = await apiPost(`/api/tasks/${taskId}/comments`, { content });
  if (!response.ok) {
    throw new Error("Failed to create comment");
  }
  return response.json();
}

/**
 * Update a task comment
 */
export async function updateTaskComment(
  taskId: string,
  commentId: string,
  content: string,
): Promise<TaskComment> {
  const response = await apiPut(`/api/tasks/${taskId}/comments/${commentId}`, {
    content,
  });
  if (!response.ok) {
    throw new Error("Failed to update comment");
  }
  return response.json();
}

/**
 * Delete a task comment
 */
export async function deleteTaskComment(
  taskId: string,
  commentId: string,
): Promise<void> {
  const response = await apiDelete(
    `/api/tasks/${taskId}/comments/${commentId}`,
  );
  if (!response.ok) {
    throw new Error("Failed to delete comment");
  }
}
