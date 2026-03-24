/**
 * Update Task Tool
 *
 * Update an existing task's title, description, status, priority, tags, due date,
 * or recurrence settings.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { updateTask as updateTaskService } from "../../services/tasks.js";
import { agentToolCaller } from "./caller.js";

const inputSchema = z.object({
  id: z.string().describe("ID of the task to update"),
  title: z.string().optional().describe("New title for the task"),
  description: z.string().optional().describe("New description for the task"),
  status: z
    .enum(["backlog", "not-started", "in-progress", "completed", "cancelled"])
    .optional()
    .describe("New status for the task"),
  priority: z
    .number()
    .int()
    .min(0)
    .max(3)
    .optional()
    .describe("New priority level (0 = none, 1 = low, 2 = medium, 3 = high)"),
  tags: z.array(z.string()).optional().describe("New tags (replaces existing)"),
  dueDate: z
    .string()
    .nullable()
    .optional()
    .describe("New due date in ISO format (YYYY-MM-DD), or null to clear"),
  isRecurring: z
    .boolean()
    .optional()
    .describe("Set to false to stop recurrence, true to enable it"),
  cronExpression: z
    .string()
    .optional()
    .describe("New cron schedule expression"),
  recurrenceEndDate: z
    .string()
    .nullable()
    .optional()
    .describe("New recurrence end date in ISO format, or null to clear"),
  recurrenceLimit: z
    .number()
    .int()
    .min(1)
    .nullable()
    .optional()
    .describe("New maximum execution count, or null to clear"),
});

export const updateTaskTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "updateTask",
  label: "Update Task",
  description:
    "Update a task's title, description, status, priority, tags, due date, or recurrence settings.",
  accessLevel: "write",
  inputSchema,
  promptGuidelines: [
    "Always confirm with the user before modifying tasks.",
    "To stop a recurring task, set isRecurring to false.",
  ],
  execute: async (_callId, input, ctx) => {
    const { id, ...updateData } = input;
    const result = await updateTaskService(
      id,
      updateData,
      agentToolCaller(ctx),
    );
    return textResult(JSON.stringify(result, null, 2));
  },
};
