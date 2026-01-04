/**
 * Create Note Tool
 *
 * Create a new note with text or markdown content.
 */

import z from "zod/v4";
import { tool } from "@eclaire/ai";
import { createNoteEntry } from "../../services/notes.js";
import type { BackendAgentContext } from "../types.js";

const inputSchema = z.object({
  title: z.string().describe("Title of the note"),
  content: z.string().describe("Content of the note (plain text or markdown)"),
});

export const createNoteTool = tool<typeof inputSchema, BackendAgentContext>({
  name: "createNote",
  description: "Create a new note with text or markdown content.",
  inputSchema,
  execute: async (input, context) => {
    const servicePayload = {
      content: input.content,
      metadata: {
        title: input.title,
        tags: [], // Empty initially, will be populated by AI background processing
        enabled: true, // Enable background processing for AI tagging
      },
      originalMimeType: "text/markdown", // Support both plain text and markdown
      userAgent: "AI Assistant",
    };

    const result = await createNoteEntry(servicePayload, context.userId);
    return {
      success: true,
      content: JSON.stringify(result, null, 2),
    };
  },
});
