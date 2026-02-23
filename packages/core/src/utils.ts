import path from "node:path";

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
  ".avif": "image/avif",
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

  // Audio/Video
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",

  // Other
  ".zip": "application/zip",
};

/**
 * Guesses the MIME type based on the file extension of a filename or path.
 * @param filenameOrPath - The filename or path string (e.g., "photo.jpg", "user/data/report.pdf").
 * @returns The guessed MIME type string, or undefined if unknown.
 */
export function getMimeTypeFromExtension(
  filenameOrPath: string | null | undefined,
): string | undefined {
  if (!filenameOrPath) {
    return undefined;
  }

  // Extract extension, including the dot (e.g., ".jpg")
  const extension = path.extname(filenameOrPath).toLowerCase();

  return mimeMap[extension];
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

/**
 * Checks if a string is a valid URL
 */
export function isValidUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format a timestamp to ISO 8601 string.
 *
 * Safely handles Date objects, numbers (milliseconds), strings, and invalid inputs.
 *
 * @param timestamp - Date object, number (milliseconds since epoch), string, or null/undefined
 * @returns ISO 8601 string, or null for invalid/missing timestamps
 */
export function formatToISO8601(
  timestamp: Date | number | string | null | undefined,
): string | null {
  // Return null for missing values
  if (timestamp === null || timestamp === undefined) {
    return null;
  }

  // If it's already a Date object, validate and return its ISO string
  if (timestamp instanceof Date) {
    // Check for Invalid Date
    const time = timestamp.getTime();
    if (Number.isNaN(time)) {
      console.error("formatToISO8601: Invalid Date object received", {
        timestamp,
      });
      return null;
    }
    return timestamp.toISOString();
  }

  // Handle numeric timestamps (milliseconds since epoch)
  if (typeof timestamp === "number") {
    if (Number.isNaN(timestamp) || !Number.isFinite(timestamp)) {
      console.error("formatToISO8601: Invalid numeric timestamp", {
        timestamp,
      });
      return null;
    }
    const date = new Date(timestamp);
    const time = date.getTime();
    if (Number.isNaN(time)) {
      console.error("formatToISO8601: Number creates invalid Date", {
        timestamp,
      });
      return null;
    }
    return date.toISOString();
  }

  // Handle string timestamps (ISO 8601 strings or numeric strings)
  if (typeof timestamp === "string") {
    const date = new Date(timestamp);
    const time = date.getTime();
    if (Number.isNaN(time)) {
      console.error("formatToISO8601: String creates invalid Date", {
        timestamp,
      });
      return null;
    }
    return date.toISOString();
  }

  // Unknown type, return null
  console.error("formatToISO8601: Unknown timestamp type", {
    timestamp,
    type: typeof timestamp,
  });
  return null;
}

/**
 * Format a required timestamp to ISO 8601 string.
 * Throws an error if the timestamp is null/undefined/invalid.
 *
 * @param timestamp - Date object, number, or string (required)
 * @returns ISO 8601 string (never null)
 * @throws Error if timestamp is null, undefined, or invalid
 */
export function formatRequiredTimestamp(
  timestamp: Date | number | string,
): string {
  const result = formatToISO8601(timestamp);
  if (result === null) {
    throw new Error(`Invalid required timestamp: ${timestamp}`);
  }
  return result;
}

/**
 * Get current timestamp as a Date object
 * @returns Date object representing the current time
 */
export function getCurrentTimestamp(): Date {
  return new Date();
}
