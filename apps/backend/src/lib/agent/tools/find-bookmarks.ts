/**
 * Find Bookmarks Tool
 *
 * Search bookmarks by text, tags, and date range.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { findBookmarks as findBookmarksService } from "../../services/bookmarks.js";

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

export const findBookmarksTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "findBookmarks",
  label: "Find Bookmarks",
  description: "Search bookmarks by text, tags, and date range.",
  accessLevel: "read",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    const results = await findBookmarksService({
      userId: ctx.userId,
      text: input.text,
      tags: input.tags,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      limit: input.limit,
    });
    return textResult(JSON.stringify(results, null, 2));
  },
};
