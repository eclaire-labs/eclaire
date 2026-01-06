/**
 * Count Notes Tool
 *
 * Count note entries matching criteria.
 */

import { tool } from "@eclaire/ai";
import z from "zod/v4";
import { countNotes as countNotesService } from "../../services/notes.js";
import type { BackendAgentContext } from "../types.js";

const inputSchema = z.object({
  text: z.string().optional().describe("Full-text search query"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  startDate: z.string().optional().describe("Start of date range (ISO format)"),
  endDate: z.string().optional().describe("End of date range (ISO format)"),
});

export const countNotesTool = tool<typeof inputSchema, BackendAgentContext>({
  name: "countNotes",
  description: "Count note entries matching criteria.",
  inputSchema,
  execute: async (input, context) => {
    const count = await countNotesService(
      context.userId,
      input.text,
      input.tags,
      input.startDate ? new Date(input.startDate) : undefined,
      input.endDate ? new Date(input.endDate) : undefined,
    );
    return {
      success: true,
      content: JSON.stringify({ count }),
    };
  },
});
