/**
 * Read accessors over the loaded AI configuration: active models,
 * model/provider lookups, modality and reasoning helpers.
 */

import { createLazyLogger, getErrorMessage } from "../logger.js";
import type {
  AgentRuntimeKind,
  AIContext,
  EngineConfig,
  InputModality,
  ModelCapabilities,
  ModelConfig,
  ProviderConfig,
} from "../types.js";
import {
  loadModelsConfiguration,
  loadProvidersConfiguration,
  loadSelectionConfiguration,
} from "./store.js";

const getLogger = createLazyLogger("ai-config");

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
        error: getErrorMessage(error),
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
        error: getErrorMessage(error),
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
        error: getErrorMessage(error),
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
        error: getErrorMessage(error),
      },
      "Failed to get provider config",
    );
    return null;
  }
}

// =============================================================================
// RUNTIME KIND
// =============================================================================

/**
 * Determine the agent runtime kind from a provider configuration.
 * CLI providers (with a `cli` field) are external harnesses; all others are native.
 */
export function getAgentRuntimeKind(
  providerConfig: ProviderConfig,
): AgentRuntimeKind {
  return providerConfig.cli ? "external_harness" : "native";
}

/**
 * Determine the agent runtime kind for a given model ID.
 * Returns "native" if the model or provider cannot be resolved.
 */
export function getAgentRuntimeKindForModel(modelId: string): AgentRuntimeKind {
  const modelConfig = getModelConfigById(modelId);
  if (!modelConfig) return "native";
  const providerConfig = getProviderConfig(modelConfig.provider);
  if (!providerConfig) return "native";
  return getAgentRuntimeKind(providerConfig);
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
// NOTE: Suitability logic lives in the application layer. The CLI and backend
// define their own suitability rules based on these generic modality helpers.

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

    case "provider-controlled":
      // Provider-controlled models use API parameters (e.g., enable_thinking),
      // not prompt prefixes.
      return "";

    default:
      logger.warn({ modelId, mode: reasoning.mode }, "Unknown reasoning mode");
      return "";
  }
}

/**
 * Get the current active model configuration without sensitive fields
 */
export function getCurrentModelConfig(context: AIContext): {
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
        error: getErrorMessage(error),
      },
      "Failed to get current model configuration",
    );
    return null;
  }
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
