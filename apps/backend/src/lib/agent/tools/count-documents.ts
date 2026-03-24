/**
 * Count Documents Tool
 *
 * Count documents matching criteria.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { countDocuments as countDocumentsService } from "../../services/documents.js";

const inputSchema = z.object({
  text: z.string().optional().describe("Full-text search query"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  fileTypes: z
    .array(z.string())
    .optional()
    .describe("Filter by file types (e.g., pdf, docx)"),
  startDate: z.string().optional().describe("Start of date range (ISO format)"),
  endDate: z.string().optional().describe("End of date range (ISO format)"),
});

export const countDocumentsTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "countDocuments",
  label: "Count Documents",
  description: "Count documents matching criteria.",
  accessLevel: "read",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    const count = await countDocumentsService({
      userId: ctx.userId,
      text: input.text,
      tags: input.tags,
      fileTypes: input.fileTypes,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
    });
    return textResult(JSON.stringify({ count }));
  },
};
