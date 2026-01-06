/**
 * Tool Definition Helper
 *
 * Helper function for creating declarative tool definitions with type inference.
 */

import { z } from "zod";
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

/**
 * Convert an AgentToolDefinition to OpenAI ToolDefinition format.
 * Uses Zod 4's built-in JSON Schema conversion.
 */
export function toOpenAIToolDefinition(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agentTool: AgentToolDefinition<AnyZodType, any>,
): import("../types.js").ToolDefinition {
  return {
    type: "function",
    function: {
      name: agentTool.name,
      description: agentTool.description,
      parameters: z.toJSONSchema(agentTool.inputSchema),
    },
  };
}

/**
 * Convert multiple AgentToolDefinitions to OpenAI format.
 * Context type doesn't matter for conversion since we only use name, description, and schema.
 */
export function toOpenAITools(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: Record<string, AgentToolDefinition<AnyZodType, any>>,
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
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
