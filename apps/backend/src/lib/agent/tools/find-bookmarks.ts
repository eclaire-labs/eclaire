/**
 * Find Bookmarks Tool
 *
 * Search bookmarks by text, tags, and date range.
 */

import z from "zod/v4";
import { tool } from "@eclaire/ai";
import { findBookmarks as findBookmarksService } from "../../services/bookmarks.js";
import type { BackendAgentContext } from "../types.js";

const inputSchema = z.object({
  text: z.string().optional().describe("Full-text search query"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  startDate: z.string().optional().describe("Start of date range (ISO format)"),
  endDate: z.string().optional().describe("End of date range (ISO format)"),
  limit: z.number().optional().default(10).describe("Maximum number of results"),
});

export const findBookmarksTool = tool<typeof inputSchema, BackendAgentContext>({
  name: "findBookmarks",
  description: "Search bookmarks by text, tags, and date range.",
  inputSchema,
  execute: async (input, context) => {
    const results = await findBookmarksService(
      context.userId,
      input.text,
      input.tags,
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
