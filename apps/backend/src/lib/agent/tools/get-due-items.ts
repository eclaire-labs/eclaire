/**
 * Get Due Items Tool
 *
 * Get items that are overdue, due today, or due this week.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { getDueItems } from "../../services/user-data.js";

const inputSchema = z.object({});

export const getDueItemsTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "getDueItems",
  label: "Get Due Items",
  description:
    "Get items that are overdue, due today, or due this week across all content types.",
  inputSchema,
  execute: async (_callId, _input, ctx) => {
    const results = await getDueItems(ctx.userId);
    return textResult(JSON.stringify(results, null, 2));
  },
};
