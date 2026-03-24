/**
 * Count Media Tool
 *
 * Count media items matching criteria.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { countMedia as countMediaService } from "../../services/media.js";

const inputSchema = z.object({
  text: z.string().optional().describe("Full-text search query"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  mediaType: z
    .enum(["audio", "video"])
    .optional()
    .describe("Filter by media type"),
  startDate: z.string().optional().describe("Start of date range (ISO format)"),
  endDate: z.string().optional().describe("End of date range (ISO format)"),
});

export const countMediaTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "countMedia",
  label: "Count Media",
  description: "Count audio and video media items matching criteria.",
  accessLevel: "read",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    const count = await countMediaService({
      userId: ctx.userId,
      text: input.text,
      tags: input.tags,
      mediaType: input.mediaType,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
    });
    return textResult(JSON.stringify({ count }));
  },
};
