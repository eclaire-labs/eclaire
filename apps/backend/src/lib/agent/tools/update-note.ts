/**
 * Update Note Tool
 *
 * Update an existing note's title, content, tags, or due date.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { updateNoteEntry } from "../../services/notes.js";
import { agentToolCaller } from "./caller.js";

const inputSchema = z.object({
  id: z.string().describe("ID of the note to update"),
  title: z.string().optional().describe("New title for the note"),
  content: z
    .string()
    .optional()
    .describe("New content for the note (plain text or markdown)"),
  tags: z.array(z.string()).optional().describe("New tags (replaces existing)"),
  dueDate: z
    .string()
    .nullable()
    .optional()
    .describe("New due date in ISO format (YYYY-MM-DD), or null to clear"),
});

export const updateNoteTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "updateNote",
  label: "Update Note",
  description: "Update a note's title, content, tags, or due date.",
  accessLevel: "write",
  inputSchema,
  promptGuidelines: ["Always confirm with the user before modifying notes."],
  execute: async (_callId, input, ctx) => {
    const { id, ...updateData } = input;
    const result = await updateNoteEntry(id, updateData, agentToolCaller(ctx));
    return textResult(JSON.stringify(result, null, 2));
  },
};
