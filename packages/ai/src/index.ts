/**
 * AI Module
 *
 * Unified AI client for making API calls to various providers.
 *
 * @example
 * ```typescript
 * import { initAI, callAI, callAIStream } from "@eclaire/ai";
 *
 * // Initialize with file-based config
 * initAI({ configPath: "/path/to/config/ai" });
 *
 * // Or initialize with inline config
 * initAI({
 *   providers: { providers: { ... } },
 *   models: { models: { ... } },
 *   selection: { active: { default: "openai:gpt-4o" } },
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

import {
  clearConfigCaches,
  clearConfigPath,
  setConfigPath,
  setInlineConfig,
} from "./config.js";
import { clearDebugLogPath, setDebugLogPath } from "./debug-logger.js";
import { clearLoggerFactory, setLoggerFactory } from "./logger.js";
import type {
  AILogger,
  ModelsConfiguration,
  ProvidersConfiguration,
  SelectionConfiguration,
} from "./types.js";

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Configuration options for initializing the AI client.
 *
 * Provide config in one of two ways:
 * - **File-based:** pass `configPath` pointing to a directory with providers.json, models.json, selection.json
 * - **Programmatic:** pass `providers`, `models`, and `selection` objects directly
 */
export interface AIClientConfig {
  /**
   * Path to the config/ai directory containing:
   * - providers.json
   * - models.json
   * - selection.json
   *
   * Required unless `providers`, `models`, and `selection` are provided.
   */
  configPath?: string;

  /**
   * Provider configuration (alternative to file-based config).
   * Must be provided together with `models` and `selection`.
   */
  providers?: ProvidersConfiguration;

  /**
   * Model configuration (alternative to file-based config).
   * Must be provided together with `providers` and `selection`.
   */
  models?: ModelsConfiguration;

  /**
   * Selection configuration (alternative to file-based config).
   * Must be provided together with `providers` and `models`.
   */
  selection?: SelectionConfiguration;

