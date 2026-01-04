/**
 * AI Module Types
 *
 * Core type definitions for the AI client, aligned with Vercel AI SDK patterns
 * while remaining offline-first.
 */

// =============================================================================
// PROVIDER TYPES
// =============================================================================

/**
 * Supported dialect types for AI providers.
 * Each dialect maps to an adapter that handles request/response transformation.
 */
export type Dialect = "openai_compatible" | "mlx_native" | "anthropic_messages";

/**
 * Provider authentication configuration.
 * Uses environment variable interpolation: ${ENV:VAR_NAME}
 */
export interface ProviderAuth {
  type: "none" | "bearer" | "header";
  /** Header name for authentication (e.g., "Authorization", "x-api-key") */
  header?: string;
  /** Header value, supports ${ENV:VAR} interpolation (e.g., "Bearer ${ENV:API_KEY}") */
  value?: string;
}

/**
 * Provider overrides for edge cases and custom endpoints
 */
export interface ProviderOverrides {
  /** Response paths to extract reasoning from */
  reasoningFields?: string[];
  /** Override the default chat/completions endpoint path */
  chatPath?: string;
  /** Override the default models endpoint path */
  modelsPath?: string;
}

/**
 * Engine configuration for managed local providers.
 * Contains settings for starting/stopping local inference servers.
 */
export interface EngineConfig {
  /** Whether this engine is managed by us (we start/stop it) */
  managed: boolean;
  /** Engine type: "llama-cpp", "mlx-lm", "mlx-vlm", "ollama", "lm-studio", etc. */
  name: string;
  /** GPU layers to offload (-1 = all). Maps to -ngl flag for llama-cpp */
  gpuLayers?: number;
  /** Context size. Maps to -c flag for llama-cpp */
  contextSize?: number;
  /** Batch size. Maps to -b flag for llama-cpp */
  batchSize?: number;
  /** Enable flash attention. Maps to -fa flag for llama-cpp */
  flashAttention?: boolean;
  /** Additional CLI arguments for the engine */
  extraArgs?: string[];
}

/**
 * Provider configuration - defines how to connect to an AI provider.
 * For managed local providers, also includes engine launch settings.
 *
 * The baseUrl should include the API version path (e.g., "http://localhost:11434/v1").
 * The endpoint is derived from the dialect unless overridden.
 */
export interface ProviderConfig {
  /** API dialect for request/response format */
  dialect: Dialect;
  /** Base URL for API requests (include API version path, e.g., "/v1") */
  baseUrl: string;
  /** Custom headers to include in requests (supports ${ENV:VAR} interpolation) */
  headers?: Record<string, string>;
  /** Authentication configuration */
  auth: ProviderAuth;
  /** Override default dialect behavior */
  overrides?: ProviderOverrides;
  /** Engine configuration for local providers. If present, this is a local provider. */
  engine?: EngineConfig;
}

/**
 * Providers configuration file structure
 */
export interface ProvidersConfiguration {
  providers: Record<string, ProviderConfig>;
}

// =============================================================================
// MODEL CAPABILITY TYPES
// =============================================================================

/**
 * Input/output modality types
 */
export type InputModality = "text" | "image" | "audio" | "file";
export type OutputModality = "text" | "image" | "audio";

/**
 * Reasoning configuration for models that support thinking/reasoning
 */
export interface ReasoningConfig {
  /** Whether the model supports reasoning/thinking */
  supported: boolean;
  /**
   * How reasoning is controlled:
   * - "prompt-controlled": User can toggle via prompt prefix (e.g., /no_think)
   * - "provider-controlled": Provider's API controls thinking (e.g., Claude extended thinking)
   * - "always": Model always reasons
   * - "never": Model never reasons
   */
  mode?: "always" | "never" | "prompt-controlled" | "provider-controlled";
  /** Prefix to add to disable thinking (e.g., "/no_think") */
  disablePrefix?: string;
}

/**
 * Model capabilities - what a model can do
 */
