/**
 * Delete Document Tool
 *
 * Delete a document by ID. Requires user approval.
 */

import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { deleteDocument } from "../../services/documents.js";
import { agentToolCaller } from "./caller.js";

const inputSchema = z.object({
  id: z.string().describe("ID of the document to delete"),
});

export const deleteDocumentTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "deleteDocument",
  label: "Delete Document",
  description: "Permanently delete a document and its stored files.",
  inputSchema,
  needsApproval: true,
  promptGuidelines: ["Always confirm with the user before deleting documents."],
  execute: async (_callId, input, ctx) => {
    try {
      await deleteDocument(input.id, ctx.userId, agentToolCaller(ctx), true);
      return textResult("Document deleted successfully.");
    } catch {
      return errorResult("Failed to delete document. It may not exist.");
    }
  },
};
