/**
 * Get Task Tool
 *
 * Get full details of a single task by ID, including comments and sub-task info.
 */

import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { getTaskById } from "../../services/tasks.js";

const inputSchema = z.object({
  id: z.string().describe("ID of the task to retrieve"),
});

export const getTaskTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "getTask",
  label: "Get Task",
  description:
    "Get full details of a task by ID, including comments and sub-task count.",
  accessLevel: "read",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    const result = await getTaskById(input.id, ctx.userId);
    if (!result) {
      return errorResult("Task not found");
    }
    return textResult(JSON.stringify(result, null, 2));
  },
};
