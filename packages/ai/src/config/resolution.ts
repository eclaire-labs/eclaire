/**
 * Provider resolution and configuration validation: resolve a model's
 * provider (with env interpolation and endpoint derivation) and validate
 * the configuration at startup or per request.
 */

import { createLazyLogger, getErrorMessage } from "../logger.js";
import type {
  AIContext,
  ModelConfig,
  ProviderAuth,
  ProviderConfig,
  ValidatedAIConfig,
} from "../types.js";
import {
  getActiveModelIdForContext,
  getModelConfigById,
  getProviderConfig,
  isValidModelIdFormat,
} from "./accessors.js";
import {
  getDialectEndpoint,
  interpolateAuth,
  interpolateEnvVars,
  interpolateHeaders,
} from "./interpolation.js";
import {
  loadModelsConfiguration,
  loadProvidersConfiguration,
  loadSelectionConfiguration,
} from "./store.js";

const getLogger = createLazyLogger("ai-config");

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

  // CLI providers don't use baseUrl — skip URL validation
  if (providerConfig.dialect === "cli_jsonl") {
    return { providerConfig, url: "" };
  }

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
 * Resolve and validate a model's provider, returning the full config.
 * Shared by validateAIConfig and validateAIConfigForModelId.
 */
function buildValidatedConfig(modelId: string): ValidatedAIConfig & {
  url: string;
} {
  const modelConfig = getModelConfigById(modelId);
  if (!modelConfig) {
    throw new Error(
      `Model '${modelId}' not found in models.json. Check your configuration.`,
    );
  }

  const { providerConfig, url } = resolveProviderForModel(modelId, modelConfig);
  const apiKey = extractApiKeyFromAuth(providerConfig.auth);

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
    url,
  };
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

  const { url, ...validated } = buildValidatedConfig(modelId);

  logger.info(
    {
      context,
      modelId,
      provider: validated.modelConfig.provider,
      url,
      hasApiKey: !!validated.provider.apiKey,
    },
    "AI configuration validated",
  );

  return validated;
}

/**
 * Validates configuration for a specific model ID (bypasses selection.json).
 * Used for per-agent model overrides.
 */
export function validateAIConfigForModelId(modelId: string): ValidatedAIConfig {
  const logger = getLogger();

  if (!isValidModelIdFormat(modelId)) {
    throw new Error(
      `Invalid model ID format: "${modelId}". Expected "provider:model"`,
    );
  }

  const { url, ...validated } = buildValidatedConfig(modelId);

  logger.info(
    {
      modelId,
      provider: validated.modelConfig.provider,
      url,
      hasApiKey: !!validated.provider.apiKey,
    },
    "AI configuration validated for model override",
  );

  return validated;
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
              error: getErrorMessage(error),
            },
            `AI config warning for ${context} context`,
          );
        }
      }
    }

    logger.info({}, "AI configuration validated on startup");
  } catch (error) {
    logger.error(
      { error: getErrorMessage(error) },
      "AI configuration validation failed on startup",
    );
    throw error;
  }
}
