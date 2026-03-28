/**
 * Find Tasks Tool
 *
 * Search tasks by text, tags, status, schedule, delegate, and date range.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import {
  findTasks as findTasksService,
  type TaskStatus,
} from "../../services/tasks.js";

const inputSchema = z.object({
  text: z
    .string()
    .optional()
    .describe("Search query for task title/description"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  taskStatus: z
    .enum(["open", "in_progress", "blocked", "completed", "cancelled"])
    .optional()
    .describe("Filter by task status"),
  attentionStatus: z
    .enum([
      "none",
      "needs_triage",
      "awaiting_input",
      "needs_review",
      "failed",
      "urgent",
    ])
    .optional()
    .describe("Filter by attention status"),
  scheduleType: z
    .enum(["none", "one_time", "recurring"])
    .optional()
    .describe(
      "Filter by schedule type (e.g., 'recurring' for recurring tasks)",
    ),
  delegateMode: z
    .enum(["manual", "assist", "handle"])
    .optional()
    .describe("Filter by delegate mode"),
  startDate: z.string().optional().describe("Start of date range (ISO format)"),
  endDate: z.string().optional().describe("End of date range (ISO format)"),
  parentId: z
    .string()
    .optional()
    .describe("Filter by parent task ID to get sub-tasks"),
  topLevelOnly: z
    .boolean()
    .optional()
    .describe("When true, only return top-level tasks"),
  limit: z
    .number()
    .optional()
    .default(10)
    .describe("Maximum number of results"),
});

export const findTasksTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "findTasks",
  label: "Find Tasks",
  description:
    "Search tasks by keywords, tags, status, schedule type, delegate mode, and date range. Also finds recurring tasks, reminders, and scheduled agent work.",
  accessLevel: "read",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    const results = await findTasksService({
      userId: ctx.userId,
      text: input.text,
      tags: input.tags,
      taskStatus: input.taskStatus as TaskStatus | undefined,
      attentionStatus: input.attentionStatus,
      scheduleType: input.scheduleType,
      delegateModes: input.delegateMode ? [input.delegateMode] : undefined,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      parentId: input.parentId,
      topLevelOnly: input.topLevelOnly,
      limit: input.limit,
    });
    return textResult(JSON.stringify(results.items, null, 2));
  },
};
