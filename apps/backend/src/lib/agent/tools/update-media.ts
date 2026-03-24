/**
 * Update Media Tool
 *
 * Update an existing media item's metadata.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { updateMedia } from "../../services/media.js";
import { agentToolCaller } from "./caller.js";

const inputSchema = z.object({
  id: z.string().describe("ID of the media item to update"),
  title: z.string().optional().describe("New title"),
  description: z
    .string()
    .nullable()
    .optional()
    .describe("New description, or null to clear"),
  tags: z.array(z.string()).optional().describe("New tags (replaces existing)"),
  dueDate: z
    .string()
    .nullable()
    .optional()
    .describe("New due date in ISO format (YYYY-MM-DD), or null to clear"),
  reviewStatus: z
    .enum(["pending", "accepted", "rejected"])
    .optional()
    .describe("New review status"),
  flagColor: z
    .enum(["red", "yellow", "orange", "green", "blue"])
    .nullable()
    .optional()
    .describe("Flag color, or null to clear"),
  isPinned: z.boolean().optional().describe("Whether to pin this media item"),
});

export const updateMediaTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "updateMedia",
  label: "Update Media",
  description:
    "Update a media item's title, description, tags, due date, review status, flag, or pin status.",
  inputSchema,
  promptGuidelines: [
    "Always confirm with the user before modifying media items.",
  ],
  execute: async (_callId, input, ctx) => {
    const { id, ...updateData } = input;
    const result = await updateMedia(id, updateData, agentToolCaller(ctx));
    return textResult(JSON.stringify(result, null, 2));
  },
};
