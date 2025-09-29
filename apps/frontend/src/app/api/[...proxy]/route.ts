import { NextResponse } from "next/server";

// Proxies must be dynamic and should run in Node runtime
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * API Proxy Route Handler
 *
 * This route handler proxies all /api/* requests to the backend service.
 * This eliminates CORS issues and simplifies deployment by keeping all
 * requests on the same origin.
 *
 * Examples:
 * - /api/tasks -> http://backend:3001/api/tasks
 * - /api/auth/login -> http://backend:3001/api/auth/login
 * - /api/documents/123 -> http://backend:3001/api/documents/123
 */

// Get backend URL from environment - defaults to Docker service name in production
function getBackendUrl(): string {
  // In production Docker, use internal service name
  // In development, use localhost
  return (
    process.env.BACKEND_URL ||
    process.env.BACKEND_INTERNAL_URL ||
    "http://backend:3001"
  );
}

async function proxyToBackend(
  request: Request,
  pathSegments: string[],
): Promise<NextResponse> {
  try {
    const backendUrl = getBackendUrl();
    const targetPath = pathSegments.join("/");
    const url = new URL(request.url);

    // Construct target URL
    const targetUrl = `${backendUrl}/api/${targetPath}${url.search}`;

    // Using the plain Request avoids the NextRequest private-field Proxy issue
    console.log(`🔄 Proxying ${request.method} ${request.url} -> ${targetUrl}`);

    // Prepare headers - forward most headers but handle some specially
    const headers = new Headers(request.headers);
    ["host", "connection", "keep-alive"].forEach((h) => headers.delete(h));

    // Prepare fetch options
    const fetchOptions: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers,
      // Don't follow redirects - let the client handle them
      redirect: "manual",
    };

    // Add body for methods that support it
    if (request.method !== "GET" && request.method !== "HEAD") {
      fetchOptions.body = request.body;
      fetchOptions.duplex = "half";
    }

    // Make request to backend
    const response = await fetch(targetUrl, fetchOptions);

    // Create response headers
    const responseHeaders = new Headers();

    // Forward response headers
    for (const [key, value] of response.headers.entries()) {
      // Skip headers that Next.js handles automatically
      if (
        !["content-encoding", "transfer-encoding"].includes(key.toLowerCase())
      ) {
        responseHeaders.set(key, value);
      }
    }

    // Handle 204 No Content responses specifically
    if (response.status === 204) {
      return new NextResponse(null, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    }

    // Handle different response types
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      // For JSON responses, we need to handle Content-Length carefully
      // Remove the original Content-Length as we're re-serializing the JSON
      responseHeaders.delete("content-length");

      const data = await response.json();
      return NextResponse.json(data, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } else if (contentType.includes("text/event-stream")) {
      // Handle Server-Sent Events streaming
      console.log(
        `📡 Streaming SSE response for ${request.method} ${request.url}`,
      );

      // For SSE, we need to pass through the stream directly
      return new NextResponse(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } else if (contentType.includes("text/")) {
      const text = await response.text();
      return new NextResponse(text, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } else {
      // For binary data, streams, etc.
      const arrayBuffer = await response.arrayBuffer();
      return new NextResponse(arrayBuffer, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    }
  } catch (error) {
    console.error("❌ Proxy error:", error);

    return NextResponse.json(
      {
        error: "Proxy error",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 502 },
    );
  }
}

// HTTP method handlers
export async function GET(
  request: Request,
  { params }: { params: Promise<{ proxy: string[] }> },
) {
  const resolvedParams = await params;
  return proxyToBackend(request, resolvedParams.proxy);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ proxy: string[] }> },
) {
  const resolvedParams = await params;
  return proxyToBackend(request, resolvedParams.proxy);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ proxy: string[] }> },
) {
  const resolvedParams = await params;
  return proxyToBackend(request, resolvedParams.proxy);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ proxy: string[] }> },
) {
  const resolvedParams = await params;
  return proxyToBackend(request, resolvedParams.proxy);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ proxy: string[] }> },
) {
  const resolvedParams = await params;
  return proxyToBackend(request, resolvedParams.proxy);
}

export async function OPTIONS(
  request: Request,
  { params }: { params: Promise<{ proxy: string[] }> },
) {
  const resolvedParams = await params;
  return proxyToBackend(request, resolvedParams.proxy);
}
