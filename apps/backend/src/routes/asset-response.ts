import type { Context } from "hono";

/** Content types that can execute scripts if rendered inline by the browser. */
const DANGEROUS_CONTENT_TYPES = new Set([
  "text/html",
  "image/svg+xml",
  "application/xhtml+xml",
  "application/xml",
]);

interface AssetResponseOptions {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength?: number;
  cacheControl: string;
  /** Set Content-Disposition. "auto" checks the ?view query param for inline vs attachment. */
  disposition?:
    | { type: "inline" | "attachment"; filename: string }
    | { type: "auto"; filename: string };
  /** Additional headers to set on the response. */
  extraHeaders?: Record<string, string>;
}

/**
 * Creates a streaming asset response with appropriate headers.
 * Shared across photos, documents, and bookmarks routes.
 */
export function createAssetResponse(
  c: Context,
  options: AssetResponseOptions,
): Response {
  const headers = new Headers();
  headers.set("Content-Type", options.contentType);
  if (options.contentLength !== undefined) {
    headers.set("Content-Length", String(options.contentLength));
  }
  headers.set("Cache-Control", options.cacheControl);

  if (options.disposition) {
    let dispositionType: string = options.disposition.type;
    if (dispositionType === "auto") {
      dispositionType =
        c.req.query("view") === "inline" ? "inline" : "attachment";
    }
    headers.set(
      "Content-Disposition",
      `${dispositionType}; filename="${options.disposition.filename}"`,
    );
  }

  // Security headers — always set
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "SAMEORIGIN");

  // Sandbox dangerous content types to prevent script execution
  const baseType = (options.contentType.split(";")[0] ?? "").trim();
  if (DANGEROUS_CONTENT_TYPES.has(baseType)) {
    headers.set(
      "Content-Security-Policy",
      "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'",
    );
  }

  if (options.extraHeaders) {
    for (const [key, value] of Object.entries(options.extraHeaders)) {
      headers.set(key, value);
    }
  }

  return new Response(options.stream, { status: 200, headers });
}
