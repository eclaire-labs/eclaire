/**
 * MCP Registry
 *
 * Central manager for all MCP server connections. Owns connections,
 * discovers tools, and exposes them as RuntimeToolDefinitions for the agent.
 */

import {
  McpServerConnection,
  mcpToolToRuntimeTool,
  mcpToolsToGroupedRuntimeTool,
  type McpServerConfig,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import { config } from "../../config/index.js";
import { resolveBrowserCommand } from "../browser/command.js";
import { createChildLogger } from "../logger.js";

const logger = createChildLogger("mcp:registry");

export class McpRegistry {
  private readonly connections = new Map<string, McpServerConnection>();
  private readonly serverConfigs = new Map<string, McpServerConfig>();
  private readonly runtimeTools = new Map<string, RuntimeToolDefinition>();
  /** Maps runtime tool name → server key */
  private readonly toolToServer = new Map<string, string>();

  constructor(servers: Record<string, McpServerConfig>) {
    for (const [key, serverConfig] of Object.entries(servers)) {
      if (serverConfig.enabled === false) {
        logger.debug({ serverKey: key }, "MCP server disabled, skipping");
        continue;
      }
      this.serverConfigs.set(key, serverConfig);
      this.connections.set(key, new McpServerConnection(key, serverConfig));
    }
  }

  /**
   * Initialize the registry: for servers with autoConnect or non-managed toolMode,
   * connect and discover tools.
   */
  async initialize(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [key, serverConfig] of this.serverConfigs) {
      if (serverConfig.toolMode === "managed") {
        // Managed servers don't auto-discover tools
        continue;
      }

      if (serverConfig.autoConnect) {
        promises.push(this.connectAndDiscoverTools(key));
      }
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }

  private async connectAndDiscoverTools(serverKey: string): Promise<void> {
    const connection = this.connections.get(serverKey);
    const serverConfig = this.serverConfigs.get(serverKey);
    if (!connection || !serverConfig) return;

    try {
      const descriptors = await connection.discoverTools();
      logger.info(
        { serverKey, toolCount: descriptors.length },
        "Discovered MCP tools",
      );

      if (serverConfig.toolMode === "grouped") {
        const tool = mcpToolsToGroupedRuntimeTool(
          descriptors,
          connection,
          serverConfig,
        );
        this.runtimeTools.set(tool.name, tool);
        this.toolToServer.set(tool.name, serverKey);
      } else {
        // "individual" mode (default for non-managed)
        for (const descriptor of descriptors) {
          const tool = mcpToolToRuntimeTool(
            descriptor,
            connection,
            serverConfig,
          );
          this.runtimeTools.set(tool.name, tool);
          this.toolToServer.set(tool.name, serverKey);
        }
      }
    } catch (error) {
      logger.warn(
        { serverKey, err: error },
        "Failed to discover MCP tools — server will be retried on next use",
      );
    }
  }

  /**
   * Register an externally-managed tool name as belonging to an MCP server.
   * Used for managed-mode servers (e.g. Chrome) where the tool definition
   * is hand-crafted but availability should still be tracked via the registry.
   */
  registerManagedTool(toolName: string, serverKey: string): void {
    if (!this.serverConfigs.has(serverKey)) {
      throw new Error(`Cannot register tool for unknown server: ${serverKey}`);
    }
    this.toolToServer.set(toolName, serverKey);
  }

  /**
   * Get all MCP-sourced RuntimeToolDefinitions (for non-managed servers).
   */
  getMcpTools(): Record<string, RuntimeToolDefinition> {
    return Object.fromEntries(this.runtimeTools);
  }

  /**
   * Get a connection by server key (for managed-mode servers like Chrome).
   */
  getConnection(serverKey: string): McpServerConnection | undefined {
    return this.connections.get(serverKey);
  }

  /**
   * Get the server config for a server key.
   */
  getServerConfig(serverKey: string): McpServerConfig | undefined {
    return this.serverConfigs.get(serverKey);
  }

  /**
   * Get the server key for a given runtime tool name, if it's MCP-backed.
   */
  getServerKeyForTool(toolName: string): string | undefined {
    return this.toolToServer.get(toolName);
  }

  /**
   * Check availability of a tool, considering its MCP server's availability config.
   * Returns undefined for non-MCP tools (meaning: no MCP-level restriction).
   */
  getToolAvailability(toolName: string):
    | {
        availability: "available" | "setup_required" | "disabled";
        availabilityReason?: string;
      }
    | undefined {
    const serverKey = this.toolToServer.get(toolName);
    if (!serverKey) return undefined;
    return this.getServerAvailability(serverKey);
  }

  /**
   * Check availability of an MCP server.
   */
  getServerAvailability(serverKey: string): {
    availability: "available" | "setup_required" | "disabled";
    availabilityReason?: string;
  } {
    const serverConfig = this.serverConfigs.get(serverKey);
    if (!serverConfig) {
      return {
        availability: "disabled",
        availabilityReason: "MCP server not found.",
      };
    }

    if (serverConfig.availability?.requireLocal && config.isContainer) {
      return {
        availability: "disabled",
        availabilityReason: "Only available for local desktop installs.",
      };
    }

    // For stdio servers, check that the command is available
    if (serverConfig.transport === "stdio" && serverConfig.command) {
      const resolved = resolveBrowserCommand(serverConfig.command);
      if (!resolved) {
        return {
          availability: "setup_required",
          availabilityReason: `Install "${serverConfig.command}" to enable this server.`,
        };
      }
    }

    return { availability: "available" };
  }

  /**
   * Check if a given tool name is from an MCP server.
   */
  isMcpTool(toolName: string): boolean {
    return this.toolToServer.has(toolName);
  }

  /**
   * Disconnect all connections.
   */
  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.connections.values()).map((conn) =>
      conn.disconnect(),
    );
    await Promise.allSettled(promises);
  }

  /**
   * Get a summary of all registered servers and their states.
   */
  getStatus(): Array<{
    key: string;
    name: string;
    state: string;
    toolMode: string;
    toolCount: number;
  }> {
    return Array.from(this.serverConfigs.entries()).map(([key, cfg]) => {
      const conn = this.connections.get(key);
      const toolCount = Array.from(this.toolToServer.values()).filter(
        (sk) => sk === key,
      ).length;
      return {
        key,
        name: cfg.name,
        state: conn?.getState() ?? "unknown",
        toolMode: cfg.toolMode ?? "individual",
        toolCount,
      };
    });
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let _registry: McpRegistry | null = null;

/**
 * Get the MCP registry singleton. Must call initMcpRegistry() first.
 */
export function getMcpRegistry(): McpRegistry {
  if (!_registry) {
    throw new Error(
      "MCP registry not initialized. Call initMcpRegistry() first.",
    );
  }
  return _registry;
}

/**
 * Initialize the MCP registry singleton from config.
 */
export async function initMcpRegistry(
  servers: Record<string, McpServerConfig>,
): Promise<McpRegistry> {
  if (_registry) {
    await _registry.disconnectAll();
  }
  _registry = new McpRegistry(servers);
  await _registry.initialize();
  logger.info(
    { serverCount: _registry.getStatus().length },
    "MCP registry initialized",
  );
  return _registry;
}

/**
 * Reset the MCP registry (for testing).
 */
export async function resetMcpRegistry(): Promise<void> {
  if (_registry) {
    await _registry.disconnectAll();
    _registry = null;
  }
}
