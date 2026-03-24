import { createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { lookup as dnsLookup } from "node:dns/promises";
import { join, basename, extname } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { fileTypeFromFile } from "file-type";
import { createChildLogger } from "../../lib/logger.js";

const logger = createChildLogger("direct-download");

const DEFAULT_MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
const DEFAULT_TIMEOUT = 300_000; // 5 minutes

export interface DirectDownloadResult {
  filePath: string;
  mimeType: string;
  fileSize: number;
  filename: string;
}

interface DirectDownloadOptions {
  maxFileSize?: number;
  timeout?: number;
}

/**
 * Check whether an IP address falls within private/internal ranges.
 * Covers IPv4 private, loopback, link-local, and IPv6 equivalents.
 */
function isPrivateIp(ip: string): boolean {
  // IPv6 loopback
  if (ip === "::1") return true;

  // IPv6 unique-local (fc00::/7 covers fc00:: through fdff::)
  if (/^f[cd]/i.test(ip)) return true;

  // IPv4-mapped IPv6 — extract the IPv4 portion
  const v4Mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const v4 = v4Mapped?.[1] ?? ip;

  const parts = v4.split(".");
  if (parts.length !== 4) return false;

  const octets = parts.map(Number);
  if (octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return false;

  const a = octets[0] as number;
  const b = octets[1] as number;

  // 0.0.0.0/8
  if (a === 0) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 10.0.0.0/8 (private)
  if (a === 10) return true;
  // 172.16.0.0/12 (private)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 (private)
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return true;

  return false;
}

/**
 * Parse a filename from the Content-Disposition header.
 * Supports both `filename="quoted"` and `filename=unquoted` forms.
 */
function parseFilenameFromContentDisposition(
  header: string | null,
): string | undefined {
  if (!header) return undefined;

  // Try quoted form first: filename="something.mp4"
  const quoted = header.match(/filename="([^"]+)"/i);
  if (quoted?.[1]) return quoted[1];

  // Try unquoted form: filename=something.mp4
  const unquoted = header.match(/filename=([^\s;]+)/i);
  if (unquoted?.[1]) return unquoted[1];

  return undefined;
}

/**
 * Derive a filename from the response headers and URL.
 * Priority: Content-Disposition > URL path basename > "download".
 */
function deriveFilename(url: string, headers: Headers): string {
  const fromHeader = parseFilenameFromContentDisposition(
    headers.get("content-disposition"),
  );
  if (fromHeader) return fromHeader;

  try {
    const parsed = new URL(url);
    const base = basename(parsed.pathname);
    if (base && base !== "/" && base.includes(".")) return base;
  } catch {
    // ignore URL parse errors
  }

  return "download";
}

/**
 * Derive a MIME type from the response headers, magic bytes, or file extension.
 */
async function deriveMimeType(
  filePath: string,
  headers: Headers,
): Promise<string> {
  // 1. Content-Type header (ignore generic octet-stream)
  const contentType = headers.get("content-type");
  if (contentType) {
    const mime = contentType.split(";")[0]?.trim();
    if (mime && mime !== "application/octet-stream") return mime;
  }

  // 2. Magic bytes detection
  try {
    const detected = await fileTypeFromFile(filePath);
    if (detected?.mime) return detected.mime;
  } catch {
    // file-type detection failed, fall through
  }

  // 3. Extension-based fallback
  const ext = extname(filePath).toLowerCase();
  const extMap: Record<string, string> = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".flac": "audio/flac",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
  };
  const extMime = extMap[ext];
  if (extMime) return extMime;

  return "application/octet-stream";
}

/**
 * Download a file from a URL directly via HTTP with SSRF protection and
 * size limits. Falls back to this when yt-dlp is not available.
 */
export async function directDownload(
  url: string,
  outputDir: string,
  options?: DirectDownloadOptions,
): Promise<DirectDownloadResult> {
  const maxFileSize = options?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;

  logger.info({ url }, "Starting direct download");

  // --- SSRF protection: resolve hostname and check against private ranges ---
  const parsed = new URL(url);
  const hostname = parsed.hostname;

  const { address } = await dnsLookup(hostname);
  if (isPrivateIp(address)) {
    throw new Error(
      `URL resolves to a private/internal IP address (${address})`,
    );
  }

  logger.debug(
    { hostname, resolvedIp: address },
    "DNS resolution passed SSRF check",
  );

  // --- Fetch with timeout ---
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeout),
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(
      `Download failed: HTTP ${response.status} ${response.statusText}`,
    );
  }

  if (!response.body) {
    throw new Error("Download failed: response body is empty");
  }

  // --- Check Content-Length upfront ---
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (declared > maxFileSize) {
      throw new Error(
        `File too large: ${declared} bytes exceeds limit of ${maxFileSize} bytes`,
      );
    }
  }

  // --- Derive filename and prepare output path ---
  const filename = deriveFilename(url, response.headers);
  const filePath = join(outputDir, filename);

  // --- Stream response body to file with size tracking ---
  let bytesWritten = 0;
  const writeStream = createWriteStream(filePath);

  const sizeTracker = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytesWritten += chunk.length;
      if (bytesWritten > maxFileSize) {
        callback(
          new Error(
            `File too large: exceeded limit of ${maxFileSize} bytes during download`,
          ),
        );
        return;
      }
      callback(null, chunk);
    },
  });

  const nodeStream = Readable.fromWeb(response.body as NodeWebReadableStream);

  await pipeline(nodeStream, sizeTracker, writeStream);

  // --- Gather result metadata ---
  const fileStat = await stat(filePath);
  const mimeType = await deriveMimeType(filePath, response.headers);

  logger.info(
    { filePath, mimeType, fileSize: fileStat.size, filename },
    "Direct download complete",
  );

  return {
    filePath,
    mimeType,
    fileSize: fileStat.size,
    filename,
  };
}
