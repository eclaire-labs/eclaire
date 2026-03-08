/**
 * Detect MIME type from file extension in a storage ID / key.
 */
export function getMimeTypeFromStorageId(storageId: string): string {
  const lower = storageId.toLowerCase();

  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".ico")) return "image/x-icon";

  // Default fallback for extensionless files (backward compatibility)
  return "image/x-icon";
}
