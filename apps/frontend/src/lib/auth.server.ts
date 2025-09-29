// lib/auth.server.ts

import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import type { RequestCookies } from "next/dist/server/web/spec-extension/cookies";
import { cookies } from "next/headers";

// The User type can live here as it's used on the server.
export interface User {
  id: string;
  email: string;
  name?: string;
}

/**
 * Universal server-side function to get the current user.
 * This is safe to use in Middleware, Route Handlers, and Server Components.
 *
 * @param {RequestCookies | ReadonlyRequestCookies} [cookieStore] - Optional cookie store. If not provided, it will use `next/headers`.
 * @returns {Promise<User | null>} The user object or null if not authenticated.
 */
export async function getCurrentUser(
  cookieStore?: RequestCookies | ReadonlyRequestCookies,
): Promise<User | null> {
  try {
    const cookieStoreToUse = cookieStore || (await cookies());
    const cookieHeader = cookieStoreToUse.toString();

    if (!cookieHeader) {
      return null;
    }

    const backendUrl =
      process.env.BACKEND_URL ||
      process.env.BACKEND_INTERNAL_URL ||
      "http://backend:3001";

    const response = await fetch(`${backendUrl}/api/session`, {
      headers: {
        Cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const session = await response.json();
    return session?.user ? (session.user as User) : null;
  } catch (error) {
    console.error("Error getting current user:", error);
    return null;
  }
}
