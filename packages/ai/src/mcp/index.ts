/**
 * MCP Module
 *
 * Generic Model Context Protocol support for connecting AI agents
 * to MCP-compatible tool servers.
 */

export type {
  McpAvailabilityConfig,
  McpConnectionState,
  McpServerConfig,
  McpServersFileConfig,
  McpToolDescriptor,
  McpToolMode,
  McpTransportType,
} from "./types.js";

export { McpServerConnection } from "./connection.js";

export {
  mcpToolToRuntimeTool,
  mcpToolsToGroupedRuntimeTool,
  normalizeMcpResult,
} from "./tool-bridge.js";

export {
  createTestMcpServer,
  createTestConnection,
  type TestMcpServer,
  type TestMcpServerOptions,
  type TestToolDef,
} from "./testing.js";

export type { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
