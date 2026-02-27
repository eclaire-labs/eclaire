/**
 * Shared date/time formatting utilities used across detail pages and elsewhere.
 */

/** Format an ISO date string for display (e.g. "January 1, 2025, 12:00 PM"). */
export function formatDate(
  dateString: string | number | null | undefined,
): string {
  if (!dateString) return "N/A";
  try {
    const dateObj =
      typeof dateString === "number"
        ? new Date(dateString * 1000)
        : new Date(dateString);

    if (Number.isNaN(dateObj.getTime())) return "Invalid Date";

    return dateObj.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Invalid Date";
  }
}

/** Format bytes into a human-readable size string (e.g. "2.5 MB"). */
export function formatFileSize(bytes: number | null): string {
  if (!bytes) return "Unknown size";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}

/**
 * Detect whether a processing job appears stuck.
 *
 * A job is considered stuck if it's been "pending" or "processing" for more
 * than 15 minutes without progress.
 */
export function isJobStuck(item: {
  processingStatus: string | null;
  createdAt: string;
  updatedAt: string;
}): boolean {
  if (!item.processingStatus) return false;

  const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;

  return (
    (item.processingStatus === "pending" &&
      new Date(item.createdAt).getTime() < fifteenMinutesAgo) ||
    (item.processingStatus === "processing" &&
      new Date(item.updatedAt).getTime() < fifteenMinutesAgo)
  );
}
