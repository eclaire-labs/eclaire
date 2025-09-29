import { cookies } from "next/headers";

// Server-side API fetch function for data fetching
async function serverApiFetch(endpoint: string): Promise<Response> {
  const backendUrl =
    process.env.BACKEND_URL ||
    process.env.BACKEND_INTERNAL_URL ||
    "http://backend:3001";

  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  // Log all cookies
  const allCookies = cookieStore.getAll();

  try {
    const response = await fetch(`${backendUrl}${endpoint}`, {
      headers: {
        Cookie: cookieHeader,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    return response;
  } catch (error) {
    throw error;
  }
}

/**
 * Fetches dashboard statistics including asset counts and storage sizes.
 * @param userId - The ID of the user.
 * @returns {Promise<object | null>} Dashboard stats object or null.
 */
export async function getDashboardStats(userId: string | undefined) {
  if (!userId) return null;

  try {
    const response = await serverApiFetch("/api/user/dashboard-stats");
    if (!response.ok) {
      console.error("Failed to fetch dashboard stats:", response.statusText);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return null;
  }
}

// Define a type for recent activity items (adjust based on your actual schema)
type RecentActivityItem = {
  id: string;
  action: string;
  itemType: string;
  itemId: string;
  itemName: string;
  timestamp: number | string | Date;
  beforeData?: any;
  afterData?: any;
  actor: string;
  userId: string;
};

/**
 * Fetches recent activity for a given user using the real history API.
 * @param userId - The ID of the user.
 * @param limit - The maximum number of activities to fetch.
 * @returns {Promise<RecentActivityItem[]>} Array of recent activities.
 */
export async function getRecentActivity(
  userId: string | undefined,
  limit = 5,
): Promise<RecentActivityItem[]> {
  if (!userId) return [];

  try {
    const response = await serverApiFetch(`/api/history?limit=${limit}`);
    if (!response.ok) {
      console.error("Failed to fetch recent activity:", response.statusText);
      return [];
    }

    const data = await response.json();
    // The API returns { records: [...], totalCount, limit, offset, hasMore }
    return Array.isArray(data.records) ? data.records : [];
  } catch (error) {
    console.error("Error fetching recent activity:", error);
    return [];
  }
}

/**
 * Fetches activity timeline data for the dashboard chart
 * @param userId - The ID of the user
 * @param days - Number of days to fetch (default: 30)
 * @returns Array of daily activity data
 */
export async function getActivityTimeline(
  userId: string | undefined,
  days: number = 30,
) {
  if (!userId) return [];

  try {
    const params = new URLSearchParams({ days: days.toString() });
    const response = await serverApiFetch(
      `/api/user/activity-timeline?${params}`,
    );
    if (!response.ok) {
      console.error("Failed to fetch activity timeline:", response.statusText);
      return [];
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Error fetching activity timeline:", error);
    return [];
  }
}

/**
 * Fetches items that are due soon or overdue
 * @param userId - The ID of the user
 * @returns Object with categorized due items
 */
export async function getDueItems(userId: string | undefined) {
  if (!userId) return { overdue: [], dueToday: [], dueThisWeek: [] };

  try {
    const response = await serverApiFetch("/api/user/due-items");

    if (!response.ok) {
      // Try to get error details from response
      try {
        const errorText = await response.text();
      } catch (e) {
        console.error("Could not read error response body");
      }
      return { overdue: [], dueToday: [], dueThisWeek: [] };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    return { overdue: [], dueToday: [], dueThisWeek: [] };
  }
}

/**
 * Fetches quick stats for dashboard widgets
 * @param userId - The ID of the user
 * @returns Object with various quick statistics
 */
export async function getQuickStats(userId: string | undefined) {
  if (!userId) return null;

  try {
    const response = await serverApiFetch("/api/user/quick-stats");
    if (!response.ok) {
      console.error("Failed to fetch quick stats:", response.statusText);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching quick stats:", error);
    return null;
  }
}

// NOTE: API key management is now handled by the useApiKey hook
// and the backend API endpoints at /api/user/api-key
// These functions are kept for backward compatibility but are deprecated
