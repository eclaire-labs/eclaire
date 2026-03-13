import type { ToolContext } from "@eclaire/ai";
import { agentCaller, type CallerContext } from "../../services/types.js";

export function agentToolCaller(ctx: ToolContext): CallerContext {
  const agentId =
    typeof ctx.extra?.agent === "object" &&
    ctx.extra.agent !== null &&
    "id" in ctx.extra.agent &&
    typeof ctx.extra.agent.id === "string"
      ? ctx.extra.agent.id
      : ctx.userId;

  return agentCaller(agentId, ctx.userId);
}
