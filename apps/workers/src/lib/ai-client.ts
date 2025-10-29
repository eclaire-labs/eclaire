import * as fs from "fs";
import * as path from "path";
import { file as tmpFile } from "tmp-promise";
import {
  aiPromptLogger,
  type TraceAICall,
  type TraceContext,
} from "./ai-prompt-logger";
import { createChildLogger } from "./logger";

const logger = createChildLogger("ai-client-workers");

// Model configuration interfaces
export interface ModelThinkingCapability {
  mode: "never" | "always_on" | "choosable";
  control?: {
    type: "prompt_prefix";
    on: string;
    off: string;
  };
}

export interface ModelCapabilities {
  stream: boolean;
  thinking: ModelThinkingCapability;
}

export interface ModelConfig {
  id: string;
  provider: string;
  modelShortName: string;
  modelFullName: string;
  modelUrl: string;
  providerUrl: string;
  apiKey: string | null;
  capabilities: ModelCapabilities;
  description: string;
}

export interface ModelsConfiguration {
  activeModels: {
    backend?: string;
    workers?: string;
  };
  models: ModelConfig[];
}

// Global cache for model configuration
let modelsConfigCache: ModelsConfiguration | null = null;

/**
 * Interpolate environment variables in a string
 * Replaces ${VAR_NAME} with the actual environment variable value
 */
function interpolateEnvVars(str: string): string {
  return str.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    const value = process.env[varName];
    if (value === undefined) {
      logger.warn(
        { varName, match },
        "Environment variable not found for interpolation",
      );
      return match; // Return original if env var not found
    }
    return value;
  });
}

/**
 * Recursively interpolate environment variables in an object
 */
function interpolateConfigObject(obj: any): any {
  if (typeof obj === "string") {
    return interpolateEnvVars(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => interpolateConfigObject(item));
  }
  if (obj && typeof obj === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = interpolateConfigObject(value);
    }
    return result;
  }
  return obj;
}

/**
 * Load model configuration from models.json
 */
function loadModelConfiguration(): ModelsConfiguration {
  if (modelsConfigCache) {
    return modelsConfigCache;
  }

  try {
    const configDir = process.env.CONFIG_DIR;
    if (!configDir) {
      throw new Error(
        "CONFIG_DIR environment variable not set. Please set CONFIG_DIR in your environment file.",
      );
    }

    const configPath = path.join(configDir, "models.json");
    logger.debug({ configPath }, "Loading worker model configuration");

    const configContent = fs.readFileSync(configPath, "utf-8");

    const rawConfig = JSON.parse(configContent) as ModelsConfiguration;

    // Interpolate environment variables in the configuration
    const config = interpolateConfigObject(rawConfig) as ModelsConfiguration;

    // Validate configuration structure
    if (
      !config.models ||
      !Array.isArray(config.models) ||
      config.models.length === 0
    ) {
      throw new Error("Invalid worker models configuration: no models defined");
    }

    modelsConfigCache = config;
    logger.info(
      {
        modelsCount: config.models.length,
        modelsList: config.models.map(
          (m) => `${m.provider}:${m.modelShortName}`,
        ),
      },
      "Worker model configuration loaded successfully",
    );

    return config;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Failed to load worker model configuration, falling back to environment variables",
    );
    throw error;
  }
}

/**
 * Get the active model configuration for workers context
 */
export function getActiveModelForWorkers(): ModelConfig | null {
  try {
    const config = loadModelConfiguration();
    if (!config.activeModels || !config.activeModels.workers) {
      logger.warn("No active model defined for workers context");
      return null;
    }

    const activeModelId = config.activeModels.workers;
    const model = config.models.find((m) => m.id === activeModelId);

    if (!model) {
      logger.warn(
        { activeModelId },
        "Active model ID not found in models list",
      );
      return null;
    }

    return model;
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to get active model for workers",
    );
    return null;
  }
}

/**
 * Get model configuration by provider and model short name
 */
