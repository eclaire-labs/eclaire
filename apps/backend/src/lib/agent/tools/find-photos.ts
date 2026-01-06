/**
 * Find Photos Tool
 *
 * Search photos by tags, date range, and location.
 */

import { tool } from "@eclaire/ai";
import z from "zod/v4";
import { findPhotos as findPhotosService } from "../../services/photos.js";
import type { BackendAgentContext } from "../types.js";

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

export const findPhotosTool = tool<typeof inputSchema, BackendAgentContext>({
  name: "findPhotos",
  description: "Search photos by tags, date range, and location.",
  inputSchema,
  execute: async (input, context) => {
    const results = await findPhotosService(
      context.userId,
      input.tags,
      input.startDate ? new Date(input.startDate) : undefined,
      input.endDate ? new Date(input.endDate) : undefined,
      input.locationCity,
      input.dateField || "dateTaken",
      input.limit,
    );
    return {
      success: true,
      content: JSON.stringify(results, null, 2),
    };
  },
});
