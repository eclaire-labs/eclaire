/**
 * Count Photos Tool
 *
 * Count photos matching criteria.
 */

import { tool } from "@eclaire/ai";
import z from "zod/v4";
import { countPhotos as countPhotosService } from "../../services/photos.js";
import type { BackendAgentContext } from "../types.js";

const inputSchema = z.object({
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  startDate: z.string().optional().describe("Start of date range (ISO format)"),
  endDate: z.string().optional().describe("End of date range (ISO format)"),
});

export const countPhotosTool = tool<typeof inputSchema, BackendAgentContext>({
  name: "countPhotos",
  description: "Count photos matching criteria.",
  inputSchema,
  execute: async (input, context) => {
    const count = await countPhotosService(
      context.userId,
      input.tags,
      input.startDate ? new Date(input.startDate) : undefined,
      input.endDate ? new Date(input.endDate) : undefined,
      undefined,
      "createdAt",
    );
    return {
      success: true,
      content: JSON.stringify({ count }),
    };
  },
});
