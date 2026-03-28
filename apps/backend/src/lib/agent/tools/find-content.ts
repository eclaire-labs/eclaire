/**
 * Find Content Tool
 *
 * Unified search across all content types (notes, bookmarks, documents, media, photos, tasks).
 * Replaces the individual find/count tools for notes, bookmarks, documents, media, and photos.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { countAllEntries, findAllEntries } from "../../services/all.js";

const inputSchema = z.object({
  text: z.string().optional().describe("Full-text search query"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  types: z
    .array(z.enum(["note", "bookmark", "document", "media", "photo", "task"]))
    .optional()
    .describe("Content types to search. Omit to search all types."),
  mediaType: z
    .enum(["audio", "video"])
    .optional()
    .describe("Filter media by sub-type (only applies when searching media)."),
  startDate: z.string().optional().describe("Start of date range (ISO format)"),
  endDate: z.string().optional().describe("End of date range (ISO format)"),
  countOnly: z
    .boolean()
    .optional()
    .describe("When true, return only the total count instead of items."),
  limit: z
    .number()
    .optional()
    .default(10)
    .describe("Maximum number of results"),
});

export const findContentTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "findContent",
  label: "Find Content",
  description:
    "Search across your content — notes, bookmarks, documents, media, photos, and tasks. Filter by type, text, tags, and date range. Use findTasks for task-specific filters like status or schedule.",
  accessLevel: "read",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    const commonParams = {
      userId: ctx.userId,
      text: input.text,
      tagsList: input.tags,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      types: input.types,
      mediaType: input.mediaType,
    };

    if (input.countOnly) {
      const count = await countAllEntries(commonParams);
      return textResult(JSON.stringify({ totalCount: count }));
    }

    const results = await findAllEntries({
      ...commonParams,
      limit: input.limit,
    });
    return textResult(JSON.stringify(results.items, null, 2));
  },
};
