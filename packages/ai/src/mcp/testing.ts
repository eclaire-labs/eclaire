/**
 * MCP Test Utilities
 *
 * Provides in-process MCP server factories for integration testing.
 * Uses InMemoryTransport from the MCP SDK so tests exercise real
 * JSON-RPC framing, capability negotiation, and tool schemas without
 * spawning processes or making network calls.
 */

import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import { McpServerConnection } from "./connection.js";
import type { McpServerConfig } from "./types.js";

export interface TestToolDef {
  name: string;
  description?: string;
  /** Zod raw shape for tool parameters (e.g. { message: z.string() }) */
  schema?: Record<string, z.ZodTypeAny>;
  handler: (
    args: Record<string, unknown>,
  ) => CallToolResult | Promise<CallToolResult>;
}

export interface TestMcpServerOptions {
  name?: string;
  version?: string;
  tools?: TestToolDef[];
}

export interface TestMcpServer {
  /** Pass this to the MCP Client (or use it to replace the real transport in tests) */
  clientTransport: InMemoryTransport;
  serverTransport: InMemoryTransport;
  server: McpServer;
  close: () => Promise<void>;
}

/**
 * Create an in-process MCP server backed by InMemoryTransport.
 *
 * Returns a linked transport pair: wire `clientTransport` to your
 * MCP Client and the server is ready to respond.
 */
export async function createTestMcpServer(
  options: TestMcpServerOptions = {},
): Promise<TestMcpServer> {
  const { name = "test-mcp-server", version = "1.0.0", tools = [] } = options;

  const server = new McpServer(
    { name, version },
    { capabilities: { tools: {} } },
  );

  for (const tool of tools) {
    if (tool.schema) {
      server.tool(tool.name, tool.description ?? "", tool.schema, (args) =>
        tool.handler(args as Record<string, unknown>),
      );
    } else {
      server.tool(tool.name, tool.description ?? "", () => tool.handler({}));
    }
  }

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);

  return {
    clientTransport,
    serverTransport,
    server,
    close: async () => {
      await server.close();
    },
  };
}

/**
 * Create a McpServerConnection wired to an in-process MCP server.
 *
 * Returns both the real connection (using _testTransport injection)
 * and the backing test server for lifecycle control.
 */
export async function createTestConnection(
  serverKey: string,
  configOverrides: Partial<McpServerConfig> = {},
  serverOptions: TestMcpServerOptions = {},
): Promise<{ connection: McpServerConnection; testServer: TestMcpServer }> {
  const testServer = await createTestMcpServer(serverOptions);

  const config: McpServerConfig = {
    name: serverOptions.name ?? "test-server",
    transport: "stdio",
    command: "test-cmd",
    ...configOverrides,
  };

  const connection = new McpServerConnection(
    serverKey,
    config,
    testServer.clientTransport,
  );

  return { connection, testServer };
}
