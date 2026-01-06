/**
 * Find Tasks Tool
 *
 * Search tasks by text, tags, status, and date range.
 */

import { tool } from "@eclaire/ai";
import z from "zod/v4";
import {
  findTasks as findTasksService,
  type TaskStatus,
} from "../../services/tasks.js";
import type { BackendAgentContext } from "../types.js";

const inputSchema = z.object({
  text: z
    .string()
    .optional()
    .describe("Search query for task title/description"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  status: z
    .enum(["not-started", "in-progress", "completed"])
    .optional()
    .describe("Filter by task status"),
  startDate: z.string().optional().describe("Start of date range (ISO format)"),
  endDate: z.string().optional().describe("End of date range (ISO format)"),
  limit: z
    .number()
    .optional()
    .default(10)
    .describe("Maximum number of results"),
});

export const findTasksTool = tool<typeof inputSchema, BackendAgentContext>({
  name: "findTasks",
  description: "Search tasks by keywords, tags, status, and date range.",
  inputSchema,
  execute: async (input, context) => {
    let validStatus: TaskStatus | undefined;
    if (
      input.status &&
      ["not-started", "in-progress", "completed"].includes(input.status)
    ) {
      validStatus = input.status as TaskStatus;
    }

    const results = await findTasksService(
      context.userId,
      input.text,
      input.tags,
      validStatus,
      input.startDate ? new Date(input.startDate) : undefined,
      input.endDate ? new Date(input.endDate) : undefined,
      input.limit,
    );
    return {
      success: true,
      content: JSON.stringify(results, null, 2),
    };
  },
});
