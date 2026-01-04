/**
 * Count Bookmarks Tool
 *
 * Count bookmarks matching criteria.
 */

import z from "zod/v4";
import { tool } from "@eclaire/ai";
import { countBookmarks as countBookmarksService } from "../../services/bookmarks.js";
import type { BackendAgentContext } from "../types.js";

const inputSchema = z.object({
  text: z.string().optional().describe("Full-text search query"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  startDate: z.string().optional().describe("Start of date range (ISO format)"),
  endDate: z.string().optional().describe("End of date range (ISO format)"),
});

export const countBookmarksTool = tool<typeof inputSchema, BackendAgentContext>({
  name: "countBookmarks",
  description: "Count bookmarks matching criteria.",
  inputSchema,
  execute: async (input, context) => {
    const count = await countBookmarksService(
      context.userId,
      input.text,
      input.tags,
      input.startDate ? new Date(input.startDate) : undefined,
      input.endDate ? new Date(input.endDate) : undefined,
    );
    return {
      success: true,
      content: JSON.stringify({ count }),
    };
  },
});
