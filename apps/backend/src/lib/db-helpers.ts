import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { generateTagId } from "./id-generator";

const { tags: tagsSchema } = schema;

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
 * Format a timestamp to ISO 8601 string.
 *
 * With Drizzle's `mode: 'timestamp_ms'`, SQLite now returns Date objects just like PostgreSQL.
 * This function safely handles Date objects, numbers (milliseconds), strings, and invalid inputs.
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
    // Check for Invalid Date - this was the source of the original error
    const time = timestamp.getTime();
    if (isNaN(time)) {
      console.error("formatToISO8601: Invalid Date object received", {
        timestamp,
      });
      return null;
    }
    return timestamp.toISOString();
  }

  // Handle numeric timestamps (milliseconds since epoch)
  if (typeof timestamp === "number") {
    if (isNaN(timestamp) || !isFinite(timestamp)) {
      console.error("formatToISO8601: Invalid numeric timestamp", {
        timestamp,
      });
      return null;
    }
    const date = new Date(timestamp);
    const time = date.getTime();
    if (isNaN(time)) {
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
    if (isNaN(time)) {
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
 * Use this for non-null database fields like createdAt and updatedAt.
 * Throws an error if the timestamp is null/undefined/invalid.
 *
 * @param timestamp - Date object (required)
 * @returns ISO 8601 string (never null)
 * @throws Error if timestamp is null, undefined, or invalid
 */
export function formatRequiredTimestamp(timestamp: Date | number | string): string {
  const result = formatToISO8601(timestamp);
  if (result === null) {
    throw new Error(`Invalid required timestamp: ${timestamp}`);
  }
  return result;
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
