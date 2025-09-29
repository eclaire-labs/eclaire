// Removed frontend-specific clsx and tailwind-merge imports
// The cn() function is not needed in the backend

/**
 * Get the API base URL based on the current environment
 * - Uses localhost:3000 in development
 * - Uses api.eclaire.com in production
 */
export function getApiBaseUrl(): string {
  // In Next.js, this code runs during both SSR and client-side rendering
  // By removing any window checks and only using process.env.NODE_ENV,
  // we ensure the same URL is generated on both server and client
  return process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : "https://api.eclaire.com";
}

import path from "path";

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
  const extension = path.extname(filenameOrPath).toLowerCase();

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
