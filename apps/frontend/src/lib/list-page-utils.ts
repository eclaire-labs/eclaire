/**
 * Shared utility functions for list pages.
 * Consolidates duplicated formatDate, getGroupDateLabel, getTimestamp
 * from BookmarksPage, DocumentsPage, NotesPage, TasksPage, PhotosPage.
 */

/**
 * Format a date value for display.
 * Handles ISO strings, Unix timestamps (seconds or ms), and Date objects.
 */
export function formatDate(
  date: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (date == null) return "N/A";

  const defaults: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
    ...options,
  };

  try {
    const dateObj = toDateObject(date);
    if (Number.isNaN(dateObj.getTime())) return "Invalid Date";
    return dateObj.toLocaleDateString(undefined, defaults);
  } catch {
    return "Invalid Date";
  }
}

/**
 * Get a human-readable group label for date-based grouping.
 * Returns "Today", "Yesterday", or "Month Year" for older dates.
 */
export function getGroupDateLabel(
  date: string | number | Date | null | undefined,
): string {
  if (date == null) return "Unknown Date";

  try {
    const dateObj = toDateObject(date);
    if (Number.isNaN(dateObj.getTime())) return "Unknown Date";

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const strip = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

    if (strip(dateObj) === strip(today)) return "Today";
    if (strip(dateObj) === strip(yesterday)) return "Yesterday";

    return dateObj.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
    });
  } catch {
    return "Unknown Date";
  }
}

/**
 * Extract a numeric timestamp (ms) from a date value, for sorting.
 * Returns 0 for invalid/null dates.
 */
export function getTimestamp(
  date: string | number | Date | null | undefined,
): number {
  if (date == null) return 0;
  try {
    const ms = toDateObject(date).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  } catch {
    return 0;
  }
}

/** Internal: convert any supported date format to a Date object. */
function toDateObject(date: string | number | Date): Date {
  if (date instanceof Date) return date;
  if (typeof date === "number") {
    // Unix seconds (< 1e12) vs milliseconds
    return new Date(date < 1e12 ? date * 1000 : date);
  }
  return new Date(date);
}
