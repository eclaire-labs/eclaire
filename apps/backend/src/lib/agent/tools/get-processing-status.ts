/**
 * Get Processing Status Tool
 *
 * Check the processing status of content items or get an overall summary.
 */

import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import {
  getProcessingJob,
  getUserProcessingSummary,
} from "../../services/processing-status.js";
import type { AssetType } from "../../../types/assets.js";

const inputSchema = z.object({
  assetType: z
    .enum(["bookmarks", "documents", "photos", "notes", "tasks"])
    .optional()
    .describe("Type of content to check"),
  assetId: z
    .string()
    .optional()
    .describe("Specific asset ID to check (requires assetType)"),
});

export const getProcessingStatusTool: RuntimeToolDefinition<
  typeof inputSchema
> = {
  name: "getProcessingStatus",
  label: "Get Processing Status",
  description:
    "Check the processing status of a specific content item, or get an overall processing summary with counts of pending, processing, completed, and failed items.",
  accessLevel: "read",
  inputSchema,
  promptGuidelines: [
    "When a user reports content not appearing or processing issues, check the processing status to diagnose the problem.",
  ],
  execute: async (_callId, input, ctx) => {
    if (input.assetType && input.assetId) {
      const job = await getProcessingJob(
        input.assetType as AssetType,
        input.assetId,
        ctx.userId,
      );
      if (!job) {
        return errorResult(
          `No processing job found for ${input.assetType} ${input.assetId}`,
        );
      }
      return textResult(JSON.stringify(job, null, 2));
    }

    const summary = await getUserProcessingSummary(ctx.userId);
    return textResult(JSON.stringify(summary, null, 2));
  },
};
