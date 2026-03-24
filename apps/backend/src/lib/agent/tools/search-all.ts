/**
 * Search All Tool
 *
 * Search across all content types (notes, bookmarks, documents, media, photos, tasks) at once.
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
    "Search across all content types (notes, bookmarks, documents, media, photos, tasks) at once.",
  accessLevel: "read",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    const results = await findAllEntries({
      userId: ctx.userId,
      text: input.text,
      tagsList: input.tags,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      limit: input.limit,
    });
    return textResult(JSON.stringify(results.items, null, 2));
  },
};
