/**
 * Update Bookmark Tool
 *
 * Update an existing bookmark's title, description, or tags.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { updateBookmark } from "../../services/bookmarks.js";

const inputSchema = z.object({
  id: z.string().describe("ID of the bookmark to update"),
  title: z.string().optional().describe("New title for the bookmark"),
  description: z
    .string()
    .optional()
    .describe("New description for the bookmark"),
  tags: z.array(z.string()).optional().describe("New tags (replaces existing)"),
});

export const updateBookmarkTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "updateBookmark",
  label: "Update Bookmark",
  description: "Update a bookmark's title, description, or tags.",
  inputSchema,
  promptGuidelines: [
    "Always confirm with the user before modifying bookmarks.",
  ],
  execute: async (_callId, input, ctx) => {
    const { id, ...updateData } = input;
    const result = await updateBookmark(id, updateData, {
      userId: ctx.userId,
      actor: "assistant",
    });
    return textResult(JSON.stringify(result, null, 2));
  },
};
