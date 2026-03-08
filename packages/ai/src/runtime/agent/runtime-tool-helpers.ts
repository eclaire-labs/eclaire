/**
 * Runtime Tool Helpers
 *
 * Converts RuntimeToolDefinition to OpenAI format and executes tools
 * with the new RuntimeToolResult.
 */

import { z } from "zod";
import { getErrorMessage } from "../../logger.js";
import type { ToolDefinition } from "../../types.js";
import type {
  RuntimeToolDefinition,
  RuntimeToolResult,
  ToolContext,
  ToolUpdateCallback,
} from "../tools/types.js";

// biome-ignore lint/suspicious/noExplicitAny: intentional — Zod requires any for generic schema type alias
type AnyZodType = z.ZodType<any, any, any>;

/**
 * Convert a RuntimeToolDefinition to OpenAI ToolDefinition format.
 */
export function runtimeToolToOpenAI(
  tool: RuntimeToolDefinition<AnyZodType>,
): ToolDefinition {
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
 * Execute a RuntimeToolDefinition with input validation.
 */
export async function executeRuntimeTool(
  toolDef: RuntimeToolDefinition<AnyZodType>,
  callId: string,
  rawInput: Record<string, unknown>,
  context: ToolContext,
  onUpdate?: ToolUpdateCallback,
): Promise<RuntimeToolResult> {
  // Validate input
  const parseResult = toolDef.inputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return {
      content: [{ type: "text", text: `Invalid input: ${parseResult.error.message}` }],
      isError: true,
    };
  }

  // Check approval
  if (toolDef.needsApproval) {
    const needsApproval =
      typeof toolDef.needsApproval === "function"
        ? await toolDef.needsApproval(parseResult.data, context)
        : toolDef.needsApproval;

    if (needsApproval) {
      return {
        content: [{ type: "text", text: "Tool execution requires approval" }],
        isError: true,
      };
    }
  }

  // Execute
  try {
    return await toolDef.execute(callId, parseResult.data, context, onUpdate);
  } catch (error) {
    return {
      content: [{ type: "text", text: getErrorMessage(error) }],
      isError: true,
    };
  }
}
