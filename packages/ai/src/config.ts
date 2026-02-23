/**
 * AI Configuration Loading
 *
 * Handles loading and caching of AI configuration files:
 * - providers.json: Provider connection settings
 * - models.json: Model definitions and capabilities
 * - selection.json: Active model selection per context
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createAILogger } from "./logger.js";
import type {
  AIContext,
  Dialect,
  EngineConfig,
  InputModality,
  ModelCapabilities,
  ModelConfig,
  ModelsConfiguration,
  ProviderAuth,
  ProviderConfig,
  ProvidersConfiguration,
  ResolvedProvider,
  SelectionConfiguration,
  ValidatedAIConfig,
} from "./types.js";

// =============================================================================
// ENVIRONMENT VARIABLE INTERPOLATION
// =============================================================================

/**
 * Default endpoint paths for each dialect.
 * These are appended to the baseUrl if not overridden.
 */
const DIALECT_ENDPOINTS: Record<Dialect, string> = {
  openai_compatible: "/chat/completions",
  mlx_native: "/responses",
  anthropic_messages: "/v1/messages",
};

/**
 * Interpolate environment variables in a string.
 * Supports ${ENV:VAR_NAME} syntax.
 *
 * @param value - String potentially containing ${ENV:VAR} placeholders
 * @param throwOnMissing - If true, throw error when env var is not set (default: true)
 * @returns The string with environment variables replaced
 *
 * @example
 * interpolateEnvVars("Bearer ${ENV:API_KEY}") // "Bearer sk-..."
 * interpolateEnvVars("${ENV:MISSING}", false) // "${ENV:MISSING}" (unchanged)
 */
export function interpolateEnvVars(
  value: string,
  throwOnMissing = true,
): string {
  return value.replace(/\$\{ENV:([^}]+)\}/g, (match, varName) => {
    const envValue = process.env[varName];
    if (envValue === undefined) {
      if (throwOnMissing) {
        throw new Error(
          `Environment variable ${varName} is not set. ` +
            `Set it in your .env file or environment before starting the server.`,
        );
      }
      return match; // Return unchanged if not throwing
    }
    return envValue;
  });
}

/**
 * Check if a string contains environment variable references
 */
export function hasEnvVarReference(value: string): boolean {
  return /\$\{ENV:[^}]+\}/.test(value);
}

/**
 * Interpolate environment variables in provider auth
 */
function interpolateAuth(auth: ProviderAuth): ProviderAuth {
  if (auth.type === "none") {
    return auth;
  }

  return {
    ...auth,
    value: auth.value ? interpolateEnvVars(auth.value) : undefined,
  };
}

/**
 * Interpolate environment variables in headers
 */
function interpolateHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) return undefined;

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = interpolateEnvVars(value);
  }
  return result;
}

/**
 * Get the endpoint path for a dialect
 */
export function getDialectEndpoint(
  dialect: Dialect,
  overridePath?: string,
): string {
  return overridePath ?? DIALECT_ENDPOINTS[dialect];
}

// Lazy-initialized logger
let _logger: ReturnType<typeof createAILogger> | null = null;
function getLogger() {
  if (!_logger) {
    _logger = createAILogger("ai-config");
  }
  return _logger;
}

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
  _logger = null; // Also clear logger cache
  getLogger().debug({}, "Configuration caches cleared");
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
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
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
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
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
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
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
// CONFIG ACCESSORS
// =============================================================================

/**
 * Get the active model ID for a given context
 */
