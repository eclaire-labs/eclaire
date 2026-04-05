import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "../../db/index.js";

const {
  tags,
  bookmarksTags,
  documentsTags,
  mediaTags,
  notesTags,
  photosTags,
  tasksTags,
} = schema;

export type EntityType =
  | "bookmarks"
  | "documents"
  | "media"
  | "notes"
  | "photos"
  | "tasks";

const junctionMap = {
  bookmarks: { table: bookmarksTags, tagIdCol: bookmarksTags.tagId },
  documents: { table: documentsTags, tagIdCol: documentsTags.tagId },
  media: { table: mediaTags, tagIdCol: mediaTags.tagId },
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
      .selectDistinct({
        name: tags.name,
        nameLower: sql<string>`lower(${tags.name})`,
      })
      .from(tags)
      .innerJoin(junction.table, eq(junction.tagIdCol, tags.id))
      .where(eq(tags.userId, userId))
      .orderBy(asc(sql`lower(${tags.name})`));
    return rows.map((r) => r.name);
  }

  const rows = await db
    .selectDistinct({
      name: tags.name,
      nameLower: sql<string>`lower(${tags.name})`,
    })
    .from(tags)
    .where(eq(tags.userId, userId))
    .orderBy(asc(sql`lower(${tags.name})`));
  return rows.map((r) => r.name);
}

/**
 * Returns the most popular tags for a user, ranked by total usage count
 * across all entity types (tasks, bookmarks, documents, notes, photos).
 */
export async function findPopularTags(
  userId: string,
  limit: number = 10,
): Promise<Array<{ name: string; count: number }>> {
  const rows = await db.execute(sql`
    SELECT ${tags.name} as name, cast(count(*) as integer) as count
    FROM ${tags}
    INNER JOIN (
      SELECT ${bookmarksTags.tagId} as tag_id FROM ${bookmarksTags}
      UNION ALL
      SELECT ${documentsTags.tagId} as tag_id FROM ${documentsTags}
      UNION ALL
      SELECT ${notesTags.tagId} as tag_id FROM ${notesTags}
      UNION ALL
      SELECT ${photosTags.tagId} as tag_id FROM ${photosTags}
      UNION ALL
      SELECT ${mediaTags.tagId} as tag_id FROM ${mediaTags}
      UNION ALL
      SELECT ${tasksTags.tagId} as tag_id FROM ${tasksTags}
    ) all_usages ON ${tags.id} = all_usages.tag_id
    WHERE ${tags.userId} = ${userId}
    GROUP BY ${tags.name}
    ORDER BY count DESC, lower(${tags.name}) ASC
    LIMIT ${limit}
  `);

  return [...rows].map((r: Record<string, unknown>) => ({
    name: String(r.name),
    count: Number(r.count),
  }));
}
