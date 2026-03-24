/**
 * Delete Photo Tool
 *
 * Delete a photo by ID. Requires user approval.
 */

import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { deletePhoto } from "../../services/photos.js";
import { agentToolCaller } from "./caller.js";

const inputSchema = z.object({
  id: z.string().describe("ID of the photo to delete"),
});

export const deletePhotoTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "deletePhoto",
  label: "Delete Photo",
  description: "Permanently delete a photo and its stored files.",
  accessLevel: "write",
  inputSchema,
  needsApproval: true,
  promptGuidelines: ["Always confirm with the user before deleting photos."],
  execute: async (_callId, input, ctx) => {
    try {
      await deletePhoto(input.id, ctx.userId, agentToolCaller(ctx), true);
      return textResult("Photo deleted successfully.");
    } catch {
      return errorResult("Failed to delete photo. It may not exist.");
    }
  },
};
