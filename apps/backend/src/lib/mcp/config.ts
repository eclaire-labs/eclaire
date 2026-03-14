/**
 * MCP Server Configuration Loader
 *
 * Loads MCP server definitions from config/ai/mcp-servers.json.
 * Falls back to generating a Chrome DevTools entry from legacy env vars.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { McpServerConfig, McpServersFileConfig } from "@eclaire/ai";
import { config } from "../../config/index.js";
import { createChildLogger } from "../logger.js";

const logger = createChildLogger("mcp:config");

/**
 * Load MCP server configs from mcp-servers.json and/or legacy env vars.
 */
export function loadMcpServersConfig(): Record<string, McpServerConfig> {
  const configFilePath = path.join(
    config.dirs.config,
    "ai",
    "mcp-servers.json",
  );

  let fileServers: Record<string, McpServerConfig> = {};

  if (existsSync(configFilePath)) {
    try {
      const raw = readFileSync(configFilePath, "utf-8");
      const parsed = JSON.parse(raw) as McpServersFileConfig;
      fileServers = parsed.servers ?? {};
      logger.info(
        { path: configFilePath, count: Object.keys(fileServers).length },
        "Loaded MCP servers from config file",
      );
    } catch (error) {
      logger.warn(
        { path: configFilePath, err: error },
        "Failed to parse mcp-servers.json, ignoring",
      );
    }
  }

  // If no chrome-devtools entry from the config file, generate one
  // from the legacy browser config for backward compatibility.
  if (!fileServers["chrome-devtools"]) {
    fileServers["chrome-devtools"] = {
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

  return fileServers;
}
