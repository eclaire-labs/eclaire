/**
 * Find Documents Tool
 *
 * Search documents by text, tags, file types, and date range.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { findDocuments as findDocumentsService } from "../../services/documents.js";

const inputSchema = z.object({
  text: z.string().optional().describe("Full-text search query"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  fileTypes: z
    .array(z.string())
    .optional()
    .describe("Filter by file types (e.g., pdf, docx)"),
  startDate: z.string().optional().describe("Start of date range (ISO format)"),
  endDate: z.string().optional().describe("End of date range (ISO format)"),
  limit: z
    .number()
    .optional()
    .default(10)
    .describe("Maximum number of results"),
});

export const findDocumentsTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "findDocuments",
  label: "Find Documents",
  description:
    "Search documents by full-text, tags, file types, and date range.",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    const results = await findDocumentsService({
      userId: ctx.userId,
      text: input.text,
      tags: input.tags,
      fileTypes: input.fileTypes,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      limit: input.limit,
    });
    return textResult(JSON.stringify(results, null, 2));
  },
};