export function getActiveModelIdForContext(context: AIContext): string | null {
  const logger = getLogger();
  try {
    const selection = loadSelectionConfiguration();
    return selection.active[context] || null;
  } catch (error) {
    logger.warn(
      {
        context,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to get active model ID for context",
    );
    return null;
  }
}

/**
 * Get the active model configuration for a given context
 */
export function getActiveModelForContext(
  context: AIContext,
): ModelConfig | null {
  const logger = getLogger();
  try {
    const modelId = getActiveModelIdForContext(context);
    if (!modelId) {
      logger.warn({ context }, "No active model defined for context");
      return null;
    }

    const modelsConfig = loadModelsConfiguration();
    const model = modelsConfig.models[modelId];

    if (!model) {
      logger.warn(
        { context, modelId },
        "Active model ID not found in models list",
      );
      return null;
    }

    return model;
  } catch (error) {
    logger.warn(
      {
        context,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to get active model for context",
    );
    return null;
  }
}

/**
 * Get model configuration by model ID
 */
export function getModelConfigById(modelId: string): ModelConfig | null {
  const logger = getLogger();
  try {
    const modelsConfig = loadModelsConfiguration();
    return modelsConfig.models[modelId] || null;
  } catch (error) {
    logger.warn(
      {
        modelId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to get model config by ID",
    );
    return null;
  }
}

/**
 * Get provider configuration by provider ID
 */
export function getProviderConfig(providerId: string): ProviderConfig | null {
  const logger = getLogger();
  try {
    const providersConfig = loadProvidersConfiguration();
    return providersConfig.providers[providerId] || null;
  } catch (error) {
    logger.warn(
      {
        providerId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to get provider config",
    );
    return null;
  }
}

// =============================================================================
// MODEL ID HELPERS
// =============================================================================

/**
 * Parse a model ID in "provider:model" format
 * @example parseModelId("local-llama:qwen3-14b-q4") => { provider: "local-llama", model: "qwen3-14b-q4" }
 */
export function parseModelId(id: string): { provider: string; model: string } {
  const colonIndex = id.indexOf(":");
  if (colonIndex === -1) {
    throw new Error(
      `Invalid model ID format: "${id}". Expected "provider:model"`,
    );
  }
  return {
    provider: id.slice(0, colonIndex),
    model: id.slice(colonIndex + 1),
  };
}

/**
 * Check if a string is a valid model ID format (provider:model)
 */
export function isValidModelIdFormat(id: string): boolean {
  if (!id || typeof id !== "string") return false;
  const colonIndex = id.indexOf(":");
  return colonIndex > 0 && colonIndex < id.length - 1;
}

/**
 * Create a model ID from provider and model parts
 * @example createModelId("local-llama", "qwen3-14b-q4") => "local-llama:qwen3-14b-q4"
 */
export function createModelId(provider: string, model: string): string {
  if (!provider || !model) {
    throw new Error("Provider and model are required to create a model ID");
  }
  return `${provider}:${model}`;
}

// =============================================================================
// MODALITY HELPERS (Generic)
// =============================================================================

/**
 * Check if a model supports a specific input modality.
 * This is the generic helper - use this to build app-specific suitability checks.
 */
export function hasInputModality(
  model: ModelConfig,
  modality: InputModality,
): boolean {
  return model.capabilities.modalities.input.includes(modality);
}

/**
 * Check if a model supports all specified input modalities.
 */
export function hasAllInputModalities(
  model: ModelConfig,
  modalities: InputModality[],
): boolean {
  return modalities.every((m) =>
    model.capabilities.modalities.input.includes(m),
  );
}

// =============================================================================
// CONTEXT SUITABILITY
// =============================================================================
// NOTE: Suitability logic has been moved to the application layer.
// The CLI (tools/model-cli) and backend (apps/backend) define their own
// suitability rules based on the generic modality helpers below.

// =============================================================================
// REASONING HELPERS
// =============================================================================

/**
 * Get the appropriate system prompt prefix for reasoning/thinking control
 */
export function getThinkingPromptPrefix(
  modelId: string,
  enableThinking?: boolean,
): string {
  const logger = getLogger();
  const modelConfig = getModelConfigById(modelId);
  if (!modelConfig) {
    return "";
  }

  const reasoning = modelConfig.capabilities.reasoning;
  if (!reasoning || reasoning.supported === false) {
    return "";
  }

  logger.debug(
    { modelId, enableThinking, mode: reasoning.mode },
    "Determining thinking prompt prefix",
  );

  switch (reasoning.mode) {
    case "never":
    case "always":
      return "";

    case "prompt-controlled": {
      // Default to disabling thinking if not specified (opt-in behavior)
      const shouldEnableThinking = enableThinking === true;

      if (shouldEnableThinking) {
        // User wants thinking enabled - no prefix needed (it's the default)
        logger.debug({ modelId }, "Thinking enabled, no prefix needed");
        return "";
      } else {
        // User wants thinking disabled - use disablePrefix
        const prefix = reasoning.disablePrefix || "";
        logger.debug({ modelId, prefix }, "Using thinking OFF prefix");
        return prefix;
      }
    }

    default:
      logger.warn({ modelId, mode: reasoning.mode }, "Unknown reasoning mode");
      return "";
  }
}

/**
 * Get the current active model configuration without sensitive fields
 */
export function getCurrentModelConfig(context: AIContext = "backend"): {
  id: string;
  name: string;
  provider: string;
  providerModel: string;
  capabilities: ModelCapabilities;
} | null {
  const logger = getLogger();
  try {
    const modelId = getActiveModelIdForContext(context);
    if (!modelId) {
      logger.warn({ context }, "No active model defined for context");
      return null;
    }

    const modelConfig = getModelConfigById(modelId);
    if (!modelConfig) {
      logger.warn({ context, modelId }, "Model configuration not found");
      return null;
    }

    // Return config without sensitive provider details
    return {
      id: modelId,
      name: modelConfig.name,
      provider: modelConfig.provider,
      providerModel: modelConfig.providerModel,
      capabilities: modelConfig.capabilities,
    };
  } catch (error) {
    logger.error(
      {
        context,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to get current model configuration",
    );
    return null;
  }
}

// =============================================================================
// PROVIDER RESOLUTION
// =============================================================================

/**
 * Resolve full provider configuration for a model.
 * Interpolates environment variables and derives endpoint from dialect.
 */
export function resolveProviderForModel(
  modelId: string,
  modelConfig: ModelConfig,
): { providerConfig: ProviderConfig; url: string } {
  const rawProviderConfig = getProviderConfig(modelConfig.provider);
  if (!rawProviderConfig) {
    throw new Error(
      `Provider '${modelConfig.provider}' not found in providers.json for model '${modelId}'`,
    );
  }

  // Interpolate environment variables in auth, headers, and baseUrl
  const providerConfig: ProviderConfig = {
    ...rawProviderConfig,
    baseUrl: interpolateEnvVars(rawProviderConfig.baseUrl, false),
    auth: interpolateAuth(rawProviderConfig.auth),
    headers: interpolateHeaders(rawProviderConfig.headers),
  };

  // Validate that baseUrl doesn't have unresolved env vars
  if (providerConfig.baseUrl.includes("${ENV:")) {
    const unresolvedVars = providerConfig.baseUrl.match(/\$\{ENV:([^}]+)\}/g);
    throw new Error(
      `Provider '${modelConfig.provider}' has unresolved env vars in baseUrl: ${unresolvedVars?.join(", ")}. ` +
        `Set these in .env or configure the provider in providers.json.`,
    );
  }

  // Derive endpoint from dialect (or use override)
  const endpoint = getDialectEndpoint(
    providerConfig.dialect,
    providerConfig.overrides?.chatPath,
  );

  // Build the full URL from provider config
  const url = `${providerConfig.baseUrl}${endpoint}`;

  return { providerConfig, url };
}

/**
 * Extract the API key/token from the interpolated auth value.
 * For bearer auth, extracts the token after "Bearer ".
 * For header auth, returns the raw value.
 */
function extractApiKeyFromAuth(auth: ProviderAuth): string | undefined {
  if (auth.type === "none" || !auth.value) {
    return undefined;
  }

  // For bearer auth, extract token after "Bearer "
  if (auth.type === "bearer" && auth.value.startsWith("Bearer ")) {
    return auth.value.slice(7); // Remove "Bearer " prefix
  }

  // For header auth, return the raw value
  return auth.value;
}

/**
 * Validates that required configuration exists and returns resolved provider info
 */
export function validateAIConfig(context: AIContext): ValidatedAIConfig {
  const logger = getLogger();

  // Get active model from selection config
  const modelId = getActiveModelIdForContext(context);
  if (!modelId) {
    throw new Error(
      `No active model defined for ${context} context in selection.json. Please configure active.${context}.`,
    );
  }

  const modelConfig = getModelConfigById(modelId);
  if (!modelConfig) {
    throw new Error(
      `Model '${modelId}' not found in models.json. Check your configuration.`,
    );
  }

  // NOTE: Suitability validation has been moved to the application layer.
  // The CLI and backend define their own context-specific suitability rules.

  const { providerConfig, url } = resolveProviderForModel(modelId, modelConfig);
  const apiKey = extractApiKeyFromAuth(providerConfig.auth);

  logger.info(
    {
      context,
      modelId,
      provider: modelConfig.provider,
      url,
      hasApiKey: !!apiKey,
    },
    "AI configuration validated",
  );

  return {
    provider: {
      name: modelConfig.provider,
      baseURL: providerConfig.baseUrl,
      model: modelConfig.providerModel,
      apiKey,
    },
    providerConfig,
    modelId,
    modelConfig,
  };
}

/**
 * Get resolved AI provider info for a context
 * @deprecated Use validateAIConfig instead for full info
 */
export function getAIProviderInfo(context: AIContext): ResolvedProvider {
  const { provider } = validateAIConfig(context);
  return provider;
}

/**
 * Validate AI configuration on startup (call from main entry points)
 */
export function validateAIConfigOnStartup(): void {
  const logger = getLogger();
  try {
    // Load all configs to validate them
    loadProvidersConfiguration();
    loadModelsConfiguration();
    loadSelectionConfiguration();

    // Validate that active models exist and are properly configured
    const selection = loadSelectionConfiguration();

    // Iterate over all contexts defined in selection (generic, not hardcoded)
    for (const [context, modelId] of Object.entries(selection.active)) {
      if (modelId) {
        try {
          validateAIConfig(context);
        } catch (error) {
          logger.warn(
            {
              context,
              modelId,
              error: error instanceof Error ? error.message : "Unknown",
            },
            `AI config warning for ${context} context`,
          );
        }
      }
    }

    logger.info({}, "AI configuration validated on startup");
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "AI configuration validation failed on startup",
    );
    throw error;
  }
}

// =============================================================================
// CONFIGURATION WRITE OPERATIONS
// =============================================================================

/**
 * Get path to a specific config file
 */
function getConfigFilePath(filename: string): string {
  const configDir = getConfigPath();
  return path.join(configDir, filename);
}

/**
 * Save providers configuration to config/ai/providers.json
 */
export function saveProvidersConfiguration(
  config: ProvidersConfiguration,
): void {
  const logger = getLogger();
  try {
    const configPath = getConfigFilePath("providers.json");
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    providersConfigCache = config;
    logger.info({ configPath }, "Providers configuration saved");
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Failed to save providers configuration",
    );
    throw error;
  }
}

/**
 * Save models configuration to config/ai/models.json
 */
export function saveModelsConfiguration(config: ModelsConfiguration): void {
  const logger = getLogger();
  try {
    const configPath = getConfigFilePath("models.json");
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    modelsConfigCache = config;
    logger.info({ configPath }, "Models configuration saved");
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Failed to save models configuration",
    );
    throw error;
  }
}

/**
 * Save selection configuration to config/ai/selection.json
 */
export function saveSelectionConfiguration(
  config: SelectionConfiguration,
): void {
  const logger = getLogger();
  try {
    const configPath = getConfigFilePath("selection.json");
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    selectionConfigCache = config;
    logger.info({ configPath }, "Selection configuration saved");
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Failed to save selection configuration",
    );
    throw error;
  }
}

