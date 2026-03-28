/**
 * Import Media URL Tool
 *
 * Import audio or video media from a URL.
 */

import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { createMediaFromUrl } from "../../services/media.js";
import { agentToolCaller } from "./caller.js";

const inputSchema = z.object({
  url: z
    .string()
    .url()
    .describe(
      "URL to import media from (YouTube, Vimeo, SoundCloud, direct file URL, etc.)",
    ),
  title: z
    .string()
    .optional()
    .describe(
      "Title for the media item (auto-detected from URL if not provided)",
    ),
  description: z.string().optional().describe("Description for the media item"),
  tags: z.array(z.string()).optional().describe("Tags for the media item"),
});

export const importMediaUrlTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "importMediaUrl",
  label: "Import Media from URL",
  description:
    "Import audio or video from a URL. Supports YouTube, Vimeo, SoundCloud, and direct media file URLs. The media is downloaded and processed in the background.",
  accessLevel: "write",
  inputSchema,
  promptGuidelines: [
    "Always confirm with the user before importing media from URLs.",
    "After importing, inform the user that download and processing happen in the background and may take a few minutes.",
  ],
  execute: async (_callId, input, ctx) => {
    try {
      const result = await createMediaFromUrl(
        {
          url: input.url,
          metadata: {
            title: input.title,
            description: input.description,
            tags: input.tags,
            processingEnabled: true,
          },
          userAgent: "AI Assistant",
        },
        ctx.userId,
        agentToolCaller(ctx),
      );
      return textResult(JSON.stringify(result, null, 2));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to import media from URL: ${detail}`);
    }
  },
};
