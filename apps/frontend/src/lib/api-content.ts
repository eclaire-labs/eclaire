/**
 * Content management helpers — pin, flag, and review-status mutations
 * that apply uniformly across all content types.
 */

import { apiFetch } from "@/lib/api-client";

/**
 * Toggle pin status for any content type
 */
export async function togglePin(
  contentType: "bookmarks" | "tasks" | "notes" | "photos" | "documents",
  id: string,
  isPinned: boolean,
): Promise<Response> {
  return apiFetch(`/api/${contentType}/${id}/pin`, {
    method: "PATCH",
    body: JSON.stringify({ isPinned }),
  });
}

/**
 * Set flag color for any content type
 */
export async function setFlagColor(
  contentType: "bookmarks" | "tasks" | "notes" | "photos" | "documents",
  id: string,
  flagColor: "red" | "yellow" | "orange" | "green" | "blue" | null,
): Promise<Response> {
  return apiFetch(`/api/${contentType}/${id}/flag`, {
    method: "PATCH",
    body: JSON.stringify({ flagColor }),
  });
}

/**
 * Update review status for any content type
 */
export async function updateReviewStatus(
  contentType: "bookmarks" | "tasks" | "notes" | "photos" | "documents",
  id: string,
  reviewStatus: "pending" | "accepted" | "rejected",
): Promise<Response> {
  return apiFetch(`/api/${contentType}/${id}/review`, {
    method: "PATCH",
    body: JSON.stringify({ reviewStatus }),
  });
}
