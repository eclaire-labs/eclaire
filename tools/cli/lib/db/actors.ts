/**
 * Actor queries for the CLI.
 * Direct database access using Drizzle ORM.
 */

import { and, eq } from "drizzle-orm";
import { generateActorId } from "@eclaire/core";
import { getDb } from "./index.js";

export interface ActorRow {
  id: string;
  ownerUserId: string;
  kind: string;
  displayName: string | null;
  createdAt: Date | number;
}

// biome-ignore lint/suspicious/noExplicitAny: DbInstance is a union type, queries work across all dialects
function query(): { db: any; actors: any } {
  const { db, schema } = getDb();
  return { db, actors: schema.actors };
}

export async function listActors(ownerUserId: string): Promise<ActorRow[]> {
  const { db, actors } = query();
  return db.select().from(actors).where(eq(actors.ownerUserId, ownerUserId));
}

export async function getActor(id: string): Promise<ActorRow | undefined> {
  const { db, actors } = query();
  const rows = await db.select().from(actors).where(eq(actors.id, id)).limit(1);
  return rows[0];
}

/**
 * Get or create the human actor for a user.
 * Every user has exactly one human actor.
 */
export async function getOrCreateHumanActor(userId: string): Promise<ActorRow> {
  const { db, actors } = query();

  // Check for existing human actor
  const existing = await db
    .select()
    .from(actors)
    .where(and(eq(actors.ownerUserId, userId), eq(actors.kind, "human")))
    .limit(1);

  if (existing.length > 0) return existing[0];

  // Create one
  const rows = await db
    .insert(actors)
    .values({
      id: generateActorId(),
      ownerUserId: userId,
      kind: "human",
      displayName: null,
    })
    .returning();
  return rows[0];
}
