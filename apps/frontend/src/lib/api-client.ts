/**
 * Frontend API client — low-level fetch infrastructure.
 *
 * Every other `api-*.ts` module imports helpers from here;
 * application code should rarely need to use `apiFetch` directly.
 */

/**
 * Get the backend API URL from environment variables.
 * Falls back to empty string (relative URLs) so requests go through
 * the Vite proxy (dev) or same-origin (prod).
 */
function getBackendUrl(): string {
  return ""; // Use relative URLs - requests go through Vite proxy (dev) or same-origin (prod)
}

/**
 * Helper function to handle authentication errors
 */
function handleAuthError() {
  if (typeof window !== "undefined") {
    // Get current path to redirect back after login
    const currentPath = window.location.pathname;
    const loginUrl = new URL("/auth/login", window.location.origin);

    // Only set callback URL if not already on auth pages
    if (!currentPath.includes("/auth")) {
      loginUrl.searchParams.set("callbackUrl", encodeURI(currentPath));
    }

    window.location.href = loginUrl.toString();
  }
}

/**
 * Enhanced fetch that automatically uses the correct backend URL.
 * Use this instead of direct fetch() calls to API endpoints.
 */
export async function apiFetch(
  endpoint: string,
  options: RequestInit = {},
): Promise<Response> {
  return apiFetchWithRetry(endpoint, options, 3);
}

/**
 * Internal function that handles retries for network errors
 */
async function apiFetchWithRetry(
  endpoint: string,
  options: RequestInit = {},
  maxRetries: number = 3,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Ensure endpoint starts with /
      const normalizedEndpoint = endpoint.startsWith("/")
        ? endpoint
        : `/${endpoint}`;

      // Construct full URL with backend base URL
      const url = `${getBackendUrl()}${normalizedEndpoint}`;

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

      // Make the request with the full URL and include credentials for Better Auth
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: "include", // Essential for Better Auth session cookies
      });

      // Handle different HTTP status codes
      if (response.status === 401) {
        handleAuthError();
        throw new Error("Authentication required. Redirecting to login...");
      }

      // Handle other client errors (4xx) - don't retry these
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

      // Handle server errors (5xx) - retry these
      if (response.status >= 500) {
        throw new Error(
          `Server error: ${response.status} ${response.statusText}`,
        );
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on client errors (4xx) or auth errors
      if (
        lastError.message.includes("Authentication required") ||
        lastError.message.includes("Request failed with status 4")
      ) {
        throw lastError;
      }

      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        throw lastError;
      }

      // Wait before retrying (exponential backoff)
      const delay = Math.min(1000 * 2 ** attempt, 5000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // This should never be reached, but just in case
  throw lastError || new Error("Request failed after all retries");
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
 * Convenience wrapper for DELETE requests
 */
export async function apiDelete(endpoint: string): Promise<Response> {
  return apiFetch(endpoint, { method: "DELETE" });
}

/**
 * Convert a relative API URL to an absolute URL using the backend base URL.
 * Useful for image URLs that need to be used in <img> src attributes.
 *
 * @param relativeUrl - Relative URL like "/api/photos/123/view"
 * @returns Absolute URL like "http://localhost:3001/api/photos/123/view"
 */
export function getAbsoluteApiUrl(relativeUrl: string): string {
  if (!relativeUrl) return relativeUrl;

  // If it's already an absolute URL, return as is
  if (relativeUrl.startsWith("http://") || relativeUrl.startsWith("https://")) {
    return relativeUrl;
  }

  // Ensure the URL starts with /
  const normalizedUrl = relativeUrl.startsWith("/")
    ? relativeUrl
    : `/${relativeUrl}`;

  // Construct absolute URL
  return `${getBackendUrl()}${normalizedUrl}`;
}
