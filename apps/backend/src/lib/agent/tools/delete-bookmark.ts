/**
 * Delete Bookmark Tool
 *
 * Delete a bookmark by ID. Requires user approval.
 */

import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { deleteBookmark } from "../../services/bookmarks.js";
import { agentToolCaller } from "./caller.js";

const inputSchema = z.object({
  id: z.string().describe("ID of the bookmark to delete"),
});

export const deleteBookmarkTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "deleteBookmark",
  label: "Delete Bookmark",
  description: "Permanently delete a bookmark and its stored assets.",
  accessLevel: "write",
  inputSchema,
  needsApproval: true,
  promptGuidelines: ["Always confirm with the user before deleting bookmarks."],
  execute: async (_callId, input, ctx) => {
    try {
      await deleteBookmark(input.id, ctx.userId, agentToolCaller(ctx), true);
      return textResult("Bookmark deleted successfully.");
    } catch {
      return errorResult("Failed to delete bookmark. It may not exist.");
    }
  },
};
