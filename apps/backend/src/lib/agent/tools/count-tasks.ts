/**
 * Count Tasks Tool
 *
 * Count tasks matching criteria.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import {
  countTasks as countTasksService,
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
});

export const countTasksTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "countTasks",
  label: "Count Tasks",
  description: "Count tasks matching criteria.",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    let validStatus: TaskStatus | undefined;
    if (
      input.status &&
      ["backlog", "not-started", "in-progress", "completed", "cancelled"].includes(input.status)
    ) {
      validStatus = input.status as TaskStatus;
    }

    const count = await countTasksService({
      userId: ctx.userId,
      text: input.text,
      tags: input.tags,
      status: validStatus,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
    });
    return textResult(JSON.stringify({ count }));
  },
};
