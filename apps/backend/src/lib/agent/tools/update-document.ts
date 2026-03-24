/**
 * Update Document Tool
 *
 * Update an existing document's title, description, tags, or due date.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { updateDocument } from "../../services/documents.js";
import { agentToolCaller } from "./caller.js";

const inputSchema = z.object({
  id: z.string().describe("ID of the document to update"),
  title: z.string().optional().describe("New title for the document"),
  description: z
    .string()
    .nullable()
    .optional()
    .describe("New description for the document, or null to clear"),
  tags: z.array(z.string()).optional().describe("New tags (replaces existing)"),
  dueDate: z
    .string()
    .nullable()
    .optional()
    .describe("New due date in ISO format (YYYY-MM-DD), or null to clear"),
});

export const updateDocumentTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "updateDocument",
  label: "Update Document",
  description: "Update a document's title, description, tags, or due date.",
  accessLevel: "write",
  inputSchema,
  promptGuidelines: [
    "Always confirm with the user before modifying documents.",
  ],
  execute: async (_callId, input, ctx) => {
    const { id, ...updateData } = input;
    const result = await updateDocument(id, updateData, agentToolCaller(ctx));
    return textResult(JSON.stringify(result, null, 2));
  },
};
