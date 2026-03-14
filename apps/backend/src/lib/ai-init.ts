/**
 * AI Client Initialization
 *
 * Initializes the @eclaire/ai package with backend configuration.
 * Call this early in application startup, before using any AI functions.
 */

import * as path from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { initAI, registerSkillSource } from "@eclaire/ai";
import { config } from "../config/index.js";
import { createChildLogger } from "./logger.js";
import { initMcpRegistry, loadMcpServersConfig } from "./mcp/index.js";

type SkillSourceScope = "admin" | "user";

export interface RegisteredSkillSource {
  dir: string;
  scope: SkillSourceScope;
}

export function resolveAISkillSources(
  options: {
    runtime?: "local" | "container";
    configDir?: string;
    adminSkillsDir?: string;
    userSkillsDirs?: string[];
    userHomeDir?: string;
    pathExists?: (filePath: string) => boolean;
  } = {},
): RegisteredSkillSource[] {
  const runtime = options.runtime ?? config.runtime;
  const configDir = options.configDir ?? config.dirs.config;
  const adminSkillsDir = options.adminSkillsDir ?? config.ai.skillsDir;
  const userSkillsDirs = options.userSkillsDirs ?? config.ai.userSkillsDirs;
  const userHomeDir = options.userHomeDir ?? homedir();
  const pathExists = options.pathExists ?? existsSync;

  const sources: RegisteredSkillSource[] = [
    {
      dir: path.join(configDir, "ai", "skills"),
      scope: "admin",
    },
  ];

  if (adminSkillsDir) {
    sources.push({ dir: adminSkillsDir, scope: "admin" });
  }

  if (runtime === "local") {
    const defaultUserSkillsDir = path.join(userHomeDir, ".agents", "skills");
    if (pathExists(defaultUserSkillsDir)) {
      sources.push({ dir: defaultUserSkillsDir, scope: "user" });
    }

    for (const dir of userSkillsDirs ?? []) {
      sources.push({ dir, scope: "user" });
    }
  }

  return sources;
}

/**
 * Initialize the AI client with backend configuration.
 * Must be called before validateAIConfigOnStartup() or any AI calls.
 */
export function initializeAI(): void {
  initAI({
    configPath: path.join(config.dirs.config, "ai"),
    createChildLogger,
    debugLogPath: config.ai.debugLogPath,
  });

  for (const source of resolveAISkillSources()) {
    registerSkillSource(source.dir, source.scope);
  }
}

/**
 * Initialize the MCP server registry.
 * Call after initializeAI() during application startup.
 */
export async function initializeMcp(): Promise<void> {
  const servers = loadMcpServersConfig();
  const registry = await initMcpRegistry(servers);

  // Register managed tool names so the registry can track their availability.
  // browseChrome is hand-crafted but backed by the chrome-devtools MCP server.
  registry.registerManagedTool("browseChrome", "chrome-devtools");
}
