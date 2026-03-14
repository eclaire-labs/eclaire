/**
 * MCP Types
 *
 * Shared type definitions for Model Context Protocol server connections
 * and tool discovery.
 */

// =============================================================================
// TRANSPORT & CONNECTION
// =============================================================================

/** Supported MCP transport types */
export type McpTransportType = "stdio" | "sse" | "streamable-http";

/** Connection lifecycle state */
export type McpConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

// =============================================================================
// SERVER CONFIGURATION
// =============================================================================

/**
 * How MCP tools are exposed to the agent:
 * - "individual": each MCP tool becomes a separate RuntimeToolDefinition
 * - "grouped": all tools collapsed into a single RuntimeToolDefinition with action enum
 * - "managed": connection only — tool definitions are hand-crafted externally
 */
export type McpToolMode = "individual" | "grouped" | "managed";

/** Availability gates for an MCP server */
export interface McpAvailabilityConfig {
  /** Only available on local desktop (not in containers) */
  requireLocal?: boolean;
  /** Only available in human-authenticated sessions */
  requireHumanAuth?: boolean;
  /** Disabled during background task execution */
  disableInBackground?: boolean;
}

/** Configuration for a single MCP server */
export interface McpServerConfig {
  /** Human-readable name */
  name: string;
  /** Description of what this server provides */
  description?: string;
  /** Transport type */
  transport: McpTransportType;

  // --- stdio transport ---
  /** Command to spawn (for stdio transport) */
  command?: string;
  /** Command arguments */
  args?: string[];
  /** Additional environment variables */
  env?: Record<string, string>;

  // --- HTTP-based transports (sse, streamable-http) ---
  /** Server URL */
  url?: string;

  // --- connection ---
  /** Connection timeout in ms (default: 15000) */
  connectTimeout?: number;
  /** Whether this server is enabled (default: true) */
  enabled?: boolean;
  /** Connect eagerly at startup vs lazily on first use (default: false) */
  autoConnect?: boolean;

  // --- tool mapping ---
  /** Prefix for tool names, e.g. "chrome" → "chrome_navigate_page" */
  toolPrefix?: string;
  /** How tools are exposed to the agent */
  toolMode?: McpToolMode;
  /** For toolMode "grouped", the single tool name */
  groupedToolName?: string;

  // --- availability ---
  /** Availability gates */
  availability?: McpAvailabilityConfig;

  // --- tool filtering ---
  /** Allowlist of MCP tool names (null = all allowed) */
  allowedTools?: string[] | null;
  /** Blocklist of MCP tool names (null = none blocked) */
  blockedTools?: string[] | null;

  // --- prompt contributions ---
  /** Text snippet injected into the system prompt */
  promptSnippet?: string;
  /** Guidelines appended as rules to the system prompt */
  promptGuidelines?: string[];
}

// =============================================================================
// TOOL DESCRIPTORS
// =============================================================================

/** Descriptor for a tool discovered from an MCP server */
export interface McpToolDescriptor {
  /** Tool name as reported by the MCP server */
  name: string;
  /** Tool description */
  description?: string;
  /** JSON Schema for the tool's input parameters */
  inputSchema: Record<string, unknown>;
  /** Key of the server this tool belongs to */
  serverKey: string;
}

// =============================================================================
// MCP SERVERS CONFIG FILE
// =============================================================================

/** Shape of the mcp-servers.json config file */
export interface McpServersFileConfig {
  servers: Record<string, McpServerConfig>;
}
