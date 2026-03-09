/**
 * Get Note Tool
 *
 * Get full details of a single note by ID.
 */

import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { getNoteEntryById } from "../../services/notes.js";

const inputSchema = z.object({
  id: z.string().describe("ID of the note to retrieve"),
});

export const getNoteTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "getNote",
  label: "Get Note",
  description:
    "Get full details of a note by ID, including its complete content.",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    const result = await getNoteEntryById(input.id, ctx.userId);
    if (!result) {
      return errorResult("Note not found");
    }
    return textResult(JSON.stringify(result, null, 2));
  },
};
