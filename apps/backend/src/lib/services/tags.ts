import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "../../db/index.js";

const {
  tags,
  bookmarksTags,
  documentsTags,
  notesTags,
  photosTags,
  tasksTags,
} = schema;

export type EntityType =
  | "bookmarks"
  | "documents"
  | "notes"
  | "photos"
  | "tasks";

const junctionMap = {
  bookmarks: { table: bookmarksTags, tagIdCol: bookmarksTags.tagId },
  documents: { table: documentsTags, tagIdCol: documentsTags.tagId },
  notes: { table: notesTags, tagIdCol: notesTags.tagId },
  photos: { table: photosTags, tagIdCol: photosTags.tagId },
  tasks: { table: tasksTags, tagIdCol: tasksTags.tagId },
} as const;

/**
 * Returns all tag names for a user, optionally filtered to tags actually
 * used by a specific entity type.
 */
export async function findUserTags(
  userId: string,
  type?: EntityType,
): Promise<string[]> {
  if (type) {
    const junction = junctionMap[type];
    const rows = await db
      .selectDistinct({ name: tags.name })
      .from(tags)
      .innerJoin(junction.table, eq(junction.tagIdCol, tags.id))
      .where(eq(tags.userId, userId))
      .orderBy(asc(sql`lower(${tags.name})`));
    return rows.map((r) => r.name);
  }

  const rows = await db
    .selectDistinct({ name: tags.name })
    .from(tags)
    .where(eq(tags.userId, userId))
    .orderBy(asc(sql`lower(${tags.name})`));
  return rows.map((r) => r.name);
}
