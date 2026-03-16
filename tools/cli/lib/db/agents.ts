/**
 * Agent CRUD operations for the CLI.
 * Direct database access using Drizzle ORM.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "./index.js";

export interface AgentRow {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  toolNames: string[];
  skillNames: string[];
  modelId: string | null;
  createdAt: Date | number;
  updatedAt: Date | number;
}

export interface CreateAgentInput {
  userId: string;
  name: string;
  description?: string | null;
  systemPrompt: string;
  toolNames?: string[];
  skillNames?: string[];
  modelId?: string | null;
}

// biome-ignore lint/suspicious/noExplicitAny: DbInstance is a union type, queries work across all dialects
function query(): { db: any; agents: any } {
  const { db, schema } = getDb();
  return { db, agents: schema.agents };
}

export async function listAgents(userId: string): Promise<AgentRow[]> {
  const { db, agents } = query();
  return db.select().from(agents).where(eq(agents.userId, userId));
}

export async function getAgent(
  userId: string,
  agentId: string,
): Promise<AgentRow | undefined> {
  const { db, agents } = query();
  const rows = await db
    .select()
    .from(agents)
    .where(and(eq(agents.userId, userId), eq(agents.id, agentId)))
    .limit(1);
  return rows[0];
}

export async function createAgent(input: CreateAgentInput): Promise<AgentRow> {
  const { db, agents } = query();
  const rows = await db
    .insert(agents)
    .values({
      userId: input.userId,
      name: input.name,
      description: input.description ?? null,
      systemPrompt: input.systemPrompt,
      toolNames: input.toolNames ?? [],
      skillNames: input.skillNames ?? [],
      modelId: input.modelId ?? null,
    })
    .returning();
  return rows[0];
}

export async function updateAgent(
  id: string,
  data: Partial<{
    name: string;
    description: string | null;
    systemPrompt: string;
    toolNames: string[];
    skillNames: string[];
    modelId: string | null;
  }>,
): Promise<AgentRow | undefined> {
  const { db, agents } = query();
  const rows = await db
    .update(agents)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(agents.id, id))
    .returning();
  return rows[0];
}

export async function deleteAgent(id: string): Promise<boolean> {
  const { db, agents } = query();
  const rows = await db.delete(agents).where(eq(agents.id, id)).returning();
  return rows.length > 0;
}
