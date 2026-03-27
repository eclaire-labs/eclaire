import type { ToolContext } from "@eclaire/ai";
import { agentCaller, type CallerContext } from "../../services/types.js";

/**
 * Extract the agent actor ID from the tool context, if available.
 * Returns undefined if no agent is present.
 */
export function getAgentActorId(ctx: {
  extra?: Record<string, unknown>;
}): string | undefined {
  if (
    typeof ctx.extra?.agent === "object" &&
    ctx.extra.agent !== null &&
    "id" in ctx.extra.agent &&
    typeof ctx.extra.agent.id === "string"
  ) {
    return ctx.extra.agent.id;
  }
  return undefined;
}

export function agentToolCaller(ctx: ToolContext): CallerContext {
  const agentId = getAgentActorId(ctx) ?? ctx.userId;
  return agentCaller(agentId, ctx.userId);
}
