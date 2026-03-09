/**
 * Create Note Tool
 *
 * Create a new note with text or markdown content.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { createNoteEntry } from "../../services/notes.js";

const inputSchema = z.object({
  title: z.string().describe("Title of the note"),
  content: z.string().describe("Content of the note (plain text or markdown)"),
});

export const createNoteTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "createNote",
  label: "Create Note",
  description: "Create a new note with text or markdown content.",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    const servicePayload = {
      content: input.content,
      metadata: {
        title: input.title,
        tags: [], // Empty initially, will be populated by AI background processing
        processingEnabled: true, // Enable background processing for AI tagging
      },
      originalMimeType: "text/markdown", // Support both plain text and markdown
      userAgent: "AI Assistant",
    };

    const result = await createNoteEntry(servicePayload, ctx.userId);
    return textResult(JSON.stringify(result, null, 2));
  },
};
