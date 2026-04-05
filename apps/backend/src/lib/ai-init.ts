/**
 * AI Client Initialization
 *
 * Initializes the @eclaire/ai package with backend configuration.
 * Call this early in application startup, before using any AI functions.
 *
 * Config is loaded exclusively from the database. If the DB is empty
 * (fresh install), the system starts with no AI config — users configure
 * providers and models via the admin UI or CLI.
 */

import * as path from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import {
  initAI,
  loadModelsConfiguration,
  loadProvidersConfiguration,
  loadSelectionConfiguration,
  registerSkillSource,
  setInlineConfig,
} from "@eclaire/ai";
import { config } from "../config/index.js";
import { createChildLogger } from "./logger.js";
import { initMcpRegistry, loadMcpServersConfig } from "./mcp/index.js";
import { loadConfigFromDb } from "./services/ai-config.js";

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
 * Config is loaded from the database. If the DB has no AI config yet
 * (fresh install), empty config is used — users configure via admin UI or CLI.
 */
export async function initializeAI(): Promise<void> {
  // Load config from DB (the only runtime source of truth)
  try {
    const loaded = await loadConfigFromDb();
    if (loaded) {
      logger.info("AI configuration loaded from database");
    } else {
      logger.info(
        "No AI configuration in database yet — configure via admin UI or CLI",
      );
      setInlineConfig({
        providers: { providers: {} },
        models: { models: {} },
        selection: { active: {} },
      });
    }
  } catch (error) {
    logger.warn({ error }, "Could not load AI config from database");
    setInlineConfig({
      providers: { providers: {} },
      models: { models: {} },
      selection: { active: {} },
    });
  }

  // Initialize AI package with inline config already in caches
  initAI({
    providers: loadProvidersConfiguration(),
    models: loadModelsConfiguration(),
    selection: loadSelectionConfiguration(),
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
