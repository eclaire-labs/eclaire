/**
 * List Tags Tool
 *
 * List the user's existing tags, optionally filtered by content type or sorted by popularity.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { findPopularTags, findUserTags } from "../../services/tags.js";

const inputSchema = z.object({
  type: z
    .enum(["bookmarks", "documents", "notes", "photos", "tasks"])
    .optional()
    .describe("Filter tags to a specific content type"),
  popular: z
    .boolean()
    .optional()
    .default(false)
    .describe("When true, return tags sorted by usage count"),
  limit: z
    .number()
    .optional()
    .default(20)
    .describe("Maximum number of tags to return (only used with popular=true)"),
});

export const listTagsTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "listTags",
  label: "List Tags",
  description:
    "List the user's existing tags, optionally filtered by content type or sorted by popularity.",
  accessLevel: "read",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    if (input.popular) {
      const results = await findPopularTags(ctx.userId, input.limit);
      return textResult(JSON.stringify(results, null, 2));
    }
    const results = await findUserTags(ctx.userId, input.type);
    return textResult(JSON.stringify(results, null, 2));
  },
};
