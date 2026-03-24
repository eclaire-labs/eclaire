/**
 * Find Media Tool
 *
 * Search media (audio/video) by text, tags, type, and date range.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { findMedia as findMediaService } from "../../services/media.js";

const inputSchema = z.object({
  text: z
    .string()
    .optional()
    .describe(
      "Full-text search query (searches title, description, and transcript)",
    ),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  mediaType: z
    .enum(["audio", "video"])
    .optional()
    .describe("Filter by media type"),
  startDate: z.string().optional().describe("Start of date range (ISO format)"),
  endDate: z.string().optional().describe("End of date range (ISO format)"),
  sortBy: z
    .enum(["createdAt", "title", "duration"])
    .optional()
    .default("createdAt")
    .describe("Sort field"),
  sortDir: z
    .enum(["asc", "desc"])
    .optional()
    .default("desc")
    .describe("Sort direction"),
  limit: z
    .number()
    .optional()
    .default(10)
    .describe("Maximum number of results"),
});

export const findMediaTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "findMedia",
  label: "Find Media",
  description:
    "Search audio and video media by text, tags, type, and date range.",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    const result = await findMediaService({
      userId: ctx.userId,
      text: input.text,
      tags: input.tags,
      mediaType: input.mediaType,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      sortBy: input.sortBy,
      sortDir: input.sortDir,
      limit: input.limit,
    });
    return textResult(JSON.stringify(result.items, null, 2));
  },
};
