/**
 * Channel CRUD operations for the CLI.
 * Direct database access using Drizzle ORM.
 *
 * Uses `any` for DB operations because DbInstance is a union
 * of Postgres/PGlite/SQLite types. The queries work identically across all.
 */

import { eq } from "drizzle-orm";
import { getDb } from "./index.js";

export interface ChannelRow {
  id: string;
  userId: string;
  name: string;
  platform: string;
  capability: string;
  config: unknown;
  isActive: boolean;
  createdAt: Date | number;
  updatedAt: Date | number;
}

export interface CreateChannelInput {
  userId: string;
  name: string;
  platform: string;
  capability: string;
  config: Record<string, unknown>;
}

// biome-ignore lint/suspicious/noExplicitAny: DbInstance is a union type, queries work across all dialects
function query(): { db: any; channels: any } {
  const { db, schema } = getDb();
  return { db, channels: schema.channels };
}

export async function listChannels(
  userId?: string,
  platform?: string,
): Promise<ChannelRow[]> {
  const { db, channels } = query();

  if (userId && platform) {
    return db.select().from(channels).where(eq(channels.userId, userId));
  }
  if (userId) {
    return db.select().from(channels).where(eq(channels.userId, userId));
  }
  if (platform) {
    return db.select().from(channels).where(eq(channels.platform, platform));
  }
  return db.select().from(channels);
}

export async function getChannel(id: string): Promise<ChannelRow | undefined> {
  const { db, channels } = query();
  const rows = await db
    .select()
    .from(channels)
    .where(eq(channels.id, id))
    .limit(1);
  return rows[0];
}

export async function createChannel(
  input: CreateChannelInput,
): Promise<ChannelRow> {
  const { db, channels } = query();
  const rows = await db
    .insert(channels)
    .values({
      userId: input.userId,
      name: input.name,
      platform: input.platform,
      capability: input.capability,
      config: input.config,
    })
    .returning();
  return rows[0];
}

export async function updateChannel(
  id: string,
  data: Partial<{
    name: string;
    config: Record<string, unknown>;
    capability: string;
    isActive: boolean;
  }>,
): Promise<ChannelRow | undefined> {
  const { db, channels } = query();
  const rows = await db
    .update(channels)
    .set(data)
    .where(eq(channels.id, id))
    .returning();
  return rows[0];
}

export async function deleteChannel(id: string): Promise<boolean> {
  const { db, channels } = query();
  const rows = await db
    .delete(channels)
    .where(eq(channels.id, id))
    .returning();
  return rows.length > 0;
}
