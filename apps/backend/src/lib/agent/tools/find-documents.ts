/**
 * Find Documents Tool
 *
 * Search documents by text, tags, file types, and date range.
 */

import { tool } from "@eclaire/ai";
import z from "zod/v4";
import { findDocuments as findDocumentsService } from "../../services/documents.js";
import type { BackendAgentContext } from "../types.js";

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

export const findDocumentsTool = tool<typeof inputSchema, BackendAgentContext>({
  name: "findDocuments",
  description:
    "Search documents by full-text, tags, file types, and date range.",
  inputSchema,
  execute: async (input, context) => {
    const results = await findDocumentsService(
      context.userId,
      input.text,
      input.tags,
      input.fileTypes,
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
