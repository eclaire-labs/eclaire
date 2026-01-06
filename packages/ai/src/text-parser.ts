import { createAILogger } from "./logger.js";

const logger = createAILogger("text-parser");

/**
 * Tool call extracted from content
 */
export interface ToolCall {
  functionName: string;
  arguments: Record<string, any>;
}

/**
 * Result of parsing text-based content with optional tool calls
 */
export interface TextToolParseResult {
  thinkingContent?: string;
  thinkingSource?: "reasoning_field" | "embedded_tags" | null;
  textResponse?: string;
  toolCalls?: ToolCall[];
  hasToolCalls: boolean;
}

/**
 * Extracts and removes <think> tags from content
 * @param content - The raw content with potential thinking tags
 * @returns Object containing the thinking content (if any) and the cleaned content
 */
export function extractThinkingContent(content: string): {
  thinkingContent: string | null;
  cleanedContent: string;
} {
  const thinkRegex = /<think>\s*([\s\S]*?)\s*<\/think>/i;
  const thinkMatch = content.match(thinkRegex);

  if (thinkMatch && thinkMatch[1]) {
    const thinkingContent = thinkMatch[1].trim();
    const cleanedContent = content.replace(thinkRegex, "").trim();
    return { thinkingContent, cleanedContent };
  }

  return { thinkingContent: null, cleanedContent: content.trim() };
}

/**
 * Extracts tool calls from JSON content
 * @param content - Content that might contain tool calls in JSON format
 * @returns Object with extracted tool calls and remaining content
 */
function extractToolCallsFromContent(content: string): {
  toolCalls: ToolCall[];
  remainingContent: string;
} {
  const toolCalls: ToolCall[] = [];
  let remainingContent = content;

  // FIRST: Look for JSON code blocks that might contain tool calls
  const codeBlockRegex = /```json\s*\n([\s\S]*?)\n```/g;
  const codeBlockMatches = Array.from(
    remainingContent.matchAll(codeBlockRegex),
  );
  const blocksToRemove: string[] = [];

  for (const match of codeBlockMatches) {
    const blockContent = match[1]?.trim();
    // Skip empty code blocks
    if (!blockContent) {
      continue;
    }

    try {
      const parsed = JSON.parse(blockContent);
      if (parsed.type === "tool_calls" && Array.isArray(parsed.calls)) {
        for (const call of parsed.calls) {
          if (call.name && call.args) {
            toolCalls.push({
              functionName: call.name,
              arguments: call.args,
            });
          }
        }
        // Mark this code block for removal
        blocksToRemove.push(match[0]);
      }
    } catch (e) {
      logger.warn(
        { blockContent },
        "Could not parse JSON code block for tool calls",
      );
    }
  }

  // Remove all tool call code blocks after processing
  for (const blockToRemove of blocksToRemove) {
    remainingContent = remainingContent.replace(blockToRemove, "");
  }

  // SECOND: Look for inline JSON objects with type: "tool_calls" (in remaining content)
  const toolCallRegex =
    /\{\s*"type"\s*:\s*"tool_calls"\s*,\s*"calls"\s*:\s*\[[^\]]*\]\s*\}/g;
  const matches = Array.from(remainingContent.matchAll(toolCallRegex));

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed.type === "tool_calls" && Array.isArray(parsed.calls)) {
        for (const call of parsed.calls) {
          if (call.name && call.args) {
            toolCalls.push({
              functionName: call.name,
              arguments: call.args,
            });
          }
        }
      }
      // Remove the matched JSON from remaining content
      remainingContent = remainingContent.replace(match[0], "");
    } catch (e) {
      logger.warn(
        { toolCall: match[0] },
        "Could not parse potential tool call",
      );
    }
  }

  return {
    toolCalls,
    remainingContent: remainingContent.trim(),
  };
}

/**
 * Parses text-based content with optional thinking tags and tool calls
 * @param content - The raw content to parse
 * @param reasoning - Optional reasoning field from AI provider response
 * @returns Parsed result with thinking content, text response, and tool calls
 */
export function parseTextToolContent(
  content: string,
  reasoning?: string,
): TextToolParseResult {
  const result: TextToolParseResult = {
    hasToolCalls: false,
  };

  if (!content || !content.trim()) {
    logger.warn({}, "Content is empty in parseTextToolContent");
    // Still check for reasoning field even if content is empty
    if (reasoning && reasoning.trim()) {
      result.thinkingContent = reasoning.trim();
      result.thinkingSource = "reasoning_field";
    }
    return result;
  }

  // 1. Handle thinking content with precedence logic
  // Reasoning field from AI provider takes precedence over embedded <think> tags
  if (reasoning && reasoning.trim()) {
    result.thinkingContent = reasoning.trim();
    result.thinkingSource = "reasoning_field";
    logger.debug(
      {},
      "Using reasoning field from AI provider as thinking content",
    );
  } else {
    // Fallback to extracting from embedded <think> tags
    const { thinkingContent } = extractThinkingContent(content);
    if (thinkingContent) {
      result.thinkingContent = thinkingContent;
      result.thinkingSource = "embedded_tags";
      logger.debug({}, "Using embedded <think> tags as thinking content");
    }
  }

  // Always extract content without <think> tags for tool calls and text processing
  const { cleanedContent } = extractThinkingContent(content);

  // 2. Extract tool calls from the cleaned content
  const { toolCalls, remainingContent } =
    extractToolCallsFromContent(cleanedContent);
  if (toolCalls.length > 0) {
    result.toolCalls = toolCalls;
    result.hasToolCalls = true;
  }

  // 3. Everything else is treated as text response
  if (remainingContent) {
    result.textResponse = remainingContent;
  }

  return result;
}

/**
 * Extracts the final response text from parse result
 * @param parseResult - The result from parseTextToolContent
 * @returns The final response text or null if not found
 */
export function extractFinalResponse(
  parseResult: TextToolParseResult,
): string | null {
  return parseResult.textResponse || null;
}

/**
 * Extracts tool calls from parse result
 * @param parseResult - The result from parseTextToolContent
 * @returns Array of tool calls or empty array if none found
 */
export function extractToolCalls(parseResult: TextToolParseResult): ToolCall[] {
  return parseResult.toolCalls || [];
}
