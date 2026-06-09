/**
 * Configuration state: config path, caches, and file loaders/savers for
 * providers.json, models.json, and selection.json.
 *
 * The save functions support file-based deployments (standalone reuse of
 * this package without a database); Eclaire's backend persists config in
 * the DB instead and does not use them.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { createLazyLogger, getErrorMessage } from "../logger.js";
import type {
  ModelsConfiguration,
  ProviderConfig,
  ProvidersConfiguration,
  SelectionConfiguration,
} from "../types.js";

const getLogger = createLazyLogger("ai-config");

// =============================================================================
// CONFIG PATH (set via initAI)
// =============================================================================

let _configPath: string | null = null;

/**
 * Set the config path (called by initAI)
 * @internal
 */
export function setConfigPath(configPath: string): void {
  _configPath = configPath;
}

/**
 * Get the configured config path
 * @throws Error if not initialized
 */
export function getConfigPath(): string {
  if (!_configPath) {
    throw new Error(
      "AI config path not initialized. Call initAI() before using AI functions.",
    );
  }
  return _configPath;
}

/**
 * Clear the config path (called by resetAI)
 * @internal
 */
export function clearConfigPath(): void {
  _configPath = null;
}

// =============================================================================
// CONFIGURATION CACHES
// =============================================================================

let providersConfigCache: ProvidersConfiguration | null = null;
let modelsConfigCache: ModelsConfiguration | null = null;
let selectionConfigCache: SelectionConfiguration | null = null;

/**
 * Clear all configuration caches (useful for testing or hot-reloading)
 */
export function clearConfigCaches(): void {
  providersConfigCache = null;
  modelsConfigCache = null;
  selectionConfigCache = null;
  getLogger().debug({}, "Configuration caches cleared");
}

/**
 * Seed the configuration caches from objects (no filesystem needed).
 * Used by initAI() when inline config is provided instead of configPath.
 * @internal
 */
export function setInlineConfig(config: {
  providers: ProvidersConfiguration;
  models: ModelsConfiguration;
  selection: SelectionConfiguration;
}): void {
  providersConfigCache = config.providers;
  modelsConfigCache = config.models;
  selectionConfigCache = config.selection;
}

// =============================================================================
// PROVIDERS CONFIGURATION
// =============================================================================

/**
 * Load providers configuration from config/ai/providers.json
 */
export function loadProvidersConfiguration(): ProvidersConfiguration {
  if (providersConfigCache) {
    return providersConfigCache;
  }

  const logger = getLogger();

  try {
    const configDir = getConfigPath();
    const configPath = path.join(configDir, "providers.json");
    logger.debug({ configPath }, "Loading providers configuration");

    const configContent = fs.readFileSync(configPath, "utf-8");
    const rawConfig = JSON.parse(configContent) as ProvidersConfiguration;

    if (!rawConfig.providers || Object.keys(rawConfig.providers).length === 0) {
      throw new Error("Invalid providers configuration: no providers defined");
    }

    // Normalize providers
    const providers: Record<string, ProviderConfig> = {};
    for (const [id, provider] of Object.entries(rawConfig.providers)) {
      // Normalize URL (remove trailing slashes)
      if (provider.baseUrl) {
        provider.baseUrl = provider.baseUrl.replace(/\/+$/, "");
      }
      providers[id] = provider;
    }

    providersConfigCache = { providers };
    logger.info(
      { providersCount: Object.keys(providers).length },
      "Providers configuration loaded successfully",
    );

    return providersConfigCache;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    const isFileNotFound = errorMessage.includes("ENOENT");
    logger.error(
      { error: errorMessage },
      isFileNotFound
        ? "Failed to load providers configuration. Copy config/ai/providers.json.example to config/ai/providers.json"
        : "Failed to load providers configuration",
    );
    throw error;
  }
}

// =============================================================================
// MODELS CONFIGURATION
// =============================================================================

