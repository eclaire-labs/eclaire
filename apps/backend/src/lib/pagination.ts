/**
 * Cursor-based pagination utilities.
 *
 * Cursor format: base64(JSON({ s: sortValue, id: entityId }))
 * The cursor encodes the last item's sort column value + ID for keyset pagination.
 */

import { and, gt, lt, type SQL, sql } from "drizzle-orm";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Cursor encode / decode
// ---------------------------------------------------------------------------

export function encodeCursor(
  sortValue: string | number | null,
  id: string,
): string {
  return Buffer.from(JSON.stringify({ s: sortValue, id })).toString("base64url");
}

export function decodeCursor(cursor: string): {
  sortValue: string | number | null;
  id: string;
} {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf-8"),
    );
    return { sortValue: parsed.s ?? null, id: parsed.id };
  } catch {
    throw new Error("Invalid cursor");
  }
}

// ---------------------------------------------------------------------------
// Shared Zod schema for cursor pagination query params
// ---------------------------------------------------------------------------

export const CursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  sortBy: z.string().default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type CursorPaginationParams = z.infer<typeof CursorPaginationSchema>;

// ---------------------------------------------------------------------------
// Response envelope
// ---------------------------------------------------------------------------

export interface CursorPaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  /** Total count of matching items. Only included on the first page (no cursor). */
  totalCount?: number;
}

// ---------------------------------------------------------------------------
// Build cursor WHERE condition + ORDER BY
// ---------------------------------------------------------------------------

/**
 * Builds the cursor condition for keyset pagination.
 *
 * For DESC order: WHERE (sortCol, id) < (cursorSortVal, cursorId)
 * For ASC order:  WHERE (sortCol, id) > (cursorSortVal, cursorId)
 *
 * Uses row-value comparison which is standard SQL supported by both
 * PostgreSQL and SQLite.
 */
export function buildCursorCondition(
  // biome-ignore lint/suspicious/noExplicitAny: column type varies
  sortColumn: any,
  // biome-ignore lint/suspicious/noExplicitAny: column type varies
  idColumn: any,
  cursor: string,
  sortDir: "asc" | "desc",
): SQL {
  const { sortValue, id } = decodeCursor(cursor);
  const cmp = sortDir === "desc" ? lt : gt;

  if (sortValue === null) {
    // When cursor sort value is null, we can only paginate by ID
    return cmp(idColumn, id);
  }

  // Row-value comparison: (col, id) < (val, cursorId) for DESC
  // This leverages composite index ordering
  return sql`(${sortColumn}, ${idColumn}) ${sortDir === "desc" ? sql`<` : sql`>`} (${sortValue}, ${id})`;
}

/**
 * Given an array of items fetched with limit+1, determine hasMore and
 * build the next cursor from the last real item.
 */
export function buildPageResult<T extends { id: string }>(
  rows: T[],
  limit: number,
  // biome-ignore lint/suspicious/noExplicitAny: sort value type varies
  getSortValue: (item: T) => any,
  totalCount?: number,
): CursorPaginatedResponse<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = items[items.length - 1];
  const nextCursor = hasMore && lastItem
    ? encodeCursor(getSortValue(lastItem), lastItem.id)
    : null;

  return {
    items,
    nextCursor,
    hasMore,
    ...(totalCount !== undefined ? { totalCount } : {}),
  };
}
