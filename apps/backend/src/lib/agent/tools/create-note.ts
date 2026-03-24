/**
 * Create Note Tool
 *
 * Create a new note with text or markdown content.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { createNoteEntry } from "../../services/notes.js";
import { agentToolCaller } from "./caller.js";

const inputSchema = z.object({
  title: z.string().describe("Title of the note"),
  content: z.string().describe("Content of the note (plain text or markdown)"),
  tags: z.array(z.string()).optional().describe("Tags for the note"),
  dueDate: z
    .string()
    .optional()
    .describe("Due date in ISO format (YYYY-MM-DD)"),
});

export const createNoteTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "createNote",
  label: "Create Note",
  description:
    "Create a new note with text or markdown content, optional tags and due date.",
  accessLevel: "write",
  inputSchema,
  promptGuidelines: ["Always confirm with the user before creating notes."],
  execute: async (_callId, input, ctx) => {
    const servicePayload = {
      content: input.content,
      metadata: {
        title: input.title,
        tags: input.tags ?? [],
        processingEnabled: true, // Enable background processing for AI tagging
        dueDate: input.dueDate,
      },
      originalMimeType: "text/markdown",
      userAgent: "AI Assistant",
    };

    const result = await createNoteEntry(servicePayload, agentToolCaller(ctx));
    return textResult(JSON.stringify(result, null, 2));
  },
};
