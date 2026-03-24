/**
 * Delete Task Tool
 *
 * Delete a task by ID. Requires user approval.
 */

import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { deleteTask } from "../../services/tasks.js";
import { agentToolCaller } from "./caller.js";

const inputSchema = z.object({
  id: z.string().describe("ID of the task to delete"),
});

export const deleteTaskTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "deleteTask",
  label: "Delete Task",
  description: "Permanently delete a task and its comments.",
  inputSchema,
  needsApproval: true,
  promptGuidelines: ["Always confirm with the user before deleting tasks."],
  execute: async (_callId, input, ctx) => {
    try {
      await deleteTask(input.id, ctx.userId, agentToolCaller(ctx));
      return textResult("Task deleted successfully.");
    } catch {
      return errorResult("Failed to delete task. It may not exist.");
    }
  },
};
