/**
 * Create Bookmark Tool
 *
 * Save a URL as a bookmark with optional title, description, and tags.
 */

import { errorResult, textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import {
  createBookmarkAndQueueJob,
  validateAndNormalizeBookmarkUrl,
} from "../../services/bookmarks.js";

const inputSchema = z.object({
  url: z.string().describe("URL to bookmark"),
  title: z.string().optional().describe("Title for the bookmark"),
  description: z
    .string()
    .optional()
    .describe("Description of the bookmark"),
  tags: z.array(z.string()).optional().describe("Tags for the bookmark"),
});

export const createBookmarkTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "createBookmark",
  label: "Create Bookmark",
  description: "Save a URL as a bookmark with optional title, description, and tags.",
  inputSchema,
  promptGuidelines: [
    "Always confirm with the user before creating bookmarks.",
  ],
  execute: async (_callId, input, ctx) => {
    const urlValidation = validateAndNormalizeBookmarkUrl(input.url);
    if (!urlValidation.valid) {
      return errorResult(urlValidation.error || "Invalid URL");
    }

    const result = await createBookmarkAndQueueJob(
      {
        // biome-ignore lint/style/noNonNullAssertion: guarded by validation above
        url: urlValidation.normalizedUrl!,
        userId: ctx.userId,
        rawMetadata: {
          title: input.title,
          description: input.description,
          tags: input.tags,
          processingEnabled: true,
        },
        userAgent: "AI Assistant",
      },
      { userId: ctx.userId, actor: "assistant" },
    );

    if (!result.success) {
      return errorResult(result.error || "Failed to create bookmark");
    }

    return textResult(JSON.stringify(result.bookmark, null, 2));
  },
};
