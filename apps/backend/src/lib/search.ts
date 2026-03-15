/**
 * Full-text search utilities.
 *
 * On PostgreSQL/PGLite: uses tsvector + tsquery with GIN indexes for
 * ranked lexical search with stemming and stop-word removal.
 *
 * On SQLite: falls back to case-insensitive LIKE on individual columns.
 */

import { type SQL, sql } from "drizzle-orm";
import { dbCapabilities } from "../db/index.js";
import { flexLike } from "./db-helpers.js";

/**
 * Whether the current database supports built-in FTS (tsvector/tsquery).
 */
export const hasFts = dbCapabilities.fts === "builtin";

/**
 * Build a WHERE condition for full-text search.
 *
 * When FTS is available, returns a `search_vector @@ plainto_tsquery(...)` condition.
 * When not, falls back to OR-ing flexLike across the provided columns.
 *
 * @param searchText - The user's search query
 * @param searchVectorColumn - The tsvector column (used when FTS is available)
 * @param fallbackColumns - Columns to LIKE-search (used when FTS is not available)
 */
export function buildTextSearchCondition(
  searchText: string,
  // biome-ignore lint/suspicious/noExplicitAny: column type varies per entity
  searchVectorColumn: any,
  // biome-ignore lint/suspicious/noExplicitAny: column type varies per entity
  fallbackColumns: any[],
): SQL<unknown> {
  const trimmed = searchText.trim();

  if (hasFts) {
    return sql`${searchVectorColumn} @@ plainto_tsquery('english', ${trimmed})`;
  }

  // Fallback: case-insensitive LIKE on each column
  const searchTerm = `%${trimmed}%`;
  const conditions = fallbackColumns.map((col) => flexLike(col, searchTerm));

  // Build OR expression manually
  if (conditions.length === 1) return conditions[0] as SQL<unknown>;
  return sql.join(
    conditions.map((c) => sql`(${c})`),
    sql` OR `,
  );
}

/**
 * Build a ts_rank expression for ordering results by relevance.
 * Returns null if FTS is not available (caller should use default sort instead).
 *
 * @param searchText - The user's search query
 * @param searchVectorColumn - The tsvector column
 */
export function buildSearchRank(
  searchText: string,
  // biome-ignore lint/suspicious/noExplicitAny: column type varies per entity
  searchVectorColumn: any,
): SQL<number> | null {
  if (!hasFts) return null;
  const trimmed = searchText.trim();
  return sql<number>`ts_rank(${searchVectorColumn}, plainto_tsquery('english', ${trimmed}))`;
}
