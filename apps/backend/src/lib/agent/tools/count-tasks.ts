/**
 * Count Tasks Tool
 *
 * Count tasks matching criteria.
 */

import z from "zod/v4";
import { tool } from "@eclaire/ai";
import { countTasks as countTasksService, type TaskStatus } from "../../services/tasks.js";
import type { BackendAgentContext } from "../types.js";

const inputSchema = z.object({
  text: z.string().optional().describe("Search query for task title/description"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  status: z.enum(["not-started", "in-progress", "completed"]).optional().describe("Filter by task status"),
  startDate: z.string().optional().describe("Start of date range (ISO format)"),
  endDate: z.string().optional().describe("End of date range (ISO format)"),
});

export const countTasksTool = tool<typeof inputSchema, BackendAgentContext>({
  name: "countTasks",
  description: "Count tasks matching criteria.",
  inputSchema,
  execute: async (input, context) => {
    let validStatus: TaskStatus | undefined;
    if (input.status && ["not-started", "in-progress", "completed"].includes(input.status)) {
      validStatus = input.status as TaskStatus;
    }

    const count = await countTasksService(
      context.userId,
      input.text,
      input.tags,
      validStatus,
      input.startDate ? new Date(input.startDate) : undefined,
      input.endDate ? new Date(input.endDate) : undefined,
    );
    return {
      success: true,
      content: JSON.stringify({ count }),
    };
  },
});
