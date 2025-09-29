import * as fs from "fs";
import * as path from "path";
import { encoding_for_model, get_encoding } from "tiktoken";
import { createChildLogger } from "./logger";

const logger = createChildLogger("ai-client");

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
    logger.debug({ configPath }, "Loading model configuration");

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
      throw new Error("Invalid models configuration: no models defined");
    }

    modelsConfigCache = config;
    logger.info(
      {
        modelsCount: config.models.length,
        modelsList: config.models
          .map((m) => `${m.provider}:${m.modelShortName}`),
      },
      "Model configuration loaded successfully",
    );

    return config;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Failed to load model configuration, falling back to environment variables",
    );
    throw error;
  }
}

/**
 * Get the active model configuration for a given context
 */
export function getActiveModelForContext(
  context: "backend" | "workers",
): ModelConfig | null {
  try {
    const config = loadModelConfiguration();
    if (!config.activeModels || !config.activeModels[context]) {
      logger.warn({ context }, "No active model defined for context");
      return null;
    }

    const activeModelId = config.activeModels[context];
    const model = config.models.find(m => m.id === activeModelId);

    if (!model) {
      logger.warn({ context, activeModelId }, "Active model ID not found in models list");
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
      "Failed to get model config",
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
 * @param context - The context to get the model for (backend or workers)
 * @returns The current model config with sensitive fields (apiKey, providerUrl) removed
 */
export function getCurrentModelConfig(
  context: "backend" | "workers" = "backend",
): Omit<ModelConfig, "apiKey" | "providerUrl"> | null {
  try {
    // Get active model from JSON config instead of env vars
    const activeModel = getActiveModelForContext(context);
    if (!activeModel) {
      logger.warn({ context }, "No active model defined for context");
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
        "Model configuration not found",
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
      "Retrieved current model configuration",
    );

    return safeConfig;
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

/**
 * Get the appropriate system prompt prefix for thinking control
 * @param provider - The model provider to check capabilities for
 * @param modelShortName - The model short name to check capabilities for
 * @param enableThinking - Whether the user wants thinking enabled (undefined = default behavior)
 * @returns The prefix to prepend to system prompt, or empty string if none needed
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
    "Determining thinking prompt prefix",
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
          "Using thinking ON prefix",
        );
        return prefix;
      } else {
        // User wants thinking disabled - use "off" prefix (e.g., "/no_think")
        const prefix = thinkingCapability.control.off;
        logger.debug(
          { provider, modelShortName, prefix },
          "Using thinking OFF prefix",
        );
        return prefix;
      }
    }

    default:
      logger.warn(
        { provider, modelShortName, mode: thinkingCapability.mode },
        "Unknown thinking mode",
      );
      return "";
  }
}

/**
 * Creates a deep copy of an object, safe for tracing
 * Uses JSON serialization which handles most cases but excludes functions, undefined, symbols
 */
function deepCopyForTrace(obj: any): any {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Failed to deep copy object for trace, using shallow copy",
    );
    return { ...obj };
  }
}

export interface AIProvider {
  name: string;
  baseURL: string;
  model: string;
  apiKey?: string;
}

interface AIConfigOverride {
  BACKEND_AI_PROVIDER?: string;
  BACKEND_AI_BASE_URL?: string;
  BACKEND_AI_MODEL?: string;
  BACKEND_AI_API_KEY?: string;
}

export interface AICallTrace {
  callIndex: number;
  timestamp: string;
  requestBody: any;
  responseBody: any;
  durationMs: number;
  usage?: TokenUsage;
  estimatedInputTokens?: number;
}

export interface AICallOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  timeout?: number;
  // Add thinking support
  enableThinking?: boolean;
  // Add tracing support
  trace?: {
    enabled: boolean;
    callIndex: number;
    onTraceCapture?: (trace: AICallTrace) => void;
  };
}

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
  reasoning?: string; // Optional reasoning field for AI responses
}

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface AIResponse {
  content: string;
  reasoning?: string; // Optional reasoning field from AI providers
  usage?: TokenUsage;
  estimatedInputTokens?: number;
}

export interface AIStreamChunk {
  content?: string; // Optional - may only have reasoning
  reasoning?: string; // Optional reasoning field for streaming
  isDone: boolean;
  usage?: TokenUsage;
}

export interface AIStreamResponse {
  stream: ReadableStream<Uint8Array>;
  estimatedInputTokens?: number;
}

// Supported AI providers
const SUPPORTED_PROVIDERS = [
  "ollama",
  "llamacpp",
  "lm-studio",
  "mlx_lm",
  "mlx_vlm",
  "openrouter",
  "proxy",
] as const;
type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

/**
 * Estimates token count for messages using tiktoken
 * Falls back to a simple character-based estimation if tiktoken fails
 */
function estimateTokenCount(messages: AIMessage[], model: string): number {
  try {
    // Try to get encoding for the specific model
    let encoding;
    try {
      encoding = encoding_for_model(model as any);
    } catch {
      // Fallback to cl100k_base encoding (used by gpt-3.5-turbo, gpt-4, etc.)
      encoding = get_encoding("cl100k_base");
    }

    let totalTokens = 0;

    for (const message of messages) {
      // Each message has some overhead tokens
      totalTokens += 4; // Base overhead per message
      totalTokens += encoding.encode(message.role).length;
      totalTokens += encoding.encode(message.content).length;
    }

    // Add a small buffer for message formatting
    totalTokens += 2;

    encoding.free(); // Free the encoding to prevent memory leaks
    return totalTokens;
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        model,
      },
      "Failed to estimate tokens with tiktoken, using fallback estimation",
    );

    // Fallback: rough estimation (1 token ≈ 4 characters for English text)
    const totalCharacters = messages.reduce(
      (sum, msg) => sum + msg.content.length + msg.role.length,
      0,
    );
    return Math.ceil(totalCharacters / 4);
  }
}

