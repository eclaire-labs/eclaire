import { formatToISO8601 } from "@eclaire/core";
import { txManager } from "../db/index.js";

// Re-export for backward compatibility
export { formatRequiredTimestamp, formatToISO8601 } from "@eclaire/core";

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
 * Format item data with formatted date and tags
 */
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
