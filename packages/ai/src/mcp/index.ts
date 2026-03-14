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
