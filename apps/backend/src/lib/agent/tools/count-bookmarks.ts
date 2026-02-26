/**
 * Count Bookmarks Tool
 *
 * Count bookmarks matching criteria.
 */

import { tool } from "@eclaire/ai";
import z from "zod/v4";
import { countBookmarks as countBookmarksService } from "../../services/bookmarks.js";
import type { BackendAgentContext } from "../types.js";

const inputSchema = z.object({
  text: z.string().optional().describe("Full-text search query"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  startDate: z.string().optional().describe("Start of date range (ISO format)"),
  endDate: z.string().optional().describe("End of date range (ISO format)"),
});

export const countBookmarksTool = tool<typeof inputSchema, BackendAgentContext>(
  {
    name: "countBookmarks",
    description: "Count bookmarks matching criteria.",
    inputSchema,
    execute: async (input, context) => {
      const count = await countBookmarksService({
        userId: context.userId,
        text: input.text,
        tags: input.tags,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
      });
      return {
        success: true,
        content: JSON.stringify({ count }),
      };
    },
  },
);
