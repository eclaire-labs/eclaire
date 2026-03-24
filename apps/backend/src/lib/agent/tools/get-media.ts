/**
 * Get Media Tool
 *
 * Get full details of a single media item by ID.
 */

import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { getMediaById } from "../../services/media.js";

const inputSchema = z.object({
  id: z.string().describe("ID of the media item to retrieve"),
});

export const getMediaTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "getMedia",
  label: "Get Media",
  description:
    "Get full details of a media item by ID, including metadata, transcript, and processing status.",
  accessLevel: "read",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    const result = await getMediaById(input.id, ctx.userId);
    if (!result) {
      return errorResult("Media not found");
    }
    return textResult(JSON.stringify(result, null, 2));
  },
};
