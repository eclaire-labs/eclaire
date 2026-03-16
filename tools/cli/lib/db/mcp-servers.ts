/**
 * MCP Server CRUD operations for the CLI.
 * Direct database access using Drizzle ORM.
 *
 * Uses `any` for DB operations because DbInstance is a union
 * of Postgres/PGlite/SQLite types. The queries work identically across all.
 */

import { eq } from "drizzle-orm";
import { getDb } from "./index.js";

export interface McpServerRow {
  id: string;
  name: string;
  description: string | null;
  transport: string;
  command: string | null;
  args: string[] | null;
  connectTimeout: number | null;
  enabled: boolean;
  toolMode: string | null;
  availability: unknown;
  createdAt: Date | number;
  updatedAt: Date | number;
}

export interface CreateMcpServerInput {
  id: string;
  name: string;
  description?: string | null;
  transport: string;
  command?: string | null;
  args?: string[] | null;
  connectTimeout?: number | null;
  enabled?: boolean;
  toolMode?: string | null;
}

// biome-ignore lint/suspicious/noExplicitAny: DbInstance is a union type, queries work across all dialects
function query(): { db: any; mcpServers: any } {
  const { db, schema } = getDb();
  return { db, mcpServers: schema.mcpServers };
}

export async function listMcpServers(): Promise<McpServerRow[]> {
  const { db, mcpServers } = query();
  return db.select().from(mcpServers);
}

export async function getMcpServer(
  id: string,
): Promise<McpServerRow | undefined> {
  const { db, mcpServers } = query();
  const rows = await db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.id, id))
    .limit(1);
  return rows[0];
}

export async function createMcpServer(
  input: CreateMcpServerInput,
): Promise<void> {
  const { db, mcpServers } = query();
  await db.insert(mcpServers).values({
    id: input.id,
    name: input.name,
    description: input.description ?? null,
    transport: input.transport,
    command: input.command ?? null,
    args: input.args ?? null,
    connectTimeout: input.connectTimeout ?? null,
    enabled: input.enabled !== false,
    toolMode: input.toolMode ?? "managed",
  });
}

export async function updateMcpServer(
  id: string,
  data: Partial<{
    name: string;
    description: string | null;
    transport: string;
    command: string | null;
    args: string[] | null;
    connectTimeout: number | null;
    enabled: boolean;
    toolMode: string;
  }>,
): Promise<McpServerRow | undefined> {
  const { db, mcpServers } = query();
  const rows = await db
    .update(mcpServers)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(mcpServers.id, id))
    .returning();
  return rows[0];
}

export async function deleteMcpServer(id: string): Promise<boolean> {
  const { db, mcpServers } = query();
  const rows = await db
    .delete(mcpServers)
    .where(eq(mcpServers.id, id))
    .returning();
  return rows.length > 0;
}
