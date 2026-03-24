/**
 * Get Document Tool
 *
 * Get full details of a single document by ID.
 */

import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { getDocumentById } from "../../services/documents.js";

const inputSchema = z.object({
  id: z.string().describe("ID of the document to retrieve"),
});

export const getDocumentTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "getDocument",
  label: "Get Document",
  description:
    "Get full details of a document by ID, including its extracted content.",
  accessLevel: "read",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    const result = await getDocumentById(input.id, ctx.userId);
    if (!result) {
      return errorResult("Document not found");
    }
    return textResult(JSON.stringify(result, null, 2));
  },
};
