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
  ApprovalResponse,
  OnApprovalRequired,
  RuntimeToolDefinition,
  RuntimeToolResult,
  ToolContext,
  ToolUpdateCallback,
} from "../tools/types.js";

// biome-ignore lint/suspicious/noExplicitAny: intentional — Zod requires any for generic schema type alias
type AnyZodType = z.ZodType<any, any, any>;

/**
 * Convert a RuntimeToolDefinition to OpenAI ToolDefinition format.
 *
 * When `__rawJsonSchema` is present (e.g. MCP-sourced tools), it is used
 * directly as the function parameters instead of converting via Zod.
 */
export function runtimeToolToOpenAI(
  tool: RuntimeToolDefinition<AnyZodType>,
): ToolDefinition {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.__rawJsonSchema ?? z.toJSONSchema(tool.inputSchema),
    },
  };
}

/**
 * Execute a RuntimeToolDefinition with input validation and optional approval.
 *
 * When `needsApproval` is true on the tool and an `onApprovalRequired` callback
 * is provided, execution pauses until the user approves or denies (or timeout).
 * If no callback is provided, falls back to returning an error (backwards compat).
 */
export async function executeRuntimeTool(
  toolDef: RuntimeToolDefinition<AnyZodType>,
  callId: string,
  rawInput: Record<string, unknown>,
  context: ToolContext,
  onUpdate?: ToolUpdateCallback,
  onApprovalRequired?: OnApprovalRequired,
  approvalTimeoutMs?: number,
): Promise<RuntimeToolResult> {
  // Validate input
  const parseResult = toolDef.inputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return {
      content: [
        { type: "text", text: `Invalid input: ${parseResult.error.message}` },
      ],
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
      if (!onApprovalRequired) {
        // No callback — backwards-compat error
        return {
          content: [{ type: "text", text: "Tool execution requires approval" }],
          isError: true,
        };
      }

      // Request approval — blocks until user responds or timeout
      const timeout = approvalTimeoutMs ?? 300_000;
      const response = await Promise.race([
        onApprovalRequired({
          toolCallId: callId,
          toolName: toolDef.name,
          toolLabel: toolDef.label,
          arguments: parseResult.data,
        }),
        new Promise<ApprovalResponse>((resolve) =>
          setTimeout(
            () => resolve({ approved: false, reason: "Approval timed out" }),
            timeout,
          ),
        ),
      ]);

      if (!response.approved) {
        return {
          content: [
            {
              type: "text",
              text: response.reason
                ? `Tool execution denied: ${response.reason}`
                : "Tool execution denied by user",
            },
          ],
          isError: true,
        };
      }
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
