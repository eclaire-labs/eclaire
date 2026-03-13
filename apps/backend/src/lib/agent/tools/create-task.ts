/**
 * Create Task Tool
 *
 * Create a new task with title, description, status, priority, tags, and due date.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { createTask as createTaskService } from "../../services/tasks.js";
import { agentToolCaller } from "./caller.js";

const inputSchema = z.object({
  title: z.string().describe("Title of the task"),
  description: z
    .string()
    .optional()
    .describe("Detailed description of the task"),
  status: z
    .enum(["backlog", "not-started", "in-progress", "completed", "cancelled"])
    .optional()
    .default("not-started")
    .describe("Task status"),
  priority: z
    .number()
    .int()
    .min(0)
    .max(3)
    .optional()
    .default(0)
    .describe("Priority level (0 = none, 1 = low, 2 = medium, 3 = high)"),
  tags: z.array(z.string()).optional().describe("Tags for the task"),
  dueDate: z
    .string()
    .optional()
    .describe("Due date in ISO format (YYYY-MM-DD)"),
  parentId: z
    .string()
    .optional()
    .describe("Parent task ID to create this as a sub-task"),
});

export const createTaskTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "createTask",
  label: "Create Task",
  description:
    "Create a new task with title, description, status, priority, tags, and due date.",
  inputSchema,
  promptGuidelines: ["Always confirm with the user before creating tasks."],
  execute: async (_callId, input, ctx) => {
    const result = await createTaskService(
      {
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        tags: input.tags,
        dueDate: input.dueDate,
        parentId: input.parentId,
      },
      agentToolCaller(ctx),
    );
    return textResult(JSON.stringify(result, null, 2));
  },
};
