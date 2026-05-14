/**
 * MCP Module
 *
 * Generic Model Context Protocol support for connecting AI agents
 * to MCP-compatible tool servers.
 */

export type { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

export { McpServerConnection } from "./connection.js";
export {
  createTestConnection,
  createTestMcpServer,
  type TestMcpServer,
  type TestMcpServerOptions,
  type TestToolDef,
} from "./testing.js";
export {
  mcpToolsToGroupedRuntimeTool,
  mcpToolToRuntimeTool,
  normalizeMcpResult,
} from "./tool-bridge.js";
export type {
  McpAvailabilityConfig,
  McpConnectionState,
  McpServerConfig,
  McpServersFileConfig,
  McpToolDescriptor,
  McpToolMode,
  McpTransportType,
} from "./types.js";
