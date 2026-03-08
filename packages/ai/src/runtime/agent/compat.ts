/**
 * Compatibility Bridge
 *
 * Wraps legacy AgentToolDefinition tools as RuntimeToolDefinition tools,
 * allowing the backend to use RuntimeAgent without rewriting all tools immediately.
 */

import type { z } from "zod";
import type { AgentContext, AgentToolDefinition } from "../../agent/types.js";
import type { RuntimeToolDefinition, ToolContext } from "../tools/types.js";

// biome-ignore lint/suspicious/noExplicitAny: intentional — Zod requires any for generic schema type alias
type AnyZodType = z.ZodType<any, any, any>;

/**
 * Wrap a legacy AgentToolDefinition as a RuntimeToolDefinition.
 *
 * The legacy tool's `execute(input, context)` signature is adapted to
 * the new `execute(callId, input, ctx, onUpdate)` signature, and
 * string results are wrapped in RuntimeToolResult content blocks.
 */
export function wrapLegacyTool<
  TInput extends AnyZodType,
  TContext extends AgentContext,
>(
  legacyTool: AgentToolDefinition<TInput, TContext>,
  options?: {
    label?: string;
    promptSnippet?: string;
    promptGuidelines?: string[];
    visibility?: "backend" | "cli" | "all";
  },
): RuntimeToolDefinition<TInput> {
  return {
    name: legacyTool.name,
    label: options?.label ?? legacyTool.name,
    description: legacyTool.description,
    inputSchema: legacyTool.inputSchema,
    promptSnippet: options?.promptSnippet,
    promptGuidelines: options?.promptGuidelines,
    visibility: options?.visibility ?? "backend",

    execute: async (callId, input, ctx) => {
      // Build a legacy AgentContext from the new ToolContext
      const legacyContext = {
        userId: ctx.userId,
        requestId: ctx.requestId,
        conversationId: ctx.sessionId,
        startTime: Date.now(),
        abortSignal: ctx.signal,
        userContext: ctx.extra,
      } as TContext;

      const result = await legacyTool.execute(input, legacyContext);

      // Convert legacy ToolExecutionResult to RuntimeToolResult
      if (result.success) {
        return {
          content: [{ type: "text", text: result.content }],
        };
      }
      return {
        content: [{ type: "text", text: result.error || "Unknown error" }],
        isError: true,
      };
    },

    needsApproval: legacyTool.needsApproval
      ? typeof legacyTool.needsApproval === "function"
        ? async (input: z.infer<TInput>, ctx: ToolContext) => {
            const legacyContext = {
              userId: ctx.userId,
              requestId: ctx.requestId,
              conversationId: ctx.sessionId,
              startTime: Date.now(),
              abortSignal: ctx.signal,
              userContext: ctx.extra,
            } as TContext;
            return (legacyTool.needsApproval as Function)(input, legacyContext);
          }
        : legacyTool.needsApproval
      : undefined,
  };
}

/**
 * Wrap an entire record of legacy tools.
 */
export function wrapLegacyTools<TContext extends AgentContext>(
  tools: Record<string, AgentToolDefinition<AnyZodType, TContext>>,
): Record<string, RuntimeToolDefinition<AnyZodType>> {
  const wrapped: Record<string, RuntimeToolDefinition<AnyZodType>> = {};
  for (const [name, tool] of Object.entries(tools)) {
    wrapped[name] = wrapLegacyTool(tool);
  }
  return wrapped;
}
