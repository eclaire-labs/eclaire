/**
 * Test data factory for seeding MCP server configurations into the test database.
 */
import type { TestDatabase } from "../../../db/setup.js";

export interface SeedMcpServerOptions {
  id?: string;
  name?: string;
  description?: string;
  transport?: "stdio" | "sse" | "http";
  command?: string;
  args?: string[];
  enabled?: boolean;
  toolMode?: string;
  connectTimeout?: number;
  availability?: Record<string, unknown>;
}

export async function seedMcpServer(
  testDb: TestDatabase,
  overrides: SeedMcpServerOptions = {},
) {
  const { db, schema } = testDb;
  const id =
    overrides.id ?? `mcp-test-${Math.random().toString(36).substring(2, 10)}`;
  const name = overrides.name ?? `Test MCP Server ${id}`;

  await db.insert(schema.mcpServers).values({
    id,
    name,
    description: overrides.description ?? null,
    transport: overrides.transport ?? "stdio",
    command: overrides.command ?? "test-cmd",
    args: overrides.args ?? null,
    connectTimeout: overrides.connectTimeout ?? null,
    enabled: overrides.enabled !== false,
    toolMode: overrides.toolMode ?? "individual",
    availability: overrides.availability ?? null,
  });

  return { id, name };
}