/**
 * Validates that required configuration exists and looks up model config
 * Uses JSON config as source of truth for model details
 */
function validateAIConfig(
  context: "backend" | "workers",
  overrides?: AIConfigOverride,
): AIProvider {
  // Get provider and model from activeModel config or overrides
  let providerName: SupportedProvider;
  let modelShortName: string;

  if (
    context === "backend" &&
    overrides?.BACKEND_AI_PROVIDER &&
    overrides?.BACKEND_AI_MODEL
  ) {
    // Use overrides for backend context (for testing)
    providerName = overrides.BACKEND_AI_PROVIDER as SupportedProvider;
    modelShortName = overrides.BACKEND_AI_MODEL;
  } else {
    // Get active model from JSON config
    const activeModel = getActiveModelForContext(context);
    if (!activeModel) {
      throw new Error(
        `No active model defined for ${context} context in models.json. Please configure activeModel.${context}.`,
      );
    }
    providerName = activeModel.provider as SupportedProvider;
    modelShortName = activeModel.modelShortName;
  }

  // Validate provider is supported
  if (!SUPPORTED_PROVIDERS.includes(providerName)) {
    throw new Error(
      `Unsupported AI provider '${providerName}' for ${context}. Supported: ${SUPPORTED_PROVIDERS.join(", ")}`,
    );
  }

  // Look up model configuration in JSON config
  const modelConfig = getModelConfig(providerName, modelShortName);
  if (!modelConfig) {
    throw new Error(
      `Model configuration not found for provider '${providerName}' and model '${modelShortName}'. Check your models.json configuration.`,
    );
  }


  const configSource = overrides ? "overrides" : "activeModel";
  logger.info(
    {
      context,
      provider: providerName,
      modelShortName,
      baseURL: modelConfig.providerUrl,
      hasApiKey: !!modelConfig.apiKey,
      configSource,
    },
    `AI configuration validated from ${configSource} with JSON config lookup`,
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
 * Now returns both content and usage information
 */
export async function callAI(
  messages: AIMessage[],
  context: "backend" | "workers",
  options: AICallOptions = {},
): Promise<AIResponse> {
  if (options.stream) {
    // For streaming, we need to collect all chunks and return as a single response
    // Use the parser to handle the raw SSE stream and collect the final content
    const streamResponse = await callAIStream(messages, context, options);
    const { LLMStreamParser } = await import("./parser-stream-text");

    const streamParser = new LLMStreamParser();
    const parsedStream = await streamParser.processSSEStream(
      streamResponse.stream,
    );
    const reader = parsedStream.getReader();

    const contentChunks: string[] = [];
    const reasoningChunks: string[] = [];
    let finalUsage: TokenUsage | undefined;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (value.type === "content" && value.content) {
          contentChunks.push(value.content);
        }
        if (value.type === "reasoning" && value.content) {
          reasoningChunks.push(value.content);
        }
        // Note: Usage information is not currently extracted from SSE,
        // this would need to be added to the parser if needed
      }
    } finally {
      reader.releaseLock();
    }

    const joinedReasoning = reasoningChunks.join("");
    return {
      content: contentChunks.join(""),
      reasoning:
        joinedReasoning && joinedReasoning.trim() ? joinedReasoning : undefined,
      usage: finalUsage,
      estimatedInputTokens: streamResponse.estimatedInputTokens,
    };
  }

  // Non-streaming path (existing implementation)
  const startTime = Date.now();
  const provider = validateAIConfig(context);

  // Apply thinking prefix to system messages if needed
  const processedMessages = messages.map((message) => {
    if (message.role === "system") {
      // Get the active model for thinking prefix
      const activeModel = getActiveModelForContext(context);

      if (activeModel) {
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
            "Applying thinking prefix to system message",
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

  // Estimate input tokens before making the call
  const estimatedInputTokens = estimateTokenCount(
    processedMessages,
    provider.model,
  );

  const requestBody = {
    model: provider.model,
    messages: processedMessages,
    temperature: options.temperature ?? 0.1,
    max_tokens: options.maxTokens ?? 2000,
    stream: options.stream ?? false,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Add authorization header if API key is provided
  if (provider.apiKey) {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }

  // For proxy providers, use the baseURL as-is. For others, append /v1/chat/completions
  const url =
    provider.name === "proxy"
      ? provider.baseURL
      : `${provider.baseURL}/v1/chat/completions`;

  logger.debug(
    {
      context,
      provider: provider.name,
      url,
      model: provider.model,
      messagesCount: messages.length,
      estimatedInputTokens,
      requestBody: {
        ...requestBody,
        messages: `[${messages.length} messages]`,
      },
      isProxy: provider.name === "proxy",
      traceEnabled: options.trace?.enabled || false,
    },
    "Making AI API call",
  );

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: options.timeout
        ? AbortSignal.timeout(options.timeout)
        : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        {
          context,
          provider: provider.name,
          status: response.status,
          statusText: response.statusText,
          errorText,
        },
        "AI API error response",
      );
      throw new Error(
        `AI API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = (await response.json()) as any;
    const message = data.choices?.[0]?.message;
    const content = message?.content;
    const reasoning = message?.reasoning;

    if (!content) {
      logger.error(
        { context, provider: provider.name, data },
        "No content in AI response",
      );
      throw new Error("No content received from AI API");
    }

    const usage = data.usage as TokenUsage | undefined;
    const endTime = Date.now();
    const durationMs = endTime - startTime;

    // Enhanced logging with token information
    logger.info(
      {
        context,
        provider: provider.name,
        model: provider.model,
        responseLength: content.length,
        estimatedInputTokens,
        actualUsage: usage,
        durationMs,
        tokenAccuracy: usage?.prompt_tokens
          ? `${Math.round((estimatedInputTokens / usage.prompt_tokens) * 100)}% accuracy`
          : "No actual usage data",
        costInfo: usage
          ? {
              promptTokens: usage.prompt_tokens || 0,
              completionTokens: usage.completion_tokens || 0,
              totalTokens: usage.total_tokens || 0,
              contextUtilization: usage.prompt_tokens
                ? `${Math.round((usage.prompt_tokens / (options.maxTokens || 2000)) * 100)}%`
                : "Unknown",
            }
          : "No usage data available",
      },
      "AI API call successful with token usage details",
    );

    // Capture trace if enabled
    if (options.trace?.enabled && options.trace.onTraceCapture) {
      const traceData: AICallTrace = {
        callIndex: options.trace.callIndex,
        timestamp: new Date(startTime).toISOString(),
        requestBody: {
          url,
          method: "POST",
          headers: {
            ...headers,
            Authorization: headers.Authorization ? "[REDACTED]" : undefined,
          },
          body: deepCopyForTrace(requestBody), // Deep copy to avoid reference issues
        },
        responseBody: deepCopyForTrace(data), // Deep copy response as well
        durationMs,
        usage: usage ? deepCopyForTrace(usage) : undefined, // Deep copy usage
        estimatedInputTokens,
      };
      options.trace.onTraceCapture(traceData);
    }

    return {
      content,
      reasoning: reasoning && reasoning.trim() ? reasoning : undefined,
      usage,
      estimatedInputTokens,
    };
  } catch (error) {
    const endTime = Date.now();
    const durationMs = endTime - startTime;

    logger.error(
      {
        context,
        provider: provider.name,
        durationMs,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "AI API call failed",
    );

    // Capture error trace if enabled
    if (options.trace?.enabled && options.trace.onTraceCapture) {
      const traceData: AICallTrace = {
        callIndex: options.trace.callIndex,
        timestamp: new Date(startTime).toISOString(),
        requestBody: {
          url,
          method: "POST",
          headers: {
            ...headers,
            Authorization: headers.Authorization ? "[REDACTED]" : undefined,
          },
          body: deepCopyForTrace(requestBody), // Deep copy to avoid reference issues
        },
        responseBody: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
        durationMs,
        usage: undefined,
        estimatedInputTokens,
      };
      options.trace.onTraceCapture(traceData);
    }

    throw error;
  }
}

/**
 * Makes a streaming AI API call using the OpenAI-compatible /v1/chat/completions endpoint
 */
export async function callAIStream(
  messages: AIMessage[],
  context: "backend" | "workers",
  options: AICallOptions = {},
): Promise<AIStreamResponse> {
  const startTime = Date.now();
  const provider = validateAIConfig(context);

  // Apply thinking prefix to system messages if needed
  const processedMessages = messages.map((message) => {
    if (message.role === "system") {
      // Get the active model for thinking prefix
      const activeModel = getActiveModelForContext(context);

      if (activeModel) {
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
            "Applying thinking prefix to system message (streaming)",
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

  // Estimate input tokens before making the call
  const estimatedInputTokens = estimateTokenCount(
    processedMessages,
    provider.model,
  );

  const requestBody = {
    model: provider.model,
    messages: processedMessages,
    temperature: options.temperature ?? 0.1,
    max_tokens: options.maxTokens ?? 2000,
    stream: true, // Always enable streaming for this function
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Add authorization header if API key is provided
  if (provider.apiKey) {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }

  // For proxy providers, use the baseURL as-is. For others, append /v1/chat/completions
  const url =
    provider.name === "proxy"
      ? provider.baseURL
      : `${provider.baseURL}/v1/chat/completions`;

  logger.debug(
    {
      context,
      provider: provider.name,
      url,
      model: provider.model,
      messagesCount: messages.length,
      estimatedInputTokens,
      traceEnabled: options.trace?.enabled || false,
    },
    "Making streaming AI API call",
  );

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: options.timeout
        ? AbortSignal.timeout(options.timeout)
        : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        {
          context,
          provider: provider.name,
          status: response.status,
          statusText: response.statusText,
          errorText,
        },
        "Streaming AI API error response",
      );
      throw new Error(
        `AI API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    if (!response.body) {
      throw new Error("No response body available for streaming");
    }

    // Return the raw response body stream directly - let the parser handle SSE parsing
    const stream = response.body;

    // Capture trace if enabled
    if (options.trace?.enabled && options.trace.onTraceCapture) {
      const traceData: AICallTrace = {
        callIndex: options.trace.callIndex,
        timestamp: new Date(startTime).toISOString(),
        requestBody: {
          url,
          method: "POST",
          headers: {
            ...headers,
            Authorization: headers.Authorization ? "[REDACTED]" : undefined,
          },
          body: deepCopyForTrace(requestBody),
        },
        responseBody: { streaming: true },
        durationMs: Date.now() - startTime,
        usage: undefined, // Usage will be captured in the stream
        estimatedInputTokens,
      };
      options.trace.onTraceCapture(traceData);
    }

    return {
      stream: stream as ReadableStream<Uint8Array>,
      estimatedInputTokens,
    };
  } catch (error) {
    const endTime = Date.now();
    const durationMs = endTime - startTime;

    logger.error(
      {
        context,
        provider: provider.name,
        durationMs,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Streaming AI API call failed",
    );

    // Capture error trace if enabled
    if (options.trace?.enabled && options.trace.onTraceCapture) {
      const traceData: AICallTrace = {
        callIndex: options.trace.callIndex,
        timestamp: new Date(startTime).toISOString(),
        requestBody: {
          url,
          method: "POST",
          headers: {
            ...headers,
            Authorization: headers.Authorization ? "[REDACTED]" : undefined,
          },
          body: deepCopyForTrace(requestBody),
        },
        responseBody: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
        durationMs,
        usage: undefined,
        estimatedInputTokens,
      };
      options.trace.onTraceCapture(traceData);
    }

    throw error;
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
 * Validate AI configuration on startup - call this in your main application startup
 * to ensure all required environment variables are set
 */
export function validateAIConfigOnStartup(): void {
  logger.info("Validating AI configuration on startup...");

  try {
    // Validate backend AI config
    validateAIConfig("backend");

    logger.info("✅ All AI configurations are valid");
  } catch (error) {
    logger.fatal(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "❌ AI configuration validation failed",
    );
    throw error;
  }
}

/**
 * Get the current AI provider configuration for a given context
 * Useful for logging or debugging
 */
export function getAIProviderInfo(context: "backend" | "workers"): AIProvider {
  return validateAIConfig(context);
}
