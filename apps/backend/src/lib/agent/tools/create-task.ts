/**
 * Create Task Tool
 *
 * Create a new task with title, description, status, priority, tags, due date,
 * and optional recurrence for scheduled/recurring work.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { createTask as createTaskService } from "../../services/tasks.js";
import { agentToolCaller } from "./caller.js";

function getAgentActorId(ctx: {
  extra?: Record<string, unknown>;
}): string | undefined {
  if (
    typeof ctx.extra?.agent === "object" &&
    ctx.extra.agent !== null &&
    "id" in ctx.extra.agent &&
    typeof ctx.extra.agent.id === "string"
  ) {
    return ctx.extra.agent.id;
  }
  return undefined;
}

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
  isRecurring: z
    .boolean()
    .optional()
    .describe("Whether this task should repeat on a schedule"),
  cronExpression: z
    .string()
    .optional()
    .describe(
      "Cron schedule expression (e.g. '0 9 * * *' for daily at 9am, '0 9 * * 1' for every Monday at 9am)",
    ),
  recurrenceEndDate: z
    .string()
    .optional()
    .describe("When to stop recurring, in ISO format (YYYY-MM-DD)"),
  recurrenceLimit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Maximum number of times the task should execute"),
  assignToSelf: z
    .boolean()
    .optional()
    .describe(
      "Assign this task to yourself (the AI agent) for automatic execution. Required for recurring tasks that the agent should perform.",
    ),
});

export const createTaskTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "createTask",
  label: "Create Task",
  description:
    "Create a new task with title, description, status, priority, tags, due date, and optional recurrence schedule.",
  accessLevel: "write",
  inputSchema,
  promptGuidelines: [
    "Always confirm with the user before creating tasks, especially recurring ones. Propose the title, schedule, and assignment first.",
    "When users ask for reminders, periodic summaries, recurring checks, or scheduled work, create a recurring task with a cron expression and set assignToSelf=true so you execute it automatically.",
    "Common cron patterns: daily at 9am = '0 9 * * *', every Monday at 9am = '0 9 * * 1', weekdays at 9am = '0 9 * * 1-5', first of month = '0 9 1 * *', every hour = '0 * * * *'.",
  ],
  execute: async (_callId, input, ctx) => {
    const assigneeActorId = input.assignToSelf
      ? getAgentActorId(ctx)
      : undefined;

    const result = await createTaskService(
      {
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        tags: input.tags,
        dueDate: input.dueDate,
        parentId: input.parentId,
        isRecurring: input.isRecurring,
        cronExpression: input.cronExpression,
        recurrenceEndDate: input.recurrenceEndDate,
        recurrenceLimit: input.recurrenceLimit,
        assigneeActorId,
      },
      agentToolCaller(ctx),
    );
    return textResult(JSON.stringify(result, null, 2));
  },
};
