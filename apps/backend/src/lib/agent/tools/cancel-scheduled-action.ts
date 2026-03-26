/**
 * Cancel Scheduled Action Tool
 *
 * Allows the agent to cancel an existing scheduled action.
 */

import {
  textResult,
  errorResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { cancelScheduledAction } from "../../services/scheduled-actions.js";

const inputSchema = z.object({
  id: z.string().describe("The ID of the scheduled action to cancel (sa-...)"),
});

export const cancelScheduledActionTool: RuntimeToolDefinition<
  typeof inputSchema
> = {
  name: "cancelScheduledAction",
  label: "Cancel Scheduled Action",
  description:
    "Cancel an active scheduled action (reminder or recurring task). Use listScheduledActions to find the ID first.",
  accessLevel: "write",
  inputSchema,
  promptGuidelines: [
    "Always confirm with the user before cancelling a scheduled action.",
    "Use listScheduledActions first to find the action ID if the user describes it by name.",
  ],
  execute: async (_callId, input, ctx) => {
    try {
      await cancelScheduledAction(input.id, ctx.userId);
      return textResult(
        JSON.stringify({ id: input.id, status: "cancelled" }, null, 2),
      );
    } catch (error) {
      return errorResult(
        error instanceof Error
          ? error.message
          : "Failed to cancel scheduled action",
      );
    }
  },
};
