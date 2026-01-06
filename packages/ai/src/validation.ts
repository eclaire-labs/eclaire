/**
 * AI Request Validation
 *
 * Validates AI requests against model capabilities to provide
 * clear error messages before making API calls.
 */

import { createAILogger } from "./logger.js";
import type {
  AICallOptions,
  AIMessage,
  InputModality,
  ModelCapabilities,
} from "./types.js";

// Lazy-initialized logger
let _logger: ReturnType<typeof createAILogger> | null = null;
function getLogger() {
  if (!_logger) {
    _logger = createAILogger("ai-validation");
  }
  return _logger;
}

// =============================================================================
// REQUEST REQUIREMENTS
// =============================================================================

/**
 * Derived requirements from a request
 */
export interface RequestRequirements {
  inputModalities: Set<InputModality>;
  streaming: boolean;
  tools: boolean;
  jsonSchema: boolean;
  structuredOutputs: boolean;
  maxOutputTokens?: number;
  estimatedInputTokens: number;
}

/**
 * Derive request requirements from messages and options
 */
export function deriveRequestRequirements(
  messages: AIMessage[],
  options: AICallOptions,
  estimatedTokens: number = 0,
): RequestRequirements {
  const inputModalities = new Set<InputModality>(["text"]);

  // Scan messages for modality usage
  for (const message of messages) {
    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === "image_url") {
          inputModalities.add("image");
        }
        // Future: detect audio/file types here
      }
    }
  }

  // Determine feature requirements
  const tools = !!options.tools && options.tools.length > 0;
  const jsonSchema =
    options.responseFormat?.type === "json_schema" ||
    options.responseFormat?.type === "json_object";
  const structuredOutputs =
    options.responseFormat?.type === "json_schema" &&
    options.responseFormat.json_schema?.strict === true;

  return {
    inputModalities,
    streaming: options.stream ?? false,
    tools,
    jsonSchema,
    structuredOutputs,
    maxOutputTokens: options.maxTokens,
    estimatedInputTokens: estimatedTokens,
  };
}

// =============================================================================
// CAPABILITY VALIDATION
// =============================================================================

/**
 * Validation error with structured information
 */
export class CapabilityError extends Error {
  constructor(
    public readonly modelId: string,
    public readonly errors: string[],
  ) {
    super(`Model '${modelId}' cannot satisfy request: ${errors.join("; ")}`);
    this.name = "CapabilityError";
  }
}

/**
 * Validate that request requirements match model capabilities
 */
export function validateRequestAgainstCapabilities(
  modelId: string,
  requirements: RequestRequirements,
  capabilities: ModelCapabilities,
): void {
  const logger = getLogger();
  const errors: string[] = [];

  // Check input modalities
  for (const required of requirements.inputModalities) {
    if (!capabilities.modalities.input.includes(required)) {
      errors.push(
        `requires ${required} input, model supports only ${capabilities.modalities.input.join(", ")}`,
      );
    }
  }

  // Check streaming
  if (requirements.streaming && !capabilities.streaming) {
    errors.push("requires streaming, model does not support streaming");
  }

  // Check tools
  if (requirements.tools && !capabilities.tools) {
    errors.push(
      "requires native tool calling, model does not support tools. " +
        "Consider using text-based tool extraction instead.",
    );
  }

  // Check JSON schema
  if (requirements.jsonSchema && !capabilities.jsonSchema) {
    errors.push(
      "requires JSON schema response format, model does not support json_schema",
    );
  }

  // Check structured outputs
  if (requirements.structuredOutputs && !capabilities.structuredOutputs) {
    errors.push(
      "requires strict structured outputs, model does not support structured outputs",
    );
  }

  // Check max output tokens
  if (requirements.maxOutputTokens && capabilities.maxOutputTokens) {
    if (requirements.maxOutputTokens > capabilities.maxOutputTokens) {
      errors.push(
        `requested ${requirements.maxOutputTokens} output tokens, model max is ${capabilities.maxOutputTokens}`,
      );
    }
  }

  // Check context window
  if (requirements.estimatedInputTokens > capabilities.contextWindow) {
    errors.push(
      `estimated ${requirements.estimatedInputTokens} input tokens exceeds context window of ${capabilities.contextWindow}`,
    );
  }

  if (errors.length > 0) {
    logger.warn(
      { modelId, errors, requirements: summarizeRequirements(requirements) },
      "Request validation failed",
    );
    throw new CapabilityError(modelId, errors);
  }

  logger.debug(
    { modelId, requirements: summarizeRequirements(requirements) },
    "Request validation passed",
  );
}

/**
 * Summarize requirements for logging
 */
function summarizeRequirements(
  req: RequestRequirements,
): Record<string, unknown> {
  return {
    modalities: Array.from(req.inputModalities),
    streaming: req.streaming,
    tools: req.tools,
    jsonSchema: req.jsonSchema,
    structuredOutputs: req.structuredOutputs,
    maxOutputTokens: req.maxOutputTokens,
    estimatedInputTokens: req.estimatedInputTokens,
  };
}

// =============================================================================
// CAPABILITY CHECKS (for callers to check before making requests)
// =============================================================================

/**
 * Check if model supports native tool calling
 */
export function modelSupportsTools(capabilities: ModelCapabilities): boolean {
  return capabilities.tools === true;
}

/**
 * Check if model supports JSON schema response format
 */
export function modelSupportsJsonSchema(
  capabilities: ModelCapabilities,
): boolean {
  return capabilities.jsonSchema === true;
}

/**
 * Check if model supports strict structured outputs
 */
export function modelSupportsStructuredOutputs(
  capabilities: ModelCapabilities,
): boolean {
  return capabilities.structuredOutputs === true;
}

/**
 * Check if model supports streaming
 */
export function modelSupportsStreaming(
  capabilities: ModelCapabilities,
): boolean {
  return capabilities.streaming;
}

/**
 * Check if model supports reasoning/thinking
 */
export function modelSupportsReasoning(
  capabilities: ModelCapabilities,
): boolean {
  return capabilities.reasoning.supported;
}

/**
 * Get reasoning mode for a model
 */
export function getReasoningMode(
  capabilities: ModelCapabilities,
):
  | "always"
  | "never"
  | "prompt-controlled"
  | "provider-controlled"
  | undefined {
  return capabilities.reasoning.mode;
}