/**
 * Load models configuration from config/ai/models.json
 */
export function loadModelsConfiguration(): ModelsConfiguration {
  if (modelsConfigCache) {
    return modelsConfigCache;
  }

  const logger = getLogger();

  try {
    const configDir = getConfigPath();
    const configPath = path.join(configDir, "models.json");
    logger.debug({ configPath }, "Loading models configuration");

    const configContent = fs.readFileSync(configPath, "utf-8");
    const modelsConfig = JSON.parse(configContent) as ModelsConfiguration;

    if (!modelsConfig.models || Object.keys(modelsConfig.models).length === 0) {
      throw new Error("Invalid models configuration: no models defined");
    }

    modelsConfigCache = modelsConfig;
    logger.info(
      {
        modelsCount: Object.keys(modelsConfig.models).length,
        modelsList: Object.keys(modelsConfig.models),
      },
      "Models configuration loaded successfully",
    );

    return modelsConfigCache;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    const isFileNotFound = errorMessage.includes("ENOENT");
    logger.error(
      { error: errorMessage },
      isFileNotFound
        ? "Failed to load models configuration. Run 'pnpm setup:dev' to create config/ai/models.json"
        : "Failed to load models configuration",
    );
    throw error;
  }
}

// =============================================================================
// SELECTION CONFIGURATION
// =============================================================================

/**
 * Load selection configuration from config/ai/selection.json
 */
export function loadSelectionConfiguration(): SelectionConfiguration {
  if (selectionConfigCache) {
    return selectionConfigCache;
  }

  const logger = getLogger();

  try {
    const configDir = getConfigPath();
    const configPath = path.join(configDir, "selection.json");
    logger.debug({ configPath }, "Loading selection configuration");

    const configContent = fs.readFileSync(configPath, "utf-8");
    const selectionConfig = JSON.parse(configContent) as SelectionConfiguration;

    if (!selectionConfig.active) {
      throw new Error(
        "Invalid selection configuration: no active models defined",
      );
    }

    selectionConfigCache = selectionConfig;
    logger.info(
      { active: selectionConfig.active },
      "Selection configuration loaded successfully",
    );

    return selectionConfigCache;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    const isFileNotFound = errorMessage.includes("ENOENT");
    logger.error(
      { error: errorMessage },
      isFileNotFound
        ? "Failed to load selection configuration. Run 'pnpm setup:dev' to create config/ai/selection.json"
        : "Failed to load selection configuration",
    );
    throw error;
  }
}

// =============================================================================
// CONFIGURATION WRITE OPERATIONS (file-based deployments)
// =============================================================================

/**
 * Get path to a specific config file
 */
function getConfigFilePath(filename: string): string {
  const configDir = getConfigPath();
  return path.join(configDir, filename);
}

/**
 * Generic helper to save a JSON config file with logging and caching.
 */
function saveConfigFile<T>(
  filename: string,
  config: T,
  setCache: (c: T) => void,
  label: string,
): void {
  const logger = getLogger();
  try {
    const configPath = getConfigFilePath(filename);
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    setCache(config);
    logger.info({ configPath }, `${label} saved`);
  } catch (error) {
    logger.error({ error: getErrorMessage(error) }, `Failed to save ${label}`);
    throw error;
  }
}

export function saveProvidersConfiguration(
  config: ProvidersConfiguration,
): void {
  saveConfigFile(
    "providers.json",
    config,
    (c) => {
      providersConfigCache = c;
    },
    "Providers configuration",
  );
}

export function saveModelsConfiguration(config: ModelsConfiguration): void {
  saveConfigFile(
    "models.json",
    config,
    (c) => {
      modelsConfigCache = c;
    },
    "Models configuration",
  );
}

export function saveSelectionConfiguration(
  config: SelectionConfiguration,
): void {
  saveConfigFile(
    "selection.json",
    config,
    (c) => {
      selectionConfigCache = c;
    },
    "Selection configuration",
  );
}