export function getModelConfig(
  provider: string,
  modelShortName: string,
): ModelConfig | null {
  try {
    const config = loadModelConfiguration();
    return (
      config.models.find(
        (m) => m.provider === provider && m.modelShortName === modelShortName,
      ) || null
    );
  } catch (error) {
    logger.warn(
      {
        provider,
        modelShortName,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to get worker model config",
    );
    return null;
  }
}

/**
 * Get thinking capability for a specific model
 */
export function getModelThinkingCapability(
  provider: string,
  modelShortName: string,
): ModelThinkingCapability {
  const modelConfig = getModelConfig(provider, modelShortName);
  return modelConfig?.capabilities.thinking || { mode: "never" };
}

/**
 * Get the current active model configuration without sensitive fields
 */
export function getCurrentModelConfig(): Omit<
  ModelConfig,
  "apiKey" | "providerUrl"
> | null {
  try {
    // Get active model from JSON config instead of env vars
    const activeModel = getActiveModelForWorkers();
    if (!activeModel) {
      logger.warn("No active model defined for workers context");
      return null;
    }

    const modelConfig = getModelConfig(
      activeModel.provider,
      activeModel.modelShortName,
    );
    if (!modelConfig) {
      logger.warn(
        {
          provider: activeModel.provider,
          modelShortName: activeModel.modelShortName,
        },
        "Worker model configuration not found",
      );
      return null;
    }

    // Return config without sensitive fields
    const { apiKey, providerUrl, ...safeConfig } = modelConfig;

    logger.debug(
      {
        provider: safeConfig.provider,
        modelShortName: safeConfig.modelShortName,
      },
      "Retrieved current worker model configuration",
    );

    return safeConfig;
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to get current worker model configuration",
    );
    return null;
  }
}

/**
 * Get the appropriate system prompt prefix for thinking control
 */
export function getThinkingPromptPrefix(
  provider: string,
  modelShortName: string,
  enableThinking?: boolean,
): string {
  const thinkingCapability = getModelThinkingCapability(
    provider,
    modelShortName,
  );

  logger.debug(
    {
      provider,
      modelShortName,
      enableThinking,
      thinkingMode: thinkingCapability.mode,
      hasControl: !!thinkingCapability.control,
    },
    "Determining thinking prompt prefix for worker",
  );

  switch (thinkingCapability.mode) {
    case "never":
      // Model doesn't support thinking - no prefix needed
      return "";

    case "always_on":
      // Model always has thinking enabled - no prefix needed
      return "";

    case "choosable": {
      // Model supports choosing thinking mode
      if (
        !thinkingCapability.control ||
        thinkingCapability.control.type !== "prompt_prefix"
      ) {
        logger.warn(
          { provider, modelShortName, thinkingCapability },
          "Choosable thinking mode but no prompt_prefix control defined",
        );
        return "";
      }

      // Default to disabling thinking if not specified (opt-in behavior)
      const shouldEnableThinking = enableThinking === true;

      if (shouldEnableThinking) {
        // User wants thinking enabled - use "on" prefix (often empty)
        const prefix = thinkingCapability.control.on;
        logger.debug(
          { provider, modelShortName, prefix },
          "Using thinking ON prefix for worker",
        );
        return prefix;
      } else {
        // User wants thinking disabled - use "off" prefix (e.g., "/no_think")
        const prefix = thinkingCapability.control.off;
        logger.debug(
          { provider, modelShortName, prefix },
          "Using thinking OFF prefix for worker",
        );
        return prefix;
      }
    }

    default:
      logger.warn(
        { provider, modelShortName, mode: thinkingCapability.mode },
        "Unknown thinking mode for worker",
      );
      return "";
  }
}

/**
 * Options for the AI API call.
 */
export interface AICallOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  timeout?: number;
  /**
   * An optional JSON schema to enforce a structured JSON output.
   * If provided, the model will be forced to generate a JSON object
   * that conforms to this schema.
   */
  schema?: Record<string, any>;
  /**
   * Enable thinking mode for models that support it
   */
  enableThinking?: boolean;
  /**
   * Metadata for tracing and logging
   */
  traceMetadata?: {
    userId?: string;
    jobId?: string;
    jobType?: string;
    workerType?: string;
  };
}

// Support for vision content types
export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image_url";
  image_url: {
    url: string; // data:image/jpeg;base64,... or http url
  };
}

export type AIMessageContent = string | (TextContent | ImageContent)[];

/**
 * Represents a single message in the AI conversation.
 */
export interface AIMessage {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<{
        type: "text" | "image_url";
        text?: string;
        image_url?: { url: string };
      }>;
}

interface AIProvider {
  name: string;
  baseURL: string;
  model: string;
  apiKey?: string;
}

// Supported AI providers (canonical names with hyphens)
const SUPPORTED_PROVIDERS = [
  "ollama",
  "llamacpp",
  "lm-studio",
  "mlx-vlm",
  "openrouter",
  "proxy",
] as const;
type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

/**
 * Normalize provider name by removing special characters for matching
 * This allows mlx-vlm, mlx_vlm, mlxvlm, llamacpp, llama.cpp, etc. to all work
 */