// =============================================================================
// MODEL CRUD OPERATIONS
// =============================================================================

/**
 * Add a new model to the configuration
 */
export function addModel(id: string, model: ModelConfig): void {
  const logger = getLogger();
  const config = loadModelsConfiguration();

  if (config.models[id]) {
    throw new Error(`Model with ID '${id}' already exists`);
  }

  config.models[id] = model;
  saveModelsConfiguration(config);
  logger.info({ modelId: id }, "Model added");
}

/**
 * Update an existing model
 */
export function updateModel(id: string, updates: Partial<ModelConfig>): void {
  const logger = getLogger();
  const config = loadModelsConfiguration();

  if (!config.models[id]) {
    throw new Error(`Model with ID '${id}' not found`);
  }

  config.models[id] = { ...config.models[id], ...updates };
  saveModelsConfiguration(config);
  logger.info({ modelId: id }, "Model updated");
}

/**
 * Remove a model from the configuration
 */
export function removeModel(id: string): void {
  const logger = getLogger();
  const config = loadModelsConfiguration();

  if (!config.models[id]) {
    throw new Error(`Model with ID '${id}' not found`);
  }

  delete config.models[id];
  saveModelsConfiguration(config);

  // Also remove from selection if active
  const selection = loadSelectionConfiguration();
  let selectionChanged = false;

  if (selection.active.backend === id) {
    delete selection.active.backend;
    selectionChanged = true;
  }
  if (selection.active.workers === id) {
    delete selection.active.workers;
    selectionChanged = true;
  }

  if (selectionChanged) {
    saveSelectionConfiguration(selection);
  }

  logger.info({ modelId: id }, "Model removed");
}

