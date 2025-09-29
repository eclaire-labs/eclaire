import type { NextRequest } from "next/server";

/**
 * Gets the authenticated user ID from the request headers
 * This should be used in route handlers after the middleware has run
 *
 * @param req The Next.js request object
 * @returns The authenticated user ID or null if not authenticated
 */
export async function getAuthenticatedUserId(
  req: NextRequest,
): Promise<string | null> {
  // Check for Better Auth session by making a request to the backend
  try {
    const backendUrl = ""; // Use relative URLs - requests go through Next.js proxy
    const cookieHeader = req.headers.get("cookie");

    if (cookieHeader) {
      const response = await fetch(`${backendUrl}/api/auth/get-session`, {
        headers: {
          Cookie: cookieHeader,
        },
        cache: "no-store",
      });

      if (response.ok) {
        const session = await response.json();
        if (session?.user?.id) {
          return session.user.id;
        }
      }
    }
  } catch (error) {
    console.error("Error getting Better Auth session:", error);
  }

  return null;
}
