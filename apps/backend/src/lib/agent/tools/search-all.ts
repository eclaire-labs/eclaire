/**
 * Search All Tool
 *
 * Search across all content types (notes, bookmarks, documents, photos, tasks) at once.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { findAllEntries } from "../../services/all.js";

const inputSchema = z.object({
  text: z.string().optional().describe("Full-text search query"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  startDate: z.string().optional().describe("Start of date range (ISO format)"),
  endDate: z.string().optional().describe("End of date range (ISO format)"),
  limit: z
    .number()
    .optional()
    .default(10)
    .describe("Maximum number of results"),
});

export const searchAllTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "searchAll",
  label: "Search All",
  description:
    "Search across all content types (notes, bookmarks, documents, photos, tasks) at once.",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    const results = await findAllEntries(
      ctx.userId,
      input.text,
      input.tags,
      input.startDate ? new Date(input.startDate) : undefined,
      input.endDate ? new Date(input.endDate) : undefined,
      undefined, // types — search all
      input.limit,
    );
    return textResult(JSON.stringify(results, null, 2));
  },
};