// =============================================================================
// SELECTION MANAGEMENT
// =============================================================================

/**
 * Set active model for a context.
 * NOTE: Suitability validation should be done by the caller (CLI/backend).
 */
export function setActiveModel(context: AIContext, modelId: string): void {
  const logger = getLogger();
  const modelsConfig = loadModelsConfiguration();
  const model = modelsConfig.models[modelId];

  if (!model) {
    throw new Error(`Model with ID '${modelId}' not found`);
  }

  // NOTE: Suitability check removed - applications are responsible for
  // validating model suitability before calling this function.

  const selection = loadSelectionConfiguration();
  selection.active[context] = modelId;
  saveSelectionConfiguration(selection);
  logger.info({ context, modelId }, "Active model set");
}

/**
 * Remove active model for a context
 */
export function removeActiveModel(context: AIContext): void {
  const logger = getLogger();
  const selection = loadSelectionConfiguration();
  delete selection.active[context];
  saveSelectionConfiguration(selection);
  logger.info({ context }, "Active model removed");
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get all providers
 */
export function getProviders(): Record<string, ProviderConfig> {
  const config = loadProvidersConfiguration();
  return config.providers;
}

/**
 * Get all models with optional filtering.
 * NOTE: Context-based filtering has been removed - suitability is now app-specific.
 * Use hasInputModality/hasAllInputModalities to implement app-specific filtering.
 */
export function getModels(filter?: {
  provider?: string;
}): Array<{ id: string; model: ModelConfig }> {
  const config = loadModelsConfiguration();
  let models = Object.entries(config.models).map(([id, model]) => ({
    id,
    model,
  }));

  if (filter) {
    if (filter.provider) {
      models = models.filter(({ model }) => model.provider === filter.provider);
    }
  }

  return models;
}

/**
 * Get active models as objects with their full model data.
 * Returns a record keyed by context name.
 */
export function getActiveModelsAsObjects(): Record<
  string,
  { id: string; model: ModelConfig }
> {
  const result: Record<string, { id: string; model: ModelConfig }> = {};
  const selection = loadSelectionConfiguration();

  for (const [context, modelId] of Object.entries(selection.active)) {
    if (modelId) {
      const model = getModelConfigById(modelId);
      if (model) {
        result[context] = { id: modelId, model };
      }
    }
  }

  return result;
}

// =============================================================================
// ENGINE HELPERS
// =============================================================================

/**
 * Check if a provider has an engine configuration (is a local provider)
 */
export function hasEngine(provider: ProviderConfig): boolean {
  return provider.engine !== undefined;
}

/**
 * Check if a provider's engine is managed (we start/stop it)
 */
export function isManaged(provider: ProviderConfig): boolean {
  return provider.engine?.managed === true;
}

/**
 * Parse port from a base URL
 * @example parsePort("http://127.0.0.1:11434") => 11434
 * @example parsePort("https://api.openai.com") => 443
 */
export function parsePort(baseUrl: string): number {
  try {
    const url = new URL(baseUrl);
    if (url.port) {
      return parseInt(url.port, 10);
    }
    // Default ports based on protocol
    return url.protocol === "https:" ? 443 : 80;
  } catch {
    throw new Error(`Invalid URL: ${baseUrl}`);
  }
}

/**
 * Get list of managed provider IDs (providers we can start/stop)
 */
export function getManagedProviders(): string[] {
  const config = loadProvidersConfiguration();
  return Object.entries(config.providers)
    .filter(([_, provider]) => isManaged(provider))
    .map(([id]) => id);
}

/**
 * Get list of providers with engine configuration (local providers)
 */
export function getLocalProviders(): string[] {
  const config = loadProvidersConfiguration();
  return Object.entries(config.providers)
    .filter(([_, provider]) => hasEngine(provider))
    .map(([id]) => id);
}

/**
 * Get engine configuration for a provider
 * Returns null if provider doesn't have engine config
 */
export function getEngineConfig(providerId: string): EngineConfig | null {
  const provider = getProviderConfig(providerId);
  return provider?.engine ?? null;
}
