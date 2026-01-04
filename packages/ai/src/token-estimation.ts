/**
 * Token Estimation
 *
 * Estimates token counts for AI messages using tiktoken.
 */

import { encoding_for_model, get_encoding } from "tiktoken";
import { createAILogger } from "./logger.js";
import type { AIMessage } from "./types.js";

// Lazy-initialized logger
let _logger: ReturnType<typeof createAILogger> | null = null;
function getLogger() {
  if (!_logger) {
    _logger = createAILogger("token-estimation");
  }
  return _logger;
}

// =============================================================================
// TOKEN ESTIMATION
// =============================================================================

/**
 * Estimates token count for messages using tiktoken
 *
 * @param messages - Array of AI messages to estimate
 * @param model - Model name for tokenizer selection
 * @returns Estimated token count
 */
export function estimateTokenCount(messages: AIMessage[], model: string): number {
  const logger = getLogger();
  try {
    let encoding;
    try {
      // Try to get model-specific encoding
      encoding = encoding_for_model(model as Parameters<typeof encoding_for_model>[0]);
    } catch {
      // Fall back to cl100k_base (GPT-4 / ChatGPT default)
      encoding = get_encoding("cl100k_base");
    }

    let totalTokens = 0;

    for (const message of messages) {
      // Per-message overhead (role tokens, separators)
      totalTokens += 4;
      totalTokens += encoding.encode(message.role).length;

      if (typeof message.content === "string") {
        totalTokens += encoding.encode(message.content).length;
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === "text" && part.text) {
            totalTokens += encoding.encode(part.text).length;
          } else if (part.type === "image_url") {
            // Approximate image token count (varies by resolution)
            // Using conservative estimate for high-detail images
            totalTokens += 85;
          }
        }
      }

      // Count reasoning content if present
      if (message.reasoning) {
        totalTokens += encoding.encode(message.reasoning).length;
      }
    }

    // Reply priming
    totalTokens += 2;

    encoding.free();
    return totalTokens;
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : "Unknown error", model },
      "Failed to estimate tokens with tiktoken, using fallback estimation"
    );

    // Fallback: rough character-based estimate (1 token ≈ 4 characters)
    return estimateTokenCountFallback(messages);
  }
}

/**
 * Fallback token estimation using character count
 *
 * @param messages - Array of AI messages
 * @returns Estimated token count
 */
function estimateTokenCountFallback(messages: AIMessage[]): number {
  let totalCharacters = 0;

  for (const message of messages) {
    totalCharacters += message.role.length;

    if (typeof message.content === "string") {
      totalCharacters += message.content.length;
    } else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === "text" && part.text) {
          totalCharacters += part.text.length;
        } else if (part.type === "image_url") {
          // Approximate characters for image tokens
          totalCharacters += 340; // 85 tokens * 4 chars/token
        }
      }
    }

    if (message.reasoning) {
      totalCharacters += message.reasoning.length;
    }
  }

  // Conservative estimate: 1 token ≈ 4 characters
  return Math.ceil(totalCharacters / 4);
}

/**
 * Check if messages will fit within a context window
 *
 * @param messages - Array of AI messages
 * @param model - Model name
 * @param contextWindow - Context window size in tokens
 * @param maxOutputTokens - Reserved tokens for output
 * @returns Object with fit status and token counts
 */
export function checkContextFit(
  messages: AIMessage[],
  model: string,
  contextWindow: number,
  maxOutputTokens: number = 2000
): {
  fits: boolean;
  estimatedInputTokens: number;
  availableTokens: number;
  contextWindow: number;
} {
  const logger = getLogger();
  const estimatedInputTokens = estimateTokenCount(messages, model);
  const availableTokens = contextWindow - maxOutputTokens;
  const fits = estimatedInputTokens <= availableTokens;

  if (!fits) {
    logger.warn(
      {
        estimatedInputTokens,
        availableTokens,
        contextWindow,
        maxOutputTokens,
      },
      "Messages may not fit in context window"
    );
  }

  return {
    fits,
    estimatedInputTokens,
    availableTokens,
    contextWindow,
  };
}
