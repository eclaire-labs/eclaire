import type { Context } from "hono";

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

  if (options.extraHeaders) {
    for (const [key, value] of Object.entries(options.extraHeaders)) {
      headers.set(key, value);
    }
  }

  return new Response(options.stream, { status: 200, headers });
}