export interface ModelCapabilities {
  modalities: {
    input: InputModality[];
    output: OutputModality[];
  };
  streaming: boolean;
  tools: boolean;
  jsonSchema: boolean;
  structuredOutputs: boolean;
  reasoning: ReasoningConfig;
  contextWindow: number;
  maxOutputTokens?: number;
}

/**
 * Tokenizer configuration for accurate token estimation
 */
export interface TokenizerConfig {
  type: "tiktoken" | "sentencepiece" | "unknown";
  name?: string; // e.g., "cl100k_base", "o200k_base"
}

/**
 * Model architecture information for accurate memory estimation
 */
export interface ModelArchitecture {
  layers: number; // n_layers / block_count
  kvHeads: number; // n_kv_heads (key-value attention heads)
  headDim?: number; // head dimension (typically 128)
  slidingWindow?: number; // SWA window size in tokens (e.g., 1024)
  slidingWindowPattern?: number; // Which layers use full context (e.g., every 6th layer)
}

/**
 * Model source information
 */
export interface ModelSource {
  url: string;
  format?: string;
  quantization?: string;
  sizeBytes?: number;
  visionSizeBytes?: number; // Size of vision projector (mmproj) file for multimodal models
  localPath?: string; // Path to downloaded model file (for local inference)
  filename?: string; // Filename within HuggingFace repo (for GGUF downloads)
  architecture?: ModelArchitecture; // Architecture info for memory estimation
}

/**
 * Model pricing (per million tokens)
 */
export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

/**
 * Model configuration - defines a model and its capabilities
 */
export interface ModelConfig {
  name: string;
  provider: string;
  providerModel: string;
  capabilities: ModelCapabilities;
  tokenizer?: TokenizerConfig;
  source: ModelSource;
  pricing?: ModelPricing | null;
}

/**
 * Models configuration file structure
 */
export interface ModelsConfiguration {
  models: Record<string, ModelConfig>;
}

// =============================================================================
// SELECTION TYPES
// =============================================================================

/**
 * Context types for model selection.
 * Generic string to allow any context - applications define their own contexts.
 * Common examples: "backend", "workers", "cli", "chat", etc.
 */
export type AIContext = string;

/**
 * Selection configuration - which models are active for each context.
 * Keys are context names (e.g., "backend", "workers"), values are model IDs.
 */
export interface SelectionConfiguration {
  active: Record<string, string | undefined>;
}

// =============================================================================
// TOOL CALLING TYPES
// =============================================================================

/**
 * JSON Schema type (simplified)
 */
export type JSONSchema = Record<string, unknown>;

/**
 * Tool definition aligned with OpenAI/Vercel AI SDK format
 */
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JSONSchema;
  };
}

/**
 * Tool choice options
 */
export type ToolChoice =
  | "auto" // Let model decide
  | "none" // Disable tools
  | "required" // Force tool use
  | { type: "function"; function: { name: string } }; // Specific tool

/**
 * Tool call result from model response
 */
export interface ToolCallResult {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/**
 * Tool calling mode for agents
 * - "native": Use native tool calls from model response only (default)
 * - "text": Parse text content for embedded JSON tool calls only
 * - "off": Don't send tools to AI and ignore any tool calls
 */
export type ToolCallingMode = "native" | "text" | "off";

// =============================================================================
// STRUCTURED OUTPUT TYPES
// =============================================================================

/**
 * JSON Schema definition for structured outputs
 */
export interface JSONSchemaDefinition {
  name: string;
  schema: JSONSchema;
  strict?: boolean;
}

/**
 * Response format options
 */
export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JSONSchemaDefinition };

// =============================================================================
// MESSAGE TYPES
// =============================================================================

/**
 * Text content part
 */
export interface TextContentPart {
  type: "text";
  text: string;
}

/**
 * Image content part
 */
export interface ImageContentPart {
  type: "image_url";
  image_url: { url: string };
}

/**
 * Message content can be string or array of parts
 */
export type MessageContent = string | Array<TextContentPart | ImageContentPart>;

