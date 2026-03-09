/**
 * Get Bookmark Tool
 *
 * Get full details of a single bookmark by ID, including extracted content.
 */

import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { getBookmarkById } from "../../services/bookmarks.js";

const inputSchema = z.object({
  id: z.string().describe("ID of the bookmark to retrieve"),
});

export const getBookmarkTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "getBookmark",
  label: "Get Bookmark",
  description:
    "Get full details of a bookmark by ID, including extracted page content.",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    const result = await getBookmarkById(input.id, ctx.userId);
    if (!result) {
      return errorResult("Bookmark not found");
    }
    return textResult(JSON.stringify(result, null, 2));
  },
};
