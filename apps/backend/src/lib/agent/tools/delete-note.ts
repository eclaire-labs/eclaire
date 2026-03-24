/**
 * Delete Note Tool
 *
 * Delete a note by ID. Requires user approval.
 */

import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { deleteNoteEntry } from "../../services/notes.js";
import { agentToolCaller } from "./caller.js";

const inputSchema = z.object({
  id: z.string().describe("ID of the note to delete"),
});

export const deleteNoteTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "deleteNote",
  label: "Delete Note",
  description: "Permanently delete a note.",
  inputSchema,
  needsApproval: true,
  promptGuidelines: ["Always confirm with the user before deleting notes."],
  execute: async (_callId, input, ctx) => {
    try {
      await deleteNoteEntry(input.id, ctx.userId, agentToolCaller(ctx));
      return textResult("Note deleted successfully.");
    } catch {
      return errorResult("Failed to delete note. It may not exist.");
    }
  },
};
