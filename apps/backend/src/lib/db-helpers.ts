import { formatToISO8601 } from "@eclaire/core";
import { eq, inArray, sql } from "drizzle-orm";
import { db, schema, txManager } from "../db/index.js";

const { tags } = schema;

/**
 * Efficiently finds or creates multiple tags using an atomic transaction.
 * Tags are scoped per user - each user has their own namespace for tag names.
 *
 * This function wraps the tag creation in a transaction for atomicity.
 * For operations already inside a transaction, use `tx.getOrCreateTags()` instead.
 */
export async function getOrCreateTags(
  tagNames: string[],
  userId: string,
): Promise<{ id: string; name: string }[]> {
  if (!tagNames || tagNames.length === 0) return [];

  return txManager.withTransaction(async (tx) => {
    return tx.getOrCreateTags(tagNames, userId);
  });
}

/**
 * Batch-load tags for multiple entities in a single query.
 * Replaces the N+1 pattern of calling getXxxTags(id) per item.
 *
 * @param junctionTable - The junction table (e.g. schema.bookmarksTags)
 * @param entityIdColumn - The entity FK column in the junction table (e.g. bookmarksTags.bookmarkId)
 * @param tagIdColumn - The tag FK column in the junction table (e.g. bookmarksTags.tagId)
 * @param entityIds - Array of entity IDs to load tags for
 * @returns Map from entity ID to array of tag names
 */
export async function batchGetTags(
  // biome-ignore lint/suspicious/noExplicitAny: junction table type varies per entity
  junctionTable: any,
  // biome-ignore lint/suspicious/noExplicitAny: column type varies per entity
  entityIdColumn: any,
  // biome-ignore lint/suspicious/noExplicitAny: column type varies per entity
  tagIdColumn: any,
  entityIds: string[],
): Promise<Map<string, string[]>> {
  if (entityIds.length === 0) return new Map();

  const rows: { entityId: string; tagName: string }[] = await db
    .select({
      entityId: sql<string>`${entityIdColumn}`,
      tagName: tags.name,
    })
    .from(junctionTable)
    .innerJoin(tags, eq(tagIdColumn, tags.id))
    .where(inArray(entityIdColumn, entityIds));

  const result = new Map<string, string[]>();
  for (const row of rows) {
    const existing = result.get(row.entityId);
    if (existing) {
      existing.push(row.tagName);
    } else {
      result.set(row.entityId, [row.tagName]);
    }
  }
  return result;
}

/**
 * Format item data with formatted date and tags
 */
// biome-ignore lint/suspicious/noExplicitAny: generic item formatter
export function formatItemData(item: any, itemTags: { name: string }[]) {
  // First create a new object without the old date fields
  const { createdAt, updatedAt, ...rest } = item;

  // Then add properly formatted date fields
  return {
    ...rest,
    dateCreated: formatToISO8601(item.dateCreated || item.createdAt),
    dateUpdated: formatToISO8601(item.dateUpdated || item.updatedAt),
    tags: itemTags.map((tag) => tag.name),
  };
}
