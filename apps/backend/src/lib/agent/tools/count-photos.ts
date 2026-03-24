/**
 * Count Photos Tool
 *
 * Count photos matching criteria.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { countPhotos as countPhotosService } from "../../services/photos.js";

const inputSchema = z.object({
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  startDate: z.string().optional().describe("Start of date range (ISO format)"),
  endDate: z.string().optional().describe("End of date range (ISO format)"),
});

export const countPhotosTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "countPhotos",
  label: "Count Photos",
  description: "Count photos matching criteria.",
  accessLevel: "read",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    const count = await countPhotosService({
      userId: ctx.userId,
      tags: input.tags,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
    });
    return textResult(JSON.stringify({ count }));
  },
};