  /**
   * Factory function to create child loggers.
   * Should return a logger compatible with the AILogger interface.
   * Falls back to console logging if not provided.
   *
   * @param name - Logger name (e.g., "ai-client", "ai-config")
   */
  createChildLogger?: (name: string) => AILogger;

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
 * @example File-based config
 * ```typescript
 * initAI({ configPath: "./config/ai" });
 * ```
 *
 * @example Programmatic config
 * ```typescript
 * initAI({
 *   providers: { providers: { openai: { baseUrl: "https://api.openai.com", dialect: "openai_compatible", auth: { type: "bearer", value: process.env.OPENAI_API_KEY } } } },
 *   models: { models: { "openai:gpt-4o": { name: "GPT-4o", provider: "openai", providerModel: "gpt-4o", capabilities: { ... } } } },
 *   selection: { active: { default: "openai:gpt-4o" } },
 * });
 * ```
 */
export function initAI(config: AIClientConfig): void {
  if (_initialized) {
    throw new Error(
      "AI client already initialized. Call resetAI() first if reconfiguration is needed.",
    );
  }

  // Config source: inline objects OR file path (must provide one)
  if (config.providers && config.models && config.selection) {
    setInlineConfig({
      providers: config.providers,
      models: config.models,
      selection: config.selection,
    });
  } else if (config.configPath) {
    setConfigPath(config.configPath);
  } else {
    throw new Error(
      "initAI requires either configPath or { providers, models, selection }.",
    );
  }

  if (config.createChildLogger) {
    setLoggerFactory(config.createChildLogger);
  }
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
  // Runtime kind
  getAgentRuntimeKind,
  getAgentRuntimeKindForModel,
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
  // Env var interpolation
  interpolateEnvVars,
  isManaged,
  isValidModelIdFormat,
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
  // Inline config (for DB-backed initialization)
  setInlineConfig,
  updateModel,
  validateAIConfig,
  validateAIConfigForModelId,
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
// RUNTIME (v2)
// =============================================================================

// Registries
export {
  clearProviders,
  clearSkillSources,
  clearTools,
  discoverSkills,
  getActiveTools,
  getAdapterByDialect,
  getAlwaysIncludeSkills,
  getPromptContributions,
  getProvider,
  getSkill,
  getSkillSummary,
  getTool,
  getToolDefinition,
  hasProvider,
  hasTool as hasRuntimeTool,
  invalidateSkillCache,
  // Skill normalization
  LOAD_SKILL_TOOL_NAME,
  listProviders,
  listTools,
  loadSkillContent,
  normalizeCreateAgentCapabilities,
  normalizeToolNamesForSkills,
  normalizeUpdatedAgentCapabilities,
  type ProviderRegistration,
  // Provider registry
  registerProvider,
  // Skill registry
  registerSkillSource,
  // Tool registry
  registerTool,
  setActiveTools,
  unregisterProvider,
  unregisterTool,
} from "./registries/index.js";
export type {
  // Agent definition types
  AgentDefinitionBase,
  AgentKind,
  AnyRuntimeMessage,
  // Prompt helper types
  AppendCapabilitiesOptions,
  ApprovalRequest,
  ApprovalResponse,
  AssistantContentBlock,
  AssistantMessage as RuntimeAssistantMessage,
  CreateRuntimeContextOptions,
  ImageBlock,
  OnApprovalRequired,
  ResultContentBlock,
  // Agent types
  RuntimeAgentConfig,
  RuntimeAgentContext,
  RuntimeAgentResult,
  RuntimeAgentStep,
  RuntimeGenerateOptions,
  RuntimeMessage,
  RuntimeStepToolExecution,
  RuntimeStreamEvent,
  RuntimeStreamResult,
  // Tool types
  RuntimeToolDefinition,
  RuntimeToolResult,
  // Skill types
  Skill,
  SkillFrontmatter,
  SkillScope,
  SkillSource,
  StopReason as RuntimeStopReason,
  SystemMessage as RuntimeSystemMessage,
  // Message model
  TextBlock,
  ThinkingBlock,
  ToolCallBlock,
  ToolContext,
  ToolProgressInfo,
  ToolProgressUpdate,
  ToolResultContent,
  ToolResultMessage as RuntimeToolResultMessage,
  ToolUpdateCallback,
  UserContentBlock,
  UserMessage as RuntimeUserMessage,
} from "./runtime/index.js";
export {
  appendAgentCapabilities,
  collectToolPromptContributions,
  convertFromLlm,
  // LLM boundary
  convertToLlm,
  createRuntimeContext,
  errorResult,
  executeRuntimeTool,
  // Message helpers
  getTextContent,
  getThinkingContent,
  getToolCalls,
  // Prompt helpers
  getToolSignatures,
  // Agent
  RuntimeAgent,
  runtimeToolToOpenAI,
  selectTools,
  systemMessage,
  // Tool result helpers
  textResult,
  userMessage,
} from "./runtime/index.js";

// =============================================================================
// MCP
// =============================================================================

export type {
  McpAvailabilityConfig,
  McpConnectionState,
  McpServerConfig,
  McpServersFileConfig,
  McpToolDescriptor,
  McpToolMode,
  McpTransportType,
} from "./mcp/index.js";

export {
  createTestConnection,
  createTestMcpServer,
  type InMemoryTransport,
  McpServerConnection,
  mcpToolsToGroupedRuntimeTool,
  mcpToolToRuntimeTool,
  normalizeMcpResult,
  type TestMcpServer,
  type TestMcpServerOptions,
  type TestToolDef,
} from "./mcp/index.js";

// =============================================================================
// CLI PROVIDERS
// =============================================================================

export type {
  CliEvent,
  CliJsonlDecoder,
  CliSpawnConfig,
} from "./cli/index.js";
export {
  CliSubprocessRunner,
  callAICli,
  callAICliStream,
  createDecoder as createCliDecoder,
} from "./cli/index.js";

// =============================================================================
// TYPES
// =============================================================================

export type {
  AdapterRequest,
  // Adapter types
  AdapterRequestParams,
  AdapterResponse,
  // Runtime kind
  AgentRuntimeKind,
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
  CliConfig,
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
  // Tool calling mode
  ToolCallingMode,
  ToolCallResult,
  ToolChoice,
  ToolDefinition,
  TraceOptions,
  ValidatedAIConfig,
} from "./types.js";
