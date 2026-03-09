/**
 * Find Notes Tool
 *
 * Search note entries by text, tags, and date range.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { findNotes as findNotesService } from "../../services/notes.js";

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

export const findNotesTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "findNotes",
  label: "Find Notes",
  description: "Search note entries by full-text, tags, and date range.",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    const results = await findNotesService({
      userId: ctx.userId,
      text: input.text,
      tags: input.tags,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      limit: input.limit,
    });
    return textResult(JSON.stringify(results.items, null, 2));
  },
};
