/**
 * List Task Series Tool
 *
 * Lists the user's recurring task series.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { listTaskSeries } from "../../services/task-series.js";

const inputSchema = z.object({
  status: z
    .enum(["active", "paused", "completed", "cancelled"])
    .optional()
    .describe("Filter by status. Omit to list all."),
});

export const listTaskSeriesTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "listTaskSeries",
  label: "List Task Series",
  description:
    "List the user's recurring task series, optionally filtered by status.",
  accessLevel: "read",
  inputSchema,
  promptGuidelines: [
    "Use this to show the user their recurring task series.",
    "Each series shows title, schedule, status, occurrence count, and next occurrence.",
  ],
  execute: async (_callId, input, ctx) => {
    const results = await listTaskSeries(ctx.userId, {
      status: input.status,
      limit: 20,
    });

    if (results.length === 0) {
      return textResult("No task series found.");
    }

    const summary = results.map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      schedule: s.cronExpression,
      policy: s.executionPolicy,
      occurrences: s.occurrenceCount,
      nextOccurrence: s.nextOccurrenceAt?.toISOString() ?? null,
    }));

    return textResult(JSON.stringify(summary, null, 2));
  },
};
