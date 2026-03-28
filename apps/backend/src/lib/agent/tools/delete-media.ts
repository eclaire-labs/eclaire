/**
 * Delete Media Tool
 *
 * Delete a media item by ID. Requires user approval.
 */

import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { deleteMedia } from "../../services/media.js";
import { agentToolCaller } from "./caller.js";

const inputSchema = z.object({
  id: z.string().describe("ID of the media item to delete"),
});

export const deleteMediaTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "deleteMedia",
  label: "Delete Media",
  description: "Permanently delete a media item and its stored files.",
  accessLevel: "write",
  inputSchema,
  needsApproval: true,
  promptGuidelines: [
    "Always confirm with the user before deleting media items.",
  ],
  execute: async (_callId, input, ctx) => {
    try {
      await deleteMedia(input.id, ctx.userId, agentToolCaller(ctx), true);
      return textResult("Media item deleted successfully.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to delete media item: ${detail}`);
    }
  },
};
