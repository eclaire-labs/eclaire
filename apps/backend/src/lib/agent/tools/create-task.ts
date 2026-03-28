/**
 * Create Task Tool
 *
 * Create a new task — work items, reminders, scheduled agent work, recurring tasks.
 * Everything is a task with different properties.
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
  prompt: z
    .string()
    .optional()
    .describe("Instructions for the agent delegate (what to do)"),
  taskStatus: z
    .enum(["open", "in_progress", "blocked", "completed", "cancelled"])
    .optional()
    .default("open")
    .describe("Task status"),
  priority: z
    .number()
    .int()
    .min(0)
    .max(4)
    .optional()
    .default(0)
    .describe("Priority (0=none, 1=urgent, 2=high, 3=medium, 4=low)"),
  tags: z.array(z.string()).optional().describe("Tags for the task"),
  dueDate: z.string().optional().describe("Due date in ISO 8601 format"),
  parentId: z
    .string()
    .optional()
    .describe("Parent task ID to create this as a sub-task"),
  delegateActorId: z
    .string()
    .optional()
    .describe("Actor ID to delegate to (human or agent)"),
  delegateMode: z
    .enum(["manual", "assist", "handle"])
    .optional()
    .describe(
      "manual (human only), assist (agent + review), handle (agent auto-completes)",
    ),
  scheduleType: z
    .enum(["none", "one_time", "recurring"])
    .optional()
    .describe("Schedule type: none, one_time, or recurring"),
  scheduleRule: z
    .string()
    .optional()
    .describe("Cron expression (recurring) or ISO datetime (one_time)"),
  scheduleSummary: z
    .string()
    .optional()
    .describe("Human-readable schedule description"),
  timezone: z
    .string()
    .optional()
    .describe("IANA timezone for schedule interpretation"),
  deliveryTargets: z
    .any()
    .optional()
    .describe(
      "Where to deliver results (e.g., [{type: 'notification_channels'}])",
    ),
  sourceConversationId: z
    .string()
    .optional()
    .describe("Originating conversation ID for context"),
});

export const createTaskTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "createTask",
  label: "Create Task",
  description:
    "Create a new task. Handles all types: work items, reminders, scheduled agent work, and recurring tasks via properties.",
  accessLevel: "write",
  inputSchema,
  promptGuidelines: [
    "Everything is a task. Use createTask for work items, reminders, scheduled agent runs, and recurring tasks.",
    "For a reminder: set scheduleType='one_time', scheduleRule=ISO datetime, deliveryTargets=[{type:'notification_channels'}].",
    "For recurring agent work: set scheduleType='recurring', scheduleRule=cron, delegateActorId=agent, delegateMode='handle'.",
    "For one-time agent work: set delegateActorId=agent, delegateMode='assist' (review) or 'handle' (auto-complete).",
    "Always confirm with the user before creating tasks.",
  ],
  execute: async (_callId, input, ctx) => {
    const result = await createTaskService(
      {
        title: input.title,
        description: input.description,
        prompt: input.prompt,
        taskStatus: input.taskStatus,
        priority: input.priority,
        tags: input.tags,
        dueDate: input.dueDate,
        parentId: input.parentId,
        delegateActorId: input.delegateActorId,
        delegateMode: input.delegateMode,
        scheduleType: input.scheduleType,
        scheduleRule: input.scheduleRule,
        scheduleSummary: input.scheduleSummary,
        timezone: input.timezone,
        deliveryTargets: input.deliveryTargets,
        sourceConversationId: input.sourceConversationId,
      },
      agentToolCaller(ctx),
    );
    return textResult(JSON.stringify(result, null, 2));
  },
};
