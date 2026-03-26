/**
 * List Scheduled Actions Tool
 *
 * Allows the agent to check what scheduled actions exist for the user.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { listScheduledActions } from "../../services/scheduled-actions.js";

const inputSchema = z.object({
  status: z
    .enum(["active", "paused", "completed", "cancelled"])
    .optional()
    .describe("Filter by status. Defaults to showing all."),
  kind: z
    .enum(["reminder", "agent_run"])
    .optional()
    .describe("Filter by kind."),
});

export const listScheduledActionsTool: RuntimeToolDefinition<
  typeof inputSchema
> = {
  name: "listScheduledActions",
  label: "List Scheduled Actions",
  description:
    "List the user's scheduled actions (reminders, recurring agent tasks). Shows upcoming and recent scheduled actions.",
  accessLevel: "read",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    const actions = await listScheduledActions(ctx.userId, {
      status: input.status,
      kind: input.kind,
      limit: 20,
    });

    if (actions.length === 0) {
      return textResult("No scheduled actions found.");
    }

    const items = actions.map((a) => ({
      id: a.id,
      title: a.title,
      kind: a.kind,
      status: a.status,
      schedule:
        a.triggerType === "once"
          ? (a.runAt?.toISOString() ?? "unknown")
          : (a.cronExpression ?? "unknown"),
      triggerType: a.triggerType,
      nextRunAt: a.nextRunAt?.toISOString() ?? null,
      lastRunAt: a.lastRunAt?.toISOString() ?? null,
      runCount: a.runCount,
    }));

    return textResult(JSON.stringify(items, null, 2));
  },
};
