/**
 * Tool Definition Helper
 *
 * Helper function for creating declarative tool definitions with type inference.
 */

import { z } from "zod";
import { getErrorMessage } from "../logger.js";
import type { ToolExecutionResult } from "../tools/types.js";
import type { AgentContext, AgentToolDefinition, AnyZodType } from "./types.js";

/**
 * Create a declarative tool definition with full type inference.
 *
 * @example
 * ```typescript
 * import { z } from "zod";
 * import { tool } from "@eclaire/ai/agent";
 *
 * const findNotesTool = tool({
 *   name: "findNotes",
 *   description: "Search note entries by text, tags, and date range.",
 *   inputSchema: z.object({
 *     text: z.string().optional().describe("Full-text search query"),
 *     tags: z.array(z.string()).optional().describe("Filter by tags"),
 *     startDate: z.string().datetime().optional(),
 *     endDate: z.string().datetime().optional(),
 *     limit: z.number().optional().default(10),
 *   }),
 *   execute: async (input, context) => {
 *     const results = await searchNotes(context.userId, input);
 *     return {
 *       success: true,
 *       content: JSON.stringify(results, null, 2),
 *     };
 *   },
 * });
 * ```
 */
export function tool<
  TInput extends AnyZodType,
  TContext extends AgentContext = AgentContext,
>(
  definition: AgentToolDefinition<TInput, TContext>,
): AgentToolDefinition<TInput, TContext> {
  return definition;
}

/** Common shape shared by AgentToolDefinition and RuntimeToolDefinition */
interface ToolLike {
  name: string;
  description: string;
  inputSchema: AnyZodType;
}

/**
 * Convert a tool definition to OpenAI ToolDefinition format.
 * Works with both AgentToolDefinition and RuntimeToolDefinition.
 * Uses Zod 4's built-in JSON Schema conversion.
 */
export function toOpenAIToolDefinition(
  tool: ToolLike,
): import("../types.js").ToolDefinition {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: z.toJSONSchema(tool.inputSchema),
    },
  };
}

/**
 * Convert multiple tool definitions to OpenAI format.
 * Works with both AgentToolDefinition and RuntimeToolDefinition.
 */
export function toOpenAITools(
  tools: Record<string, ToolLike>,
): import("../types.js").ToolDefinition[] {
  return Object.values(tools).map(toOpenAIToolDefinition);
}

/**
 * Execute a tool with context and input validation.
 */
export async function executeAgentTool<
  TInput extends AnyZodType,
  TContext extends AgentContext,
>(
  toolDef: AgentToolDefinition<TInput, TContext>,
  rawInput: Record<string, unknown>,
  context: TContext,
): Promise<ToolExecutionResult> {
  // Validate and parse input
  const parseResult = toolDef.inputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return {
      success: false,
      content: "",
      error: `Invalid input: ${parseResult.error.message}`,
    };
  }

  // Check if approval is needed
  if (toolDef.needsApproval) {
    const needsApproval =
      typeof toolDef.needsApproval === "function"
        ? await toolDef.needsApproval(parseResult.data, context)
        : toolDef.needsApproval;

    if (needsApproval) {
      return {
        success: false,
        content: "",
        error: "Tool execution requires approval",
      };
    }
  }

  // Execute the tool
  try {
    return await toolDef.execute(parseResult.data, context);
  } catch (error) {
    return {
      success: false,
      content: "",
      error: getErrorMessage(error),
    };
  }
}