function normalizeProviderForMatching(provider: string): string {
  return provider.toLowerCase().replace(/[_\-\.]/g, "");
}

/**
 * Find canonical provider name from user input
 * Returns the canonical provider name or null if not found
 */
function getCanonicalProviderName(provider: string): SupportedProvider | null {
  const normalized = normalizeProviderForMatching(provider);

  for (const canonicalProvider of SUPPORTED_PROVIDERS) {
    if (normalizeProviderForMatching(canonicalProvider) === normalized) {
      return canonicalProvider;
    }
  }

  return null;
}

/**
 * Check if provider is mlx-vlm (accepts mlx-vlm, mlx_vlm, mlxvlm, etc.)
 */
function isMLXVLMProvider(provider: string): boolean {
  const canonical = getCanonicalProviderName(provider);
  return canonical === "mlx-vlm";
}

/**
 * Check if provider is lm-studio (accepts lm-studio, lm_studio, lmstudio, etc.)
 */
function isLMStudioProvider(provider: string): boolean {
  const canonical = getCanonicalProviderName(provider);
  return canonical === "lm-studio";
}

/**
 * Validates that required configuration exists and looks up model config
 * Uses JSON config as source of truth for model details
 */
function validateWorkerAIConfig(): AIProvider {
  // Get active model from JSON config
  const activeModel = getActiveModelForWorkers();
  if (!activeModel) {
    throw new Error(
      "No active model defined for workers context in models.json. Please configure activeModel.workers.",
    );
  }

  const inputProviderName = activeModel.provider;
  const modelShortName = activeModel.modelShortName;

  // Normalize provider name and validate it's supported
  const providerName = getCanonicalProviderName(inputProviderName);
  if (!providerName) {
    throw new Error(
      `Unsupported AI provider '${inputProviderName}' for workers. Supported: ${SUPPORTED_PROVIDERS.join(", ")}`,
    );
  }

  // Look up model configuration in JSON config
  const modelConfig = getModelConfig(providerName, modelShortName);
  if (!modelConfig) {
    throw new Error(
      `Worker model configuration not found for provider '${providerName}' and model '${modelShortName}'. Check your models.json configuration.`,
    );
  }

  logger.info(
    {
      provider: providerName,
      modelShortName,
      baseURL: modelConfig.providerUrl,
      hasApiKey: !!modelConfig.apiKey,
      configSource: "activeModel",
    },
    "Worker AI configuration validated from activeModel with JSON config lookup",
  );

  return {
    name: providerName,
    baseURL: modelConfig.providerUrl,
    model: modelConfig.modelFullName,
    apiKey: modelConfig.apiKey || undefined,
  };
}

/**
 * Makes a unified AI API call using the OpenAI-compatible /v1/chat/completions endpoint
 */
