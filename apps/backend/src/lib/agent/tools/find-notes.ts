/**
 * Find Notes Tool
 *
 * Search note entries by text, tags, and date range.
 */

import { tool } from "@eclaire/ai";
import z from "zod/v4";
import { findNotes as findNotesService } from "../../services/notes.js";
import type { BackendAgentContext } from "../types.js";

const inputSchema = z.object({
  text: z.string().optional().describe("Full-text search query"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  startDate: z.string().optional().describe("Start of date range (ISO format)"),
  endDate: z.string().optional().describe("End of date range (ISO format)"),
  limit: z
    .number()
    .optional()
    .default(10)
    .describe("Maximum number of results"),
});

export const findNotesTool = tool<typeof inputSchema, BackendAgentContext>({
  name: "findNotes",
  description: "Search note entries by full-text, tags, and date range.",
  inputSchema,
  execute: async (input, context) => {
    const results = await findNotesService(
      context.userId,
      input.text,
      input.tags,
      input.startDate ? new Date(input.startDate) : undefined,
      input.endDate ? new Date(input.endDate) : undefined,
      input.limit,
    );
    return {
      success: true,
      content: JSON.stringify(results, null, 2),
    };
  },
});
