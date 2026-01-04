/**
 * Count Documents Tool
 *
 * Count documents matching criteria.
 */

import z from "zod/v4";
import { tool } from "@eclaire/ai";
import { countDocuments as countDocumentsService } from "../../services/documents.js";
import type { BackendAgentContext } from "../types.js";

const inputSchema = z.object({
  text: z.string().optional().describe("Full-text search query"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  fileTypes: z.array(z.string()).optional().describe("Filter by file types (e.g., pdf, docx)"),
  startDate: z.string().optional().describe("Start of date range (ISO format)"),
  endDate: z.string().optional().describe("End of date range (ISO format)"),
});

export const countDocumentsTool = tool<typeof inputSchema, BackendAgentContext>({
  name: "countDocuments",
  description: "Count documents matching criteria.",
  inputSchema,
  execute: async (input, context) => {
    const count = await countDocumentsService(
      context.userId,
      input.text,
      input.tags,
      input.fileTypes,
      input.startDate ? new Date(input.startDate) : undefined,
      input.endDate ? new Date(input.endDate) : undefined,
    );
    return {
      success: true,
      content: JSON.stringify({ count }),
    };
  },
});
