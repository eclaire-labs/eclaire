import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generates a unique API key for a user with a proper prefix
 * @returns {string} A unique API key with the format "sk_eclaire_[random characters]"
 */
export function generateApiKey(): string {
  const prefix = "sk_eclaire_";
  const randomPart = crypto.randomUUID().replace(/-/g, "");
  return `${prefix}${randomPart}`;
}

/**
 * Get the API base URL - now uses relative URLs through Next.js proxy
 * All API requests go through the frontend /api routes which proxy to the backend
 */
export function getApiBaseUrl(): string {
  return ""; // Use relative URLs - requests go through Next.js proxy
}

const mimeMap: { [key: string]: string } = {
  // Images
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
  ".bmp": "image/bmp",
  ".avif": "image/avif", // Added AVIF support
  ".ico": "image/x-icon",

  // Documents
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".html": "text/html",
  ".htm": "text/html",
  ".xml": "application/xml",
  ".json": "application/json",

  // Audio/Video (add as needed)
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",

  // Other
  ".zip": "application/zip",
  // Add more as needed
};

/**
 * Guesses the MIME type based on the file extension of a filename or path.
 * @param filenameOrPath - The filename or path string (e.g., "photo.jpg", "user/data/report.pdf").
 * @returns The guessed MIME type string, or a default if unknown.
 */
export function getMimeTypeFromExtension(
  filenameOrPath: string | null | undefined,
): string | undefined {
  if (!filenameOrPath) {
    return undefined; // Or return 'application/octet-stream' if a default is always needed
  }

  // Extract extension, including the dot (e.g., ".jpg")
  const lastDotIndex = filenameOrPath.lastIndexOf(".");
  const extension =
    lastDotIndex !== -1 ? filenameOrPath.slice(lastDotIndex).toLowerCase() : "";

  return mimeMap[extension]; // Return mapped type or undefined
}

/**
 * Guesses the MIME type based on the file extension, providing a default fallback.
 * @param filenameOrPath - The filename or path string.
 * @param defaultMimeType - The default MIME type to return if the extension is unknown.
 * @returns The guessed MIME type string or the default.
 */
export function getMimeTypeWithDefault(
  filenameOrPath: string | null | undefined,
  defaultMimeType = "application/octet-stream",
): string {
  return getMimeTypeFromExtension(filenameOrPath) || defaultMimeType;
}
