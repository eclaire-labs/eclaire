import type { Context } from "hono";

/**
 * Parses common search fields from validated query params.
 * Handles tag splitting (comma-separated → array) and date string → Date conversion.
 */
export function parseSearchFields(params: {
  tags?: string;
  startDate?: string;
  endDate?: string;
  dueDateStart?: string;
  dueDateEnd?: string;
}) {
  return {
    tags: params.tags
      ? params.tags.split(",").map((t) => t.trim())
      : undefined,
    startDate: params.startDate ? new Date(params.startDate) : undefined,
    endDate: params.endDate ? new Date(params.endDate) : undefined,
    dueDateStart: params.dueDateStart
      ? new Date(params.dueDateStart)
      : undefined,
    dueDateEnd: params.dueDateEnd ? new Date(params.dueDateEnd) : undefined,
  };
}

/**
 * Parses the `deleteStorage` query parameter (defaults to true).
 */
export function parseDeleteStorage(c: Context): boolean {
  return c.req.query("deleteStorage") !== "false";
}
