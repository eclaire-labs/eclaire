/**
 * Get Photo Tool
 *
 * Get full details of a single photo by ID.
 */

import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { getPhotoById } from "../../services/photos.js";

const inputSchema = z.object({
  id: z.string().describe("ID of the photo to retrieve"),
});

export const getPhotoTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "getPhoto",
  label: "Get Photo",
  description:
    "Get full details of a photo by ID, including EXIF data and analysis.",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    const result = await getPhotoById(input.id, ctx.userId);
    if (!result) {
      return errorResult("Photo not found");
    }
    return textResult(JSON.stringify(result, null, 2));
  },
};
