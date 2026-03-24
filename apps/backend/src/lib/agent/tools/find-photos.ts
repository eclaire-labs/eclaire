/**
 * Find Photos Tool
 *
 * Search photos by tags, date range, and location.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { findPhotos as findPhotosService } from "../../services/photos.js";

const inputSchema = z.object({
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  startDate: z.string().optional().describe("Start of date range (ISO format)"),
  endDate: z.string().optional().describe("End of date range (ISO format)"),
  locationCity: z.string().optional().describe("Filter by city name"),
  dateField: z
    .enum(["createdAt", "dateTaken"])
    .optional()
    .default("dateTaken")
    .describe("Which date field to use for filtering"),
  limit: z
    .number()
    .optional()
    .default(10)
    .describe("Maximum number of results"),
});

export const findPhotosTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "findPhotos",
  label: "Find Photos",
  description: "Search photos by tags, date range, and location.",
  accessLevel: "read",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    const result = await findPhotosService({
      userId: ctx.userId,
      tags: input.tags,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      locationCity: input.locationCity,
      dateField: input.dateField || "dateTaken",
      limit: input.limit,
    });
    return textResult(JSON.stringify(result.items, null, 2));
  },
};
