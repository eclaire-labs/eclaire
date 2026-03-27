/**
 * Frontend API client — low-level fetch infrastructure.
 *
 * Every other `api-*.ts` module imports helpers from here;
 * application code should rarely need to use `apiFetch` directly.
 *
 * All endpoints use relative URLs so requests go through the Vite
 * proxy in development or same-origin routing in production.
 */

/**
 * Helper function to handle authentication errors.
 * Skips redirect if already on an auth page (login/register).
 * Uses sessionStorage for a cooldown that survives full page reloads.
 */
const AUTH_REDIRECT_COOLDOWN_MS = 5000;
const AUTH_REDIRECT_KEY = "auth_redirect_ts";

function handleAuthError() {
  if (typeof window === "undefined") return;

  // Already on an auth page — nothing to redirect to
  if (window.location.pathname.startsWith("/auth/")) return;

  // Cooldown: prevent rapid redirect loops (sessionStorage survives page reloads)
  const now = Date.now();
  try {
    const last = sessionStorage.getItem(AUTH_REDIRECT_KEY);
    if (last && now - Number.parseInt(last, 10) < AUTH_REDIRECT_COOLDOWN_MS) {
      console.error(
        "[api-client] Auth redirect loop detected — suppressing redirect",
      );
      return;
    }
    sessionStorage.setItem(AUTH_REDIRECT_KEY, now.toString());
  } catch {
    // sessionStorage unavailable (SSR, tests, privacy mode)
  }

  // Get current path to redirect back after login
  const currentPath = window.location.pathname;
  const loginUrl = new URL("/auth/login", window.location.origin);
  loginUrl.searchParams.set("callbackUrl", encodeURI(currentPath));

  window.location.href = loginUrl.toString();
}

/**
 * Central fetch wrapper for all API calls.
 * Handles auth cookies, Content-Type, 401 redirect, and error parsing.
 *
 * Retries are intentionally NOT done here — TanStack Query handles
 * retry for queries; mutations should not auto-retry.
 */
export async function apiFetch(
  endpoint: string,
  options: RequestInit = {},
): Promise<Response> {
  // Ensure endpoint starts with /
  const normalizedEndpoint = endpoint.startsWith("/")
    ? endpoint
    : `/${endpoint}`;

  // Default headers
  const defaultHeaders: HeadersInit = {};

  // Only set Content-Type to application/json if body is not FormData
  if (options.body && !(options.body instanceof FormData)) {
    defaultHeaders["Content-Type"] = "application/json";
  }

  // Merge headers
  const headers = {
    ...defaultHeaders,
    ...options.headers,
  };

  // Make the request and include credentials for Better Auth session cookies
  const response = await fetch(normalizedEndpoint, {
    ...options,
    headers,
    credentials: "include",
  });

  // Handle different HTTP status codes
  if (response.status === 401) {
    handleAuthError();
    throw new Error("Authentication required. Redirecting to login...");
  }

  // Handle other client errors (4xx)
  if (response.status >= 400 && response.status < 500) {
    let errorMessage = `Request failed with status ${response.status}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch {
      // If JSON parsing fails, use the status text
      errorMessage = response.statusText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  // Handle server errors (5xx)
  if (response.status >= 500) {
    throw new Error(`Server error: ${response.status} ${response.statusText}`);
  }

  return response;
}

/**
 * Convenience wrapper for GET requests
 */
export async function apiGet(endpoint: string): Promise<Response> {
  return apiFetch(endpoint, { method: "GET" });
}

/**
 * Convenience wrapper for POST requests
 */
// biome-ignore lint/suspicious/noExplicitAny: API request body type varies by endpoint
export async function apiPost(endpoint: string, data?: any): Promise<Response> {
  const body = data instanceof FormData ? data : JSON.stringify(data);
  return apiFetch(endpoint, {
    method: "POST",
    body: data ? body : undefined,
  });
}

/**
 * Convenience wrapper for PUT requests
 */
// biome-ignore lint/suspicious/noExplicitAny: API request body type varies by endpoint
export async function apiPut(endpoint: string, data?: any): Promise<Response> {
  const body = data instanceof FormData ? data : JSON.stringify(data);
  return apiFetch(endpoint, {
    method: "PUT",
    body: data ? body : undefined,
  });
}

/**
 * Convenience wrapper for PATCH requests
 */
export async function apiPatch(
  endpoint: string,
  // biome-ignore lint/suspicious/noExplicitAny: API request body type varies by endpoint
  data?: any,
): Promise<Response> {
  return apiFetch(endpoint, {
    method: "PATCH",
    body: data ? JSON.stringify(data) : undefined,
  });
}

/**
 * Convenience wrapper for DELETE requests
 */
export async function apiDelete(endpoint: string): Promise<Response> {
  return apiFetch(endpoint, { method: "DELETE" });
}

/**
 * Normalize an API URL: ensures a leading `/` and passes through
 * already-absolute URLs unchanged.
 *
 * Useful for asset URLs (images, PDFs, etc.) returned by the backend
 * that need to be placed in `<img src>` or `<a href>` attributes.
 *
 * @param url - URL like "/api/photos/123/view" or "api/photos/123/view"
 * @returns Normalized URL like "/api/photos/123/view"
 */
export function normalizeApiUrl(url: string): string {
  if (!url) return url;

  // If it's already an absolute URL, return as is
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  // Ensure the URL starts with /
  return url.startsWith("/") ? url : `/${url}`;
}
