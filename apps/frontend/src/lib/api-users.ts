/**
 * User-related API helpers.
 */

import { apiGet } from "@/lib/api-client";
import type { User } from "@/types/task";

/**
 * Get all users (for assignee dropdown)
 */
export async function getUsers(): Promise<User[]> {
  const response = await apiGet("/api/user");
  if (!response.ok) {
    throw new Error("Failed to fetch user data");
  }
  const data = await response.json();
  // Extract availableAssignees from the user response
  return data.availableAssignees || [];
}

/**
 * Get users by type (for filtering assistants vs humans)
 */
export async function getUsersByType(
  userType?: "user" | "assistant" | "worker",
): Promise<User[]> {
  const allUsers = await getUsers();
  if (!userType) {
    return allUsers;
  }
  return allUsers.filter((user) => user.userType === userType);
}
