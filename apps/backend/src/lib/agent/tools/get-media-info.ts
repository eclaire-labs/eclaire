/**
 * Get Media Info Tool
 *
 * Preview metadata about a media URL without downloading.
 */

import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import {
  fetchMediaInfo,
  isYtdlpAvailable,
} from "../../../workers/lib/ytdlp.js";

const inputSchema = z.object({
  url: z.string().describe("URL to inspect (YouTube, Vimeo, SoundCloud, etc.)"),
});

export const getMediaInfoTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "getMediaInfo",
  label: "Get Media Info",
  description:
    "Preview metadata about a media URL (title, duration, uploader, type, file size) without downloading it. Useful for checking what a URL contains before importing.",
  accessLevel: "read",
  inputSchema,
  execute: async (_callId, input) => {
    if (!(await isYtdlpAvailable())) {
      return errorResult(
        "Media URL inspection is not available (yt-dlp is not installed).",
      );
    }
    try {
      const info = await fetchMediaInfo(input.url);
      return textResult(JSON.stringify(info, null, 2));
    } catch {
      return errorResult(
        "Failed to fetch media info. The URL may be invalid or unsupported.",
      );
    }
  },
};
