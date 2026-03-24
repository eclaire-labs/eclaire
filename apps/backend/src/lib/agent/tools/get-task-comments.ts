/**
 * Get Task Comments Tool
 *
 * Get all comments on a task.
 */

import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { getTaskComments } from "../../services/taskComments.js";

const inputSchema = z.object({
  taskId: z.string().describe("ID of the task to get comments for"),
});

export const getTaskCommentsTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "getTaskComments",
  label: "Get Task Comments",
  description: "Get all comments on a task.",
  accessLevel: "read",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    const results = await getTaskComments(input.taskId, ctx.userId);
    if (!results) {
      return errorResult("Task not found");
    }
    return textResult(JSON.stringify(results, null, 2));
  },
};
