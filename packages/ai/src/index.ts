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

import { clearConfigCaches, clearConfigPath, setConfigPath } from "./config.js";
import { clearDebugLogPath, setDebugLogPath } from "./debug-logger.js";
import { clearLoggerFactory, setLoggerFactory } from "./logger.js";
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
      "AI client already initialized. Call resetAI() first if reconfiguration is needed.",
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
  type RawSSEBufferCallback,
  type SSEParseResult,
  type StreamParseResult,
  type ToolCallData,
} from "./stream-parser.js";

// =============================================================================
// TEXT PARSER
// =============================================================================

export {
  extractFinalResponse,
  extractThinkingContent,
  extractToolCalls,
  parseTextToolContent,
  type TextToolParseResult,
  type ToolCall,
} from "./text-parser.js";

// =============================================================================
// CONFIGURATION
// =============================================================================

export {
  // Model CRUD
  addModel,
  clearConfigCaches,
  getActiveModelForContext,
  // Config accessors
  getActiveModelIdForContext,
  getActiveModelsAsObjects,
  getAIProviderInfo,
  getConfigPath,
  getCurrentModelConfig,
  getEngineConfig,
  getLocalProviders,
  getManagedProviders,
  getModelConfigById,
  getModels,
  getProviderConfig,
  // Helper functions
  getProviders,
  // Reasoning helpers
  getThinkingPromptPrefix,
  hasAllInputModalities,
  // Engine helpers
  hasEngine,
  // Modality helpers (generic)
  hasInputModality,
  isManaged,
  loadModelsConfiguration,
  // Config loading
  loadProvidersConfiguration,
  loadSelectionConfiguration,
  parsePort,
  removeActiveModel,
  removeModel,
  // Provider resolution
  resolveProviderForModel,
  saveModelsConfiguration,
  // Config write operations
  saveProvidersConfiguration,
  saveSelectionConfiguration,
  // Selection management
  setActiveModel,
  // Config path management
  setConfigPath,
  updateModel,
  validateAIConfig,
  validateAIConfigOnStartup,
} from "./config.js";

// =============================================================================
// VALIDATION
// =============================================================================

export type { RequestRequirements } from "./validation.js";
export {
  CapabilityError,
  // Validation
  deriveRequestRequirements,
  getReasoningMode,
  modelSupportsJsonSchema,
  modelSupportsReasoning,
  modelSupportsStreaming,
  modelSupportsStructuredOutputs,
  // Capability checks
  modelSupportsTools,
  validateRequestAgainstCapabilities,
} from "./validation.js";

// =============================================================================
// TOKEN ESTIMATION
// =============================================================================

export { checkContextFit, estimateTokenCount } from "./token-estimation.js";

// =============================================================================
// ADAPTERS
// =============================================================================

export type { AdapterRegistry, DialectAdapter } from "./adapters/index.js";
export {
  adapterRegistry,
  anthropicMessagesAdapter,
  getAdapter,
  isDialectSupported,
  mlxNativeAdapter,
  openaiCompatibleAdapter,
} from "./adapters/index.js";

// =============================================================================
// TOOLS
// =============================================================================

export {
  buildAssistantToolCallMessage,
  buildToolResultMessage,
  buildToolResultMessages,
  createObjectSchema,
  createToolCallSummary,
  createToolDefinition,
  executeAllToolCalls,
  executeToolCall,
  getToolNames,
  hasToolCalls,
  // Tool functions
  parseToolCallArguments,
  shouldContinueToolLoop,
  type ToolCallSummaryInput,
  type ToolCallSummaryOutput,
  // Tool types
  type ToolExecutionResult,
  type ToolExecutor,
  type ToolLoopOptions,
  type ToolLoopResult,
  type ToolRegistry,
} from "./tools/index.js";

// =============================================================================
// AGENT
// =============================================================================

export type {
  // Agent types
  AgentContext,
  AgentResult,
  AgentStep,
  AgentStreamEvent,
  AgentStreamResult,
  AgentToolDefinition,
  CreateContextOptions,
  GenerateOptions,
  PrepareStepInfo,
  PrepareStepResult,
  StepToolExecution,
  StopCondition,
  ToolLoopAgentConfig,
} from "./agent/index.js";
export {
  allOf,
  anyOf,
  // Context
  createAgentContext,
  custom as customStopCondition,
  defaultStopConditions,
  evaluateStopConditions,
  executeAgentTool,
  extendContext,
  finishReasonStop,
  getContextElapsedMs,
  hasToolCall,
  isContextAborted,
  maxDuration,
  maxTokens as maxTokensCondition,
  noToolCalls,
  // Stop conditions
  stepCountIs,
  // Main class
  ToolLoopAgent,
  toOpenAIToolDefinition,
  toOpenAITools,
  // Tool helpers
  tool,
} from "./agent/index.js";

// =============================================================================
// TYPES
// =============================================================================

export type {
  AdapterRequest,
  // Adapter types
  AdapterRequestParams,
  AdapterResponse,
  AICallOptions,
  AICallTrace,
  // Selection types
  AIContext,
  // Logger type
  AILogger,
  AIMessage,
  AIResponse,
  AIStreamChunk,
  AIStreamResponse,
  // Dialect types
  Dialect,
  EngineConfig,
  FinishReason,
  ImageContentPart,
  // Model types
  InputModality,
  // Tool calling types
  JSONSchema,
  // Structured output types
  JSONSchemaDefinition,
  MessageContent,
  ModelCapabilities,
  ModelConfig,
  ModelPricing,
  ModelSource,
  ModelsConfiguration,
  OutputModality,
  // Provider types
  ProviderAuth,
  ProviderConfig,
  ProviderOverrides,
  ProvidersConfiguration,
  ReasoningConfig,
  // Resolved provider
  ResolvedProvider,
  ResponseFormat,
  SelectionConfiguration,
  // Message types
  TextContentPart,
  TokenizerConfig,
  // API call types
  TokenUsage,
  ToolCallResult,
  ToolChoice,
  ToolDefinition,
  TraceOptions,
  ValidatedAIConfig,
} from "./types.js";
