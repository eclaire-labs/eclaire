/**
 * Manage Task Series Tool
 *
 * Pause, resume, or cancel a recurring task series.
 */

import {
  textResult,
  errorResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import {
  pauseTaskSeries,
  resumeTaskSeries,
  cancelTaskSeries,
} from "../../services/task-series.js";

const inputSchema = z.object({
  seriesId: z.string().describe("The ID of the task series to manage."),
  action: z
    .enum(["pause", "resume", "cancel"])
    .describe(
      "Action to perform: pause (stop scheduling), resume (restart scheduling), cancel (permanently stop).",
    ),
});

export const manageTaskSeriesTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "manageTaskSeries",
  label: "Manage Task Series",
  description: "Pause, resume, or cancel a recurring task series.",
  accessLevel: "write",
  inputSchema,
  promptGuidelines: [
    "Use this to pause, resume, or cancel a user's recurring task series.",
    "Pause temporarily stops scheduling; resume restarts it. Cancel permanently stops the series.",
    "Always confirm with the user before cancelling a series.",
  ],
  execute: async (_callId, input, ctx) => {
    try {
      switch (input.action) {
        case "pause":
          await pauseTaskSeries(input.seriesId, ctx.userId);
          return textResult(
            `Task series ${input.seriesId} has been paused. No new occurrences will be created until resumed.`,
          );
        case "resume":
          await resumeTaskSeries(input.seriesId, ctx.userId);
          return textResult(
            `Task series ${input.seriesId} has been resumed. Occurrences will be created on schedule.`,
          );
        case "cancel":
          await cancelTaskSeries(input.seriesId, ctx.userId);
          return textResult(
            `Task series ${input.seriesId} has been cancelled. No more occurrences will be created.`,
          );
      }
    } catch (error) {
      return errorResult(
        error instanceof Error ? error.message : "Failed to manage task series",
      );
    }
  },
};
