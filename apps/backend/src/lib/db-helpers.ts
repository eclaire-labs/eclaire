import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { tags as tagsSchema } from "@/db/schema";
import { generateTagId } from "./id-generator";

type DrizzleClient =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Efficiently finds or creates multiple tags using a single atomic database operation.
 * This is the recommended pattern to avoid long-running transactions and race conditions.
 * Tags are scoped per user - each user has their own namespace for tag names.
 */
export async function getOrCreateTags(
  tagNames: string[],
  userId: string,
  tx?: DrizzleClient,
): Promise<{ id: string; name: string }[]> {
  const dbInstance = tx || db;
  if (!tagNames || tagNames.length === 0) return [];

  const uniqueTagNames = [
    ...new Set(
      tagNames.map((name) => name.trim().toLowerCase()).filter(Boolean),
    ),
  ];
  if (uniqueTagNames.length === 0) return [];

  // Step 1: Atomically insert all tags for this user.
  // The database will attempt to insert every tag. If a tag's 'name' already
  // exists for this user, the ON CONFLICT clause tells the DB to simply do nothing for that row
  // and move on. This is a single, ultra-fast, atomic operation.
  await dbInstance
    .insert(tagsSchema)
    .values(
      uniqueTagNames.map((name) => ({
        id: generateTagId(),
        name,
        userId,
      })),
    )
    .onConflictDoNothing({ target: [tagsSchema.userId, tagsSchema.name] });

  // Step 2: Now that all tags are guaranteed to exist, select them all in a
  // single, final query, scoped to this user.
  const allTags = await dbInstance
    .select()
    .from(tagsSchema)
    .where(
      and(
        eq(tagsSchema.userId, userId),
        inArray(tagsSchema.name, uniqueTagNames),
      ),
    );

  return allTags;
}

/**
 * Format a timestamp to ISO 8601
 * Handles both Date objects (from PostgreSQL) and numeric timestamps (from SQLite)
 */
export function formatToISO8601(
  timestamp: number | Date | null | undefined,
): string {
  if (timestamp === null || timestamp === undefined) {
    return new Date().toISOString(); // Default to current date if timestamp is missing
  }

  // If it's already a Date object (PostgreSQL), just return its ISO string
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }

  // Handle numeric timestamps (SQLite legacy)
  const numericTimestamp = Number(timestamp);

  // Validate that the timestamp is a valid number
  if (isNaN(numericTimestamp)) {
    return new Date().toISOString(); // Fallback to current date
  }

  // SQLite timestamp is in seconds since epoch, need to convert to milliseconds for JS Date
  // But first check if it's already in milliseconds (very large number)
  const timestampInMs =
    numericTimestamp > 100000000000
      ? numericTimestamp
      : numericTimestamp * 1000;

  return new Date(timestampInMs).toISOString();
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
