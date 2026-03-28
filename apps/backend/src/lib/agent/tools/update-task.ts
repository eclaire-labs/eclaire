/**
 * Update Task Tool
 *
 * Update an existing task's properties.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { updateTask as updateTaskService } from "../../services/tasks.js";
import { agentToolCaller } from "./caller.js";

const inputSchema = z.object({
  id: z.string().describe("ID of the task to update"),
  title: z.string().optional().describe("New title"),
  description: z.string().optional().describe("New description"),
  prompt: z.string().optional().describe("New agent instructions"),
  taskStatus: z
    .enum(["open", "in_progress", "blocked", "completed", "cancelled"])
    .optional()
    .describe("New status"),
  priority: z
    .number()
    .int()
    .min(0)
    .max(4)
    .optional()
    .describe("New priority (0=none, 1=urgent, 2=high, 3=medium, 4=low)"),
  tags: z.array(z.string()).optional().describe("New tags (replaces existing)"),
  dueDate: z
    .string()
    .nullable()
    .optional()
    .describe("New due date in ISO 8601 format, or null to clear"),
  delegateActorId: z
    .string()
    .nullable()
    .optional()
    .describe("New delegate actor ID, or null to unassign"),
  delegateMode: z
    .enum(["manual", "assist", "handle"])
    .optional()
    .describe("New delegate mode"),
  scheduleType: z
    .enum(["none", "one_time", "recurring"])
    .optional()
    .describe("New schedule type"),
  scheduleRule: z
    .string()
    .nullable()
    .optional()
    .describe("New schedule rule (cron or ISO datetime)"),
  scheduleSummary: z
    .string()
    .nullable()
    .optional()
    .describe("New human-readable schedule summary"),
});

export const updateTaskTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "updateTask",
  label: "Update Task",
  description:
    "Update a task's properties: title, description, status, priority, tags, due date, delegate, schedule, etc.",
  accessLevel: "write",
  inputSchema,
  promptGuidelines: [
    "Always confirm with the user before modifying tasks.",
    "To pause a recurring task, set scheduleType='none'. To resume, restore scheduleType and scheduleRule.",
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
