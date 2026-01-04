/**
 * AI Module
 *
 * Unified AI client for making API calls to various providers.
 *
 * @example
 * ```typescript
 * import { initAI, callAI, callAIStream } from "@eclaire/ai";
 *
 * // Initialize the AI client (call once at startup)
 * initAI({
 *   configPath: "/path/to/config/ai",
 *   createChildLogger: (name) => myLogger.child({ module: name }),
 * });
 *
 * // Non-streaming call
 * const response = await callAI(messages, "backend", {
 *   temperature: 0.7,
 *   maxTokens: 2000,
 * });
 *
 * // With native tool calling
 * const response = await callAI(messages, "backend", {
 *   tools: [{
 *     type: "function",
 *     function: {
 *       name: "search",
 *       description: "Search for information",
 *       parameters: { type: "object", properties: { query: { type: "string" } } }
 *     }
 *   }],
 *   toolChoice: "auto"
 * });
 *
 * // With structured outputs
 * const response = await callAI(messages, "backend", {
 *   responseFormat: {
 *     type: "json_schema",
 *     json_schema: {
 *       name: "tags",
 *       schema: { type: "object", properties: { tags: { type: "array" } } },
 *       strict: true
 *     }
 *   }
 * });
 *
 * // Streaming call
 * const { stream } = await callAIStream(messages, "backend");
 * ```
 */

import { setLoggerFactory, clearLoggerFactory } from "./logger.js";
import { setConfigPath, clearConfigPath, clearConfigCaches } from "./config.js";
import { setDebugLogPath, clearDebugLogPath } from "./debug-logger.js";
import type { AILogger } from "./types.js";

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Configuration options for initializing the AI client
 */
export interface AIClientConfig {
  /**
   * Path to the config/ai directory containing:
   * - providers.json
   * - models.json
   * - selection.json
   */
  configPath: string;

  /**
   * Factory function to create child loggers.
   * Should return a logger compatible with pino's interface.
   *
   * @param name - Logger name (e.g., "ai-client", "ai-config")
   */
  createChildLogger: (name: string) => AILogger;

  /**
   * Optional path to a debug log file (JSONL format).
   * When set, all AI requests/responses are logged to this file.
   * Useful for debugging without polluting the console.
   */
  debugLogPath?: string;
}

let _initialized = false;

/**
 * Initialize the AI client with configuration.
 * Must be called before using any AI functions.
 *
 * @param config - Configuration options
 * @throws Error if already initialized (call resetAI first)
 *
 * @example
 * ```typescript
 * import { initAI } from "@eclaire/ai";
 * import { createChildLogger } from "@eclaire/logger";
 * import { config } from "./config";
 *
 * initAI({
 *   configPath: path.join(config.dirs.config, "ai"),
 *   createChildLogger,
 * });
 * ```
 */
export function initAI(config: AIClientConfig): void {
  if (_initialized) {
    throw new Error(
      "AI client already initialized. Call resetAI() first if reconfiguration is needed."
    );
  }

  setConfigPath(config.configPath);
  setLoggerFactory(config.createChildLogger);
  setDebugLogPath(config.debugLogPath);
  _initialized = true;
}

/**
 * Reset the AI client state.
 * Useful for testing or when reconfiguration is needed.
 */
export function resetAI(): void {
  clearConfigPath();
  clearLoggerFactory();
  clearDebugLogPath();
  clearConfigCaches();
  _initialized = false;
}

/**
 * Check if the AI client has been initialized
 */
export function isAIInitialized(): boolean {
  return _initialized;
}

/**
 * Set a custom logger factory.
 * Use this when you need to control logging without full initAI() initialization.
 * Useful for CLI tools that want to suppress or customize AI module logging.
 *
 * @param factory - Function that creates loggers for each module name
 */
export { setLoggerFactory } from "./logger.js";

// =============================================================================
// MAIN API
// =============================================================================

export { callAI, callAIStream } from "./client.js";

// =============================================================================
// STREAM PARSER
// =============================================================================

export {
  LLMStreamParser,
  type StreamParseResult,
  type SSEParseResult,
  type ToolCallData,
  type RawSSEBufferCallback,
} from "./stream-parser.js";

// =============================================================================
// TEXT PARSER
// =============================================================================

export {
  extractThinkingContent,
  parseTextToolContent,
  extractFinalResponse,
  extractToolCalls,
  type ToolCall,
  type TextToolParseResult,
} from "./text-parser.js";

// =============================================================================
// CONFIGURATION
// =============================================================================

