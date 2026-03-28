/**
 * MCP Server Configuration Loader
 *
 * Loads MCP server definitions from the database (runtime source of truth).
 * Falls back to config/ai/mcp-servers.json for first-run bootstrap.
 * Always generates a Chrome DevTools entry from env vars if not present.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type {
  McpServerConfig,
  McpServersFileConfig,
  McpTransportType,
} from "@eclaire/ai";
import { config } from "../../config/index.js";
import { listMcpServers } from "../services/ai-config.js";
import { createChildLogger } from "../logger.js";

const logger = createChildLogger("mcp:config");

/** Map DB transport values to runtime transport type. */
function normalizeTransport(dbTransport: string): McpTransportType {
  switch (dbTransport) {
    case "stdio":
      return "stdio";
    case "sse":
      return "sse";
    case "http":
    case "streamable-http":
      return "streamable-http";
    default:
      logger.warn(
        { transport: dbTransport },
        "Unknown MCP transport, defaulting to stdio",
      );
      return "stdio";
  }
}

/**
 * Load MCP server configs from DB, with fallback to JSON file and legacy env vars.
 */
export async function loadMcpServersConfig(): Promise<
  Record<string, McpServerConfig>
> {
  let servers: Record<string, McpServerConfig> = {};

  // Try loading from database first
  try {
    const dbServers = await listMcpServers();
    if (dbServers.length > 0) {
      for (const row of dbServers) {
        if (!row.enabled) continue;
        const transport = normalizeTransport(row.transport);
        const isHttpTransport =
          transport === "sse" || transport === "streamable-http";
        servers[row.id] = {
          name: row.name,
          description: row.description ?? undefined,
          transport,
          command: isHttpTransport ? undefined : (row.command ?? undefined),
          url: isHttpTransport ? (row.command ?? undefined) : undefined,
          args: isHttpTransport
            ? undefined
            : ((row.args as string[]) ?? undefined),
          connectTimeout: row.connectTimeout ?? undefined,
          enabled: row.enabled,
          toolMode: (row.toolMode as McpServerConfig["toolMode"]) ?? undefined,
          availability:
            (row.availability as McpServerConfig["availability"]) ?? undefined,
        };
      }
      logger.info(
        { count: Object.keys(servers).length },
        "Loaded MCP servers from database",
      );
    }
  } catch (error) {
    logger.debug(
      { error },
      "Could not load MCP servers from database, trying JSON file",
    );
  }

  // If DB was empty, fall back to JSON file
  if (Object.keys(servers).length === 0) {
    const configFilePath = path.join(
      config.dirs.config,
      "ai",
      "mcp-servers.json",
    );

    if (existsSync(configFilePath)) {
      try {
        const raw = readFileSync(configFilePath, "utf-8");
        const parsed = JSON.parse(raw) as McpServersFileConfig;
        servers = parsed.servers ?? {};
        logger.info(
          { path: configFilePath, count: Object.keys(servers).length },
          "Loaded MCP servers from config file",
        );
      } catch (error) {
        logger.warn(
          { path: configFilePath, err: error },
          "Failed to parse mcp-servers.json, ignoring",
        );
      }
    }
  }

  // If no chrome-devtools entry, generate one from legacy browser config
  if (!servers["chrome-devtools"]) {
    servers["chrome-devtools"] = {
      name: "Chrome DevTools",
      description:
        "Control the user's live Chrome browser session via Chrome DevTools MCP",
      transport: "stdio",
      command: config.browser.chromeMcpCommand,
      args: ["--autoConnect"],
      connectTimeout: config.browser.chromeMcpConnectTimeout,
      enabled: true,
      toolMode: "managed",
      availability: {
        requireLocal: true,
        requireHumanAuth: true,
        disableInBackground: true,
      },
    };
    logger.debug(
      "Generated chrome-devtools MCP entry from legacy browser config",
    );
  }

  return servers;
}