export async function callAI(
  messages: AIMessage[],
  options: AICallOptions = {},
): Promise<string> {
  const provider = validateWorkerAIConfig();

  // Generate request ID and timing for tracing
  const requestId = `req_worker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();

  // Apply thinking prefix to system messages if needed
  const processedMessages = messages.map((message) => {
    if (message.role === "system") {
      // Get the active model for thinking prefix
      const activeModel = getActiveModelForWorkers();

      if (activeModel && typeof message.content === "string") {
        const thinkingPrefix = getThinkingPromptPrefix(
          provider.name,
          activeModel.modelShortName,
          options.enableThinking,
        );
        if (thinkingPrefix) {
          logger.debug(
            {
              provider: provider.name,
              modelShortName: activeModel.modelShortName,
              thinkingPrefix,
              enableThinking: options.enableThinking,
            },
            "Applying thinking prefix to system message in worker",
          );
          return {
            ...message,
            content: `${thinkingPrefix} ${message.content}`.trim(),
          };
        }
      }
    }
    return message;
  });

  // Prepare trace context for logging
  const traceContext: TraceContext = {
    aiProvider: provider.name,
    aiBaseURL: provider.baseURL,
    aiModel: provider.model,
    hasApiKey: !!provider.apiKey,
  };

  // Base request body
  const requestBody: any = {
    messages: processedMessages,
    temperature: options.temperature ?? 0.5,
    max_tokens: options.maxTokens ?? 2000,
    stream: options.stream ?? false,
  };

  // LM Studio doesn't require the model field and may fail if it doesn't match
  // exactly what's loaded. Only include model for non-LM Studio providers.
  if (!isLMStudioProvider(provider.name)) {
    requestBody.model = provider.model;
  }

  // If a schema is provided, add the response_format object
  // This is the key change to enable structured output
  if (options.schema) {
    requestBody.response_format = {
      type: "json_schema",
      json_schema: {
        name: "response_schema",
        schema: options.schema,
      },
    };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (provider.apiKey) {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }

  // Determine URL based on provider
  const url =
    provider.name === "proxy"
      ? provider.baseURL
      : isMLXVLMProvider(provider.name)
        ? `${provider.baseURL}/generate`
        : `${provider.baseURL}/v1/chat/completions`;

  const logSafeMessages = processedMessages.map((msg) => {
    if (typeof msg.content === "string") {
      return {
        ...msg,
        content:
          msg.content.length > 200
            ? `${msg.content.substring(0, 200)}...`
            : msg.content,
      };
    } else if (Array.isArray(msg.content)) {
      return {
        ...msg,
        content: msg.content.map((item) => {
          // Added a check for item.image_url to ensure it's not undefined
          if (
            item.type === "image_url" &&
            item.image_url &&
            item.image_url.url.startsWith("data:")
          ) {
            const base64Size = item.image_url.url.length;
            const mimeType =
              item.image_url.url.split(";")[0]?.split(":")[1] || "unknown";
            return {
              ...item,
              image_url: {
                url: `[BASE64_IMAGE: ${mimeType}, ${base64Size} characters]`,
              },
            };
          }
          return item;
        }),
      };
    }
    return msg;
  });

  logger.info(
    {
      provider: provider.name,
      url,
      model: provider.model,
      messagesCount: processedMessages.length,
      requestBody: { ...requestBody, messages: logSafeMessages },
      isProxy: provider.name === "proxy",
    },
    "Making AI API call from worker",
  );

  // Handle mlx-vlm format conversion
  let mlxCleanup: (() => Promise<void>) | null = null;
  let actualRequestBody = requestBody;

  if (isMLXVLMProvider(provider.name)) {
    const { mlxRequest, cleanup } = await convertMessagesToMLXVLMFormat(
      processedMessages,
      provider.model,
      options,
    );
    actualRequestBody = mlxRequest;
    mlxCleanup = cleanup;
  }

  try {
    const aiCallStartTime = Date.now();
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(actualRequestBody),
      signal: options.timeout
        ? AbortSignal.timeout(options.timeout)
        : undefined,
    });
    const aiCallEndTime = Date.now();

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        {
          provider: provider.name,
          status: response.status,
          statusText: response.statusText,
          errorText,
        },
        "AI API error response in worker",
      );
      throw new Error(
        `AI API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = (await response.json()) as any;

    // Extract content based on provider response format
    let content: string;
    if (isMLXVLMProvider(provider.name)) {
      // mlx-vlm returns { "response": "..." } or similar
      content = data.response || data.text || data.content;
    } else {
      content = data.choices?.[0]?.message?.content;
    }

    if (!content) {
      logger.error(
        { provider: provider.name, data },
        "No content in AI response",
      );
      throw new Error("No content received from AI API");
    }

    logger.info(
      {
        provider: provider.name,
        responseLength: content.length,
        responsePreview:
          content.length > 500 ? `${content.substring(0, 500)}...` : content,
        usage: data.usage,
      },
      "AI API call successful in worker",
    );

    // Log the interaction if logging is enabled
    const endTime = Date.now();
    if (aiPromptLogger.isLoggingEnabled()) {
      try {
        // Create safe headers for logging (redact Authorization)
        const safeHeaders = { ...headers };
        if (safeHeaders.Authorization) {
          safeHeaders.Authorization = "[REDACTED]";
        }

        const traceAICall: TraceAICall = {
          callIndex: 0,
          timestamp: new Date(aiCallStartTime).toISOString(),
          requestBody: {
            url,
            method: "POST",
            headers: safeHeaders,
            body: requestBody,
          },
          responseBody: data,
          durationMs: aiCallEndTime - aiCallStartTime,
          usage: data.usage,
          estimatedInputTokens: data.usage?.prompt_tokens,
        };

        await aiPromptLogger.logInteraction(
          requestId,
          processedMessages,
          options,
          traceContext,
          traceAICall,
          content,
          {
            userId: options.traceMetadata?.userId,
            jobId: options.traceMetadata?.jobId,
            jobType: options.traceMetadata?.jobType,
            workerType: options.traceMetadata?.workerType,
            startTime,
            endTime,
          },
        );
      } catch (logError) {
        logger.error(
          {
            requestId,
            error:
              logError instanceof Error ? logError.message : "Unknown error",
          },
          "Failed to log AI interaction in worker",
        );
      }
    }

    return content;
  } catch (error) {
    logger.error(
      {
        provider: provider.name,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "AI API call failed in worker",
    );
    throw error;
  } finally {
    // Cleanup temp files for mlx-vlm
    if (mlxCleanup) {
      await mlxCleanup();
    }
  }
}