/**
 * AI message format
 */
export interface AIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: MessageContent;
  reasoning?: string;
  name?: string; // For tool messages
  tool_call_id?: string; // For tool response messages
  tool_calls?: ToolCallResult[]; // For assistant messages with tool calls
}

// =============================================================================
// API CALL TYPES
// =============================================================================

/**
 * Token usage information
 */
export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/**
 * Trace options for debugging AI calls
 */
export interface TraceOptions {
  enabled: boolean;
  callIndex: number;
  onTraceCapture?: (trace: AICallTrace) => void;
}

/**
 * AI call trace for debugging
 */
export interface AICallTrace {
  callIndex: number;
  timestamp: string;
  requestBody: Record<string, unknown>;
  responseBody: Record<string, unknown>;
  durationMs: number;
  usage?: TokenUsage;
  estimatedInputTokens?: number;
}

/**
 * AI call options
 */
export interface AICallOptions {
  // Generation parameters
  temperature?: number;
  maxTokens?: number;
  top_p?: number;
  stream?: boolean;
  timeout?: number;

  // Reasoning control
  enableThinking?: boolean;

  // Tool calling
  tools?: ToolDefinition[];
  toolChoice?: ToolChoice;

  // Structured outputs
  responseFormat?: ResponseFormat;

  // Tracing
  trace?: TraceOptions;
  traceMetadata?: Record<string, unknown>;

  // Debug logging context (included in debug log entries when debugLogPath is set)
  debugContext?: Record<string, unknown>;
}

/**
 * Finish reason for AI response
 */
export type FinishReason = "stop" | "tool_calls" | "length" | "content_filter";

/**
 * AI response from non-streaming call
 */
export interface AIResponse {
  content: string;
  reasoning?: string;
  toolCalls?: ToolCallResult[];
  usage?: TokenUsage;
  estimatedInputTokens?: number;
  finishReason?: FinishReason;
}

/**
 * AI stream chunk
 */
export interface AIStreamChunk {
  content?: string;
  reasoning?: string;
  toolCalls?: ToolCallResult[];
  isDone: boolean;
  usage?: TokenUsage;
  finishReason?: FinishReason;
}

/**
 * AI stream response
 */
export interface AIStreamResponse {
  stream: ReadableStream<Uint8Array>;
  estimatedInputTokens?: number;
}

// =============================================================================
// ADAPTER TYPES
// =============================================================================

/**
 * Parameters for adapter request building
 */
export interface AdapterRequestParams {
  messages: AIMessage[];
  model: string;
  options: {
    temperature?: number;
    maxTokens?: number;
    top_p?: number;
    stream?: boolean;
    tools?: ToolDefinition[];
    toolChoice?: ToolChoice;
    responseFormat?: ResponseFormat;
  };
  providerOverrides?: ProviderOverrides;
}

/**
 * Adapter request output
 */
export interface AdapterRequest {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Adapter response output
 */
export interface AdapterResponse {
  content: string;
  reasoning?: string;
  toolCalls?: ToolCallResult[];
  usage?: TokenUsage;
  finishReason?: FinishReason;
}

// DialectAdapter is defined in adapters/types.ts - re-export for convenience
export type { DialectAdapter } from "./adapters/types.js";

// =============================================================================
// RESOLVED PROVIDER INFO
// =============================================================================

/**
 * Resolved provider information for making API calls
 */
export interface ResolvedProvider {
  name: string;
  baseURL: string;
  model: string;
  apiKey?: string;
}

/**
 * Validated AI configuration result
 */
export interface ValidatedAIConfig {
  provider: ResolvedProvider;
  providerConfig: ProviderConfig;
  modelId: string;
  modelConfig: ModelConfig;
}

// =============================================================================
// LOGGER TYPE (for dependency injection)
// =============================================================================

/**
 * Logger interface for AI module
 * Compatible with pino logger
 */
export interface AILogger {
  debug(obj: Record<string, unknown>, msg?: string): void;
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
}
