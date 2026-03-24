/**
 * Count Notes Tool
 *
 * Count note entries matching criteria.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { countNotes as countNotesService } from "../../services/notes.js";

const inputSchema = z.object({
  text: z.string().optional().describe("Full-text search query"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  startDate: z.string().optional().describe("Start of date range (ISO format)"),
  endDate: z.string().optional().describe("End of date range (ISO format)"),
});

export const countNotesTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "countNotes",
  label: "Count Notes",
  description: "Count note entries matching criteria.",
  accessLevel: "read",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    const count = await countNotesService({
      userId: ctx.userId,
      text: input.text,
      tags: input.tags,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
    });
    return textResult(JSON.stringify({ count }));
  },
};
