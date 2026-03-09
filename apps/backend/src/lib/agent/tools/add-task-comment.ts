/**
 * Add Task Comment Tool
 *
 * Add a comment to an existing task.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { createTaskComment } from "../../services/taskComments.js";

const inputSchema = z.object({
  taskId: z.string().describe("ID of the task to comment on"),
  content: z.string().describe("Comment content"),
});

export const addTaskCommentTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "addTaskComment",
  label: "Add Task Comment",
  description: "Add a comment to a task.",
  inputSchema,
  promptGuidelines: [
    "Always confirm with the user before adding task comments.",
  ],
  execute: async (_callId, input, ctx) => {
    const result = await createTaskComment(
      { taskId: input.taskId, content: input.content },
      { userId: ctx.userId, actor: "assistant" },
    );
    return textResult(JSON.stringify(result, null, 2));
  },
};
