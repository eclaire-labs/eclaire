/**
 * Update Photo Tool
 *
 * Update an existing photo's title, description, tags, or due date.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { updatePhotoMetadata } from "../../services/photos.js";
import { agentToolCaller } from "./caller.js";

const inputSchema = z.object({
  id: z.string().describe("ID of the photo to update"),
  title: z.string().optional().describe("New title for the photo"),
  description: z
    .string()
    .nullable()
    .optional()
    .describe("New description for the photo, or null to clear"),
  tags: z.array(z.string()).optional().describe("New tags (replaces existing)"),
  dueDate: z
    .string()
    .nullable()
    .optional()
    .describe("New due date in ISO format (YYYY-MM-DD), or null to clear"),
});

export const updatePhotoTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "updatePhoto",
  label: "Update Photo",
  description: "Update a photo's title, description, tags, or due date.",
  accessLevel: "write",
  inputSchema,
  promptGuidelines: ["Always confirm with the user before modifying photos."],
  execute: async (_callId, input, ctx) => {
    const { id, ...updateData } = input;
    const result = await updatePhotoMetadata(
      id,
      updateData,
      agentToolCaller(ctx),
    );
    return textResult(JSON.stringify(result, null, 2));
  },
};
