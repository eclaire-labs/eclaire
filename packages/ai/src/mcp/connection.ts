/**
 * MCP Server Connection
 *
 * Generic MCP client that handles transport creation, connection lifecycle,
 * tool discovery, and tool calling for any MCP server.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Mutex } from "async-mutex";
import type {
  McpConnectionState,
  McpServerConfig,
  McpToolDescriptor,
} from "./types.js";

const DEFAULT_CONNECT_TIMEOUT = 15_000;

function sanitizeEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

type Transport =
  | StdioClientTransport
  | SSEClientTransport
  | StreamableHTTPClientTransport;

export class McpServerConnection {
  private client: Client | null = null;
  private state: McpConnectionState = "disconnected";
  private lastError: string | null = null;
  private discoveredTools: McpToolDescriptor[] = [];
  private readonly mutex = new Mutex();

  constructor(
    private readonly serverKey: string,
    private readonly config: McpServerConfig,
  ) {}

  getState(): McpConnectionState {
    return this.state;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  getServerKey(): string {
    return this.serverKey;
  }

  getConfig(): McpServerConfig {
    return this.config;
  }

  getDiscoveredTools(): McpToolDescriptor[] {
    return this.discoveredTools;
  }

  private createTransport(): Transport {
    switch (this.config.transport) {
      case "stdio": {
        if (!this.config.command) {
          throw new Error(
            `MCP server "${this.serverKey}" uses stdio transport but no command is configured`,
          );
        }
        return new StdioClientTransport({
          command: this.config.command,
          args: this.config.args,
          stderr: "pipe",
          env: {
            ...sanitizeEnv(process.env),
            ...this.config.env,
          },
        });
      }
      case "sse": {
        if (!this.config.url) {
          throw new Error(
            `MCP server "${this.serverKey}" uses sse transport but no url is configured`,
          );
        }
        return new SSEClientTransport(new URL(this.config.url));
      }
      case "streamable-http": {
        if (!this.config.url) {
          throw new Error(
            `MCP server "${this.serverKey}" uses streamable-http transport but no url is configured`,
          );
        }
        return new StreamableHTTPClientTransport(new URL(this.config.url));
      }
      default:
        throw new Error(
          `MCP server "${this.serverKey}" has unsupported transport: ${this.config.transport}`,
        );
    }
  }

  /**
   * Ensure the client is connected. Safe to call multiple times —
   * only connects if not already connected. Mutex-protected.
   */
  async ensureConnected(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      if (this.client && this.state === "connected") {
        return;
      }

      this.state = "connecting";
      this.lastError = null;

      const transport = this.createTransport();
      const client = new Client(
        { name: "@eclaire/ai", version: "0.0.0" },
        { capabilities: {} },
      );

      const timeout = this.config.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT;

      try {
        await Promise.race([
          client.connect(transport),
          new Promise((_resolve, reject) => {
            setTimeout(() => {
              reject(
                new Error(
                  `MCP server "${this.serverKey}" connect timed out after ${timeout}ms`,
                ),
              );
            }, timeout);
          }),
        ]);

        this.client = client;
        this.state = "connected";
      } catch (error) {
        this.client = null;
        this.state = "error";
        this.lastError =
          error instanceof Error
            ? error.message
            : `Failed to connect to MCP server "${this.serverKey}"`;
        throw error;
      }
    });
  }

  /**
   * Discover available tools from the MCP server.
   * Connects if not already connected.
   */
  async discoverTools(): Promise<McpToolDescriptor[]> {
    await this.ensureConnected();

    if (!this.client) {
      throw new Error(`MCP server "${this.serverKey}" client is not connected`);
    }

    const result = await this.client.listTools();
    const allowedSet = this.config.allowedTools
      ? new Set(this.config.allowedTools)
      : null;
    const blockedSet = this.config.blockedTools
      ? new Set(this.config.blockedTools)
      : null;

    this.discoveredTools = result.tools
      .filter((tool) => {
        if (allowedSet && !allowedSet.has(tool.name)) return false;
        if (blockedSet?.has(tool.name)) return false;
        return true;
      })
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: (tool.inputSchema ?? {}) as Record<string, unknown>,
        serverKey: this.serverKey,
      }));

    return this.discoveredTools;
  }

  /**
   * Call a tool on the MCP server.
   * Connects if not already connected.
   */
  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<unknown> {
    await this.ensureConnected();

    if (!this.client) {
      throw new Error(`MCP server "${this.serverKey}" client is not connected`);
    }

    try {
      return await this.client.callTool({ name, arguments: args });
    } catch (error) {
      this.state = "error";
      this.lastError =
        error instanceof Error
          ? error.message
          : `MCP tool "${name}" on server "${this.serverKey}" failed`;
      throw error;
    }
  }

  /**
   * Disconnect from the MCP server. Mutex-protected.
   */
  async disconnect(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      try {
        await this.client?.close();
      } catch {
        // Swallow close errors
      } finally {
        this.client = null;
        this.state = "disconnected";
      }
    });
  }
}
