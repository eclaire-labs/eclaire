/**
 * AI Client Initialization
 *
 * Initializes the @eclaire/ai package with backend configuration.
 * Call this early in application startup, before using any AI functions.
 *
 * Config loading order:
 * 1. Try loading from database (runtime source of truth)
 * 2. If DB is empty, seed from JSON config files (first-run bootstrap)
 * 3. Initialize AI package with inline config from DB or file path fallback
 */

import * as path from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { initAI, registerSkillSource } from "@eclaire/ai";
import { config } from "../config/index.js";
import { createChildLogger } from "./logger.js";
import { initMcpRegistry, loadMcpServersConfig } from "./mcp/index.js";
import { loadConfigFromDb, seedFromJsonFiles } from "./services/ai-config.js";

const logger = createChildLogger("ai-init");

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
    customSkillsDirs?: string[];
    userHomeDir?: string;
    pathExists?: (filePath: string) => boolean;
  } = {},
): RegisteredSkillSource[] {
  const runtime = options.runtime ?? config.runtime;
  const configDir = options.configDir ?? config.dirs.config;
  const adminSkillsDir = options.adminSkillsDir ?? config.ai.skillsDir;
  const customSkillsDirs =
    options.customSkillsDirs ?? config.ai.customSkillsDirs;
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

    for (const dir of customSkillsDirs ?? []) {
      sources.push({ dir, scope: "user" });
    }
  }

  return sources;
}

/**
 * Initialize the AI client with backend configuration.
 * Must be called before validateAIConfigOnStartup() or any AI calls.
 *
 * Config loading order:
 * 1. Try loading from database (runtime source of truth)
 * 2. If DB is empty, seed from JSON config files, then load from DB
 * 3. Fall back to file-based config if DB loading fails entirely
 */
export async function initializeAI(): Promise<void> {
  const configAiDir = path.join(config.dirs.config, "ai");

  // Try loading from DB, seeding from JSON files if empty
  try {
    let loaded = await loadConfigFromDb();
    if (!loaded) {
      const result = await seedFromJsonFiles(configAiDir);
      if (result.providers > 0) {
        loaded = await loadConfigFromDb();
      }
    }
    if (loaded) {
      logger.info("AI configuration loaded from database");
    }
  } catch (error) {
    logger.debug(
      { error },
      "Could not load AI config from database, falling back to JSON files",
    );
  }

  // initAI sets up logger, debug path, and config path as fallback.
  // If loadConfigFromDb succeeded, the caches are already populated via setInlineConfig
  // and the configPath is only set as a fallback (never used while caches exist).
  initAI({
    configPath: configAiDir,
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
  const servers = await loadMcpServersConfig();
  const registry = await initMcpRegistry(servers);

  // Register managed tool names so the registry can track their availability.
  // browseChrome is hand-crafted but backed by the chrome-devtools MCP server.
  registry.registerManagedTool("browseChrome", "chrome-devtools");
}
