/**
 * Get History Tool
 *
 * Retrieve recent activity history for the user.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { findHistory } from "../../services/history.js";

const inputSchema = z.object({
  action: z
    .string()
    .optional()
    .describe('Filter by action type (e.g. "create", "update", "delete")'),
  itemType: z
    .string()
    .optional()
    .describe(
      'Filter by item type (e.g. "bookmark", "note", "task", "document", "photo")',
    ),
  startDate: z
    .string()
    .optional()
    .describe("Start date in ISO format (YYYY-MM-DD)"),
  endDate: z
    .string()
    .optional()
    .describe("End date in ISO format (YYYY-MM-DD)"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum number of records to return (default 25)"),
});

export const getHistoryTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "getHistory",
  label: "Get History",
  description:
    "Retrieve recent activity history — what was created, updated, or deleted, and when.",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    const results = await findHistory({
      userId: ctx.userId,
      action: input.action as "create" | "update" | "delete" | undefined,
      itemType: input.itemType as
        | "bookmark"
        | "note"
        | "task"
        | "document"
        | "photo"
        | undefined,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      limit: input.limit ?? 25,
    });
    return textResult(JSON.stringify(results, null, 2));
  },
};