/**
 * Clean AI response by removing markdown code blocks and extra formatting
 * This function is kept for backward compatibility with existing code
 */
export function cleanAIResponse(response: string): string {
  // Remove markdown code blocks
  const cleaned = response
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .replace(/^[\s\n]*/, "") // Remove leading whitespace/newlines
    .replace(/[\s\n]*$/, "") // Remove trailing whitespace/newlines
    .trim();

  return cleaned;
}

/**
 * Helper to write base64 image data to a temporary file
 * Returns the file path and cleanup function
 */
async function writeBase64ToTempFile(
  base64Data: string,
  mimeType: string,
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  // Determine file extension from MIME type
  const extension = mimeType.includes("png")
    ? ".png"
    : mimeType.includes("jpeg") || mimeType.includes("jpg")
      ? ".jpg"
      : ".jpg"; // default to jpg

  const { path: tempPath, cleanup } = await tmpFile({
    postfix: extension,
  });

  // Convert base64 to buffer and write to temp file
  const buffer = Buffer.from(base64Data, "base64");
  await fs.promises.writeFile(tempPath, buffer);

  logger.debug(
    { tempPath, size: buffer.length },
    "Created temp file for image",
  );

  return { path: tempPath, cleanup };
}

/**
 * Convert OpenAI-style messages to mlx_vlm format
 * Extracts images from message content and saves them to temp files
 * Returns the converted format and cleanup function for temp files
 */
async function convertMessagesToMLXVLMFormat(
  messages: AIMessage[],
  model: string,
  options: AICallOptions,
): Promise<{
  mlxRequest: any;
  cleanup: () => Promise<void>;
}> {
  const imagePaths: string[] = [];
  const cleanupFunctions: (() => Promise<void>)[] = [];
  let systemPrompt = "";
  let userPrompt = "";

  // Process messages to extract system, user prompts, and images
  for (const message of messages) {
    if (message.role === "system" && typeof message.content === "string") {
      systemPrompt = message.content;
    } else if (message.role === "user") {
      if (typeof message.content === "string") {
        userPrompt += message.content;
      } else if (Array.isArray(message.content)) {
        // Handle multimodal content (text + images)
        for (const item of message.content) {
          if (item.type === "text" && item.text) {
            userPrompt += item.text + " ";
          } else if (
            item.type === "image_url" &&
            item.image_url &&
            item.image_url.url
          ) {
            const url = item.image_url.url;
            // Check if it's a data URL
            if (url.startsWith("data:")) {
              // Extract base64 data and MIME type
              const matches = url.match(/^data:([^;]+);base64,(.+)$/);
              if (matches && matches[1] && matches[2]) {
                const mimeType = matches[1];
                const base64Data = matches[2];
                const { path: tempPath, cleanup } = await writeBase64ToTempFile(
                  base64Data,
                  mimeType,
                );
                imagePaths.push(tempPath);
                cleanupFunctions.push(cleanup);
              }
            } else {
              // It's a file path or URL, use as-is
              imagePaths.push(url);
            }
          }
        }
      }
    }
  }

  // Build mlx_vlm request format
  const mlxRequest: any = {
    model,
    prompt: userPrompt.trim(),
    stream: options.stream ?? false,
    max_tokens: options.maxTokens ?? 2000,
    temperature: options.temperature ?? 0.5,
  };

  if (systemPrompt) {
    mlxRequest.system = systemPrompt;
  }

  if (imagePaths.length > 0) {
    mlxRequest.image = imagePaths;
  }

  // Cleanup function to remove all temp files
  const cleanup = async () => {
    for (const cleanupFn of cleanupFunctions) {
      try {
        await cleanupFn();
      } catch (err) {
        logger.warn({ err }, "Failed to cleanup temp file");
      }
    }
  };

  return { mlxRequest, cleanup };
}

/**
 * Validate worker AI configuration on startup - call this in your main worker startup
 * to ensure all required environment variables are set
 */
export function validateAIConfigOnStartup(): void {
  logger.info("Validating worker AI configuration on startup...");

  try {
    // Validate worker AI config
    validateWorkerAIConfig();

    logger.info("✅ Worker AI configuration is valid");
  } catch (error) {
    logger.fatal(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "❌ Worker AI configuration validation failed",
    );
    throw error;
  }
}
