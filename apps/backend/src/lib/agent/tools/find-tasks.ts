/**
 * Find Tasks Tool
 *
 * Search tasks by text, tags, status, and date range.
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
  status: z
    .enum(["backlog", "not-started", "in-progress", "completed", "cancelled"])
    .optional()
    .describe("Filter by task status"),
  startDate: z.string().optional().describe("Start of date range (ISO format)"),
  endDate: z.string().optional().describe("End of date range (ISO format)"),
  parentId: z
    .string()
    .optional()
    .describe("Filter by parent task ID to get sub-tasks"),
  topLevelOnly: z
    .boolean()
    .optional()
    .describe("When true, only return top-level tasks (exclude sub-tasks)"),
  limit: z
    .number()
    .optional()
    .default(10)
    .describe("Maximum number of results"),
});

export const findTasksTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "findTasks",
  label: "Find Tasks",
  description: "Search tasks by keywords, tags, status, and date range.",
  accessLevel: "read",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    let validStatus: TaskStatus | undefined;
    if (
      input.status &&
      [
        "backlog",
        "not-started",
        "in-progress",
        "completed",
        "cancelled",
      ].includes(input.status)
    ) {
      validStatus = input.status as TaskStatus;
    }

    const results = await findTasksService({
      userId: ctx.userId,
      text: input.text,
      tags: input.tags,
      status: validStatus,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      parentId: input.parentId,
      topLevelOnly: input.topLevelOnly,
      limit: input.limit,
    });
    return textResult(JSON.stringify(results.items, null, 2));
  },
};