export {
  // Config loading
  loadProvidersConfiguration,
  loadModelsConfiguration,
  loadSelectionConfiguration,
  clearConfigCaches,
  // Config accessors
  getActiveModelIdForContext,
  getActiveModelForContext,
  getModelConfigById,
  getProviderConfig,
  getCurrentModelConfig,
  // Reasoning helpers
  getThinkingPromptPrefix,
  // Provider resolution
  resolveProviderForModel,
  validateAIConfig,
  validateAIConfigOnStartup,
  getAIProviderInfo,
  // Config write operations
  saveProvidersConfiguration,
  saveModelsConfiguration,
  saveSelectionConfiguration,
  // Model CRUD
  addModel,
  updateModel,
  removeModel,
  // Selection management
  setActiveModel,
  removeActiveModel,
  // Helper functions
  getProviders,
  getModels,
  getActiveModelsAsObjects,
  // Modality helpers (generic)
  hasInputModality,
  hasAllInputModalities,
  // Config path management
  setConfigPath,
  getConfigPath,
  // Engine helpers
  hasEngine,
  isManaged,
  parsePort,
  getManagedProviders,
  getLocalProviders,
  getEngineConfig,
} from "./config.js";

// =============================================================================
// VALIDATION
// =============================================================================

export {
  // Validation
  deriveRequestRequirements,
  validateRequestAgainstCapabilities,
  CapabilityError,
  // Capability checks
  modelSupportsTools,
  modelSupportsJsonSchema,
  modelSupportsStructuredOutputs,
  modelSupportsStreaming,
  modelSupportsReasoning,
  getReasoningMode,
} from "./validation.js";

export type { RequestRequirements } from "./validation.js";

// =============================================================================
// TOKEN ESTIMATION
// =============================================================================

export { estimateTokenCount, checkContextFit } from "./token-estimation.js";

// =============================================================================
// ADAPTERS
// =============================================================================

export {
  getAdapter,
  isDialectSupported,
  adapterRegistry,
  openaiCompatibleAdapter,
  mlxNativeAdapter,
  anthropicMessagesAdapter,
} from "./adapters/index.js";

export type { DialectAdapter, AdapterRegistry } from "./adapters/index.js";

// =============================================================================
// TOOLS
// =============================================================================

export {
  // Tool types
  type ToolExecutionResult,
  type ToolExecutor,
  type ToolRegistry,
  type ToolCallSummaryInput,
  type ToolCallSummaryOutput,
  // Tool functions
  parseToolCallArguments,
  hasToolCalls,
  getToolNames,
  executeToolCall,
  executeAllToolCalls,
  buildAssistantToolCallMessage,
  buildToolResultMessage,
  buildToolResultMessages,
  createToolDefinition,
  createObjectSchema,
  shouldContinueToolLoop,
  createToolCallSummary,
  type ToolLoopOptions,
  type ToolLoopResult,
} from "./tools/index.js";

// =============================================================================
// AGENT
// =============================================================================

export {
  // Main class
  ToolLoopAgent,
  // Context
  createAgentContext,
  isContextAborted,
  getContextElapsedMs,
  extendContext,
  // Tool helpers
  tool,
  toOpenAIToolDefinition,
  toOpenAITools,
  executeAgentTool,
  // Stop conditions
  stepCountIs,
  hasToolCall,
  noToolCalls,
  finishReasonStop,
  anyOf,
  allOf,
  custom as customStopCondition,
  maxTokens as maxTokensCondition,
  maxDuration,
  evaluateStopConditions,
  defaultStopConditions,
} from "./agent/index.js";

export type {
  // Agent types
  AgentContext,
  CreateContextOptions,
  AgentToolDefinition,
  StopCondition,
  StepToolExecution,
  AgentStep,
  PrepareStepInfo,
  PrepareStepResult,
  ToolLoopAgentConfig,
  AgentResult,
  AgentStreamEvent,
  AgentStreamResult,
  GenerateOptions,
} from "./agent/index.js";

// =============================================================================
// TYPES
// =============================================================================

export type {
  // Dialect types
  Dialect,
  // Provider types
  ProviderAuth,
  ProviderOverrides,
  EngineConfig,
  ProviderConfig,
  ProvidersConfiguration,
  // Model types
  InputModality,
  OutputModality,
  ReasoningConfig,
  ModelCapabilities,
  TokenizerConfig,
  ModelSource,
  ModelPricing,
  ModelConfig,
  ModelsConfiguration,
  // Selection types
  AIContext,
  SelectionConfiguration,
  // Tool calling types
  JSONSchema,
  ToolDefinition,
  ToolChoice,
  ToolCallResult,
  // Structured output types
  JSONSchemaDefinition,
  ResponseFormat,
  // Message types
  TextContentPart,
  ImageContentPart,
  MessageContent,
  AIMessage,
  // API call types
  TokenUsage,
  TraceOptions,
  AICallTrace,
  AICallOptions,
  FinishReason,
  AIResponse,
  AIStreamChunk,
  AIStreamResponse,
  // Adapter types
  AdapterRequestParams,
  AdapterRequest,
  AdapterResponse,
  // Resolved provider
  ResolvedProvider,
  ValidatedAIConfig,
  // Logger type
  AILogger,
} from "./types.js";
