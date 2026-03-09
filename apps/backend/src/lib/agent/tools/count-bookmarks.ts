/**
 * Count Bookmarks Tool
 *
 * Count bookmarks matching criteria.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { countBookmarks as countBookmarksService } from "../../services/bookmarks.js";

const inputSchema = z.object({
  text: z.string().optional().describe("Full-text search query"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  startDate: z.string().optional().describe("Start of date range (ISO format)"),
  endDate: z.string().optional().describe("End of date range (ISO format)"),
});

export const countBookmarksTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "countBookmarks",
  label: "Count Bookmarks",
  description: "Count bookmarks matching criteria.",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    const count = await countBookmarksService({
      userId: ctx.userId,
      text: input.text,
      tags: input.tags,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
    });
    return textResult(JSON.stringify({ count }));
  },
};
