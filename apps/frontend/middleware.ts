import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { logger } from "./src/lib/logger";

// This middleware is used to handle authentication and API 404s
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle 404s for API routes with JSON responses
  if (pathname.startsWith("/api/") && !isKnownApiRoute(pathname)) {
    return NextResponse.json(
      {
        error: "Not Found",
        message: `The requested API endpoint '${pathname}' does not exist.`,
      },
      { status: 404 },
    );
  }

  // Skip other middleware checks for static assets, API routes, and auth pages
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") || // We still process API routes above for 404 handling
    pathname.includes("/auth")
  ) {
    return NextResponse.next();
  }

  // Check Better Auth session
  const isAuthenticated = await checkBetterAuthSession(request);

  // If the path is under the main app routes and user is not authenticated
  if (pathname.startsWith("/(main") || pathname.startsWith("/dashboard")) {
    if (!isAuthenticated) {
      const url = new URL("/auth/login", request.url);
      url.searchParams.set("callbackUrl", encodeURI(pathname));
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

// Helper function to check Better Auth session
async function checkBetterAuthSession(request: NextRequest): Promise<boolean> {
  try {
    // Use internal backend URL for server-side requests (bypassing proxy)
    const backendUrl =
      process.env.BACKEND_URL ||
      process.env.BACKEND_INTERNAL_URL ||
      "http://backend:3001";

    logger.debug(
      { backendUrl, envBackendUrl: process.env.BACKEND_URL },
      "Using backend URL for session check",
    );
    const cookieHeader = request.headers.get("cookie");

    if (!cookieHeader) {
      return false;
    }

    // Make request to our backend's Better Auth get-session endpoint
    const response = await fetch(`${backendUrl}/api/auth/get-session`, {
      headers: {
        Cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return false;
    }

    const session = await response.json();

    // Better Auth session structure - check if user exists
    return !!session?.user?.id;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Error checking Better Auth session",
    );

    // In development mode, allow requests through
    if (process.env.NODE_ENV === "development") {
      logger.warn(
        "Development mode: Allowing access due to session check error",
      );
      return true;
    }

    return false;
  }
}

// Helper function to check if the API route is known/registered
function isKnownApiRoute(path: string): boolean {
  // With the new proxy setup, all /api routes are handled by the [...proxy] route
  // so we should only exclude truly non-existent routes

  // Known local API routes (not proxied)
  const localRoutes = [
    "/api/health", // Local health check
  ];

  // Check if it's a local route
  if (
    localRoutes.some((route) => path === route || path.startsWith(`${route}/`))
  ) {
    return true;
  }

  // All other /api routes are proxied to backend, so they're "known"
  // The backend will handle 404s for non-existent routes
  return path.startsWith("/api/");
}

// Configure matcher to run middleware on all routes, including API routes
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
