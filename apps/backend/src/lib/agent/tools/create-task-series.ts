/**
 * Create Task Series Tool
 *
 * Creates a recurring task series that spawns task occurrences on a cron schedule.
 */

import {
  textResult,
  errorResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { isValidCronExpression } from "../../queue/cron-utils.js";
import {
  createTaskSeries,
  type CreateTaskSeriesParams,
} from "../../services/task-series.js";

function getAgentActorId(ctx: {
  extra?: Record<string, unknown>;
}): string | undefined {
  if (
    typeof ctx.extra?.agent === "object" &&
    ctx.extra.agent !== null &&
    "id" in ctx.extra.agent &&
    typeof ctx.extra.agent.id === "string"
  ) {
    return ctx.extra.agent.id;
  }
  return undefined;
}

const inputSchema = z.object({
  title: z
    .string()
    .describe(
      "Title template for each occurrence (e.g., 'Daily meeting summary').",
    ),
  description: z
    .string()
    .optional()
    .describe("Description/instructions for what the agent should do."),
  cronExpression: z
    .string()
    .describe(
      "Cron schedule (e.g., '0 9 * * *' for daily at 9am, '0 9 * * 1-5' for weekdays).",
    ),
  assignToSelf: z
    .boolean()
    .optional()
    .describe(
      "If true, assigns to the current AI agent and auto-runs on each occurrence. Default: true.",
    ),
  maxOccurrences: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Maximum number of occurrences before the series completes."),
  endAt: z
    .string()
    .optional()
    .describe("When to stop the series, as ISO 8601 datetime."),
});

export const createTaskSeriesTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "createTaskSeries",
  label: "Create Task Series",
  description:
    "Create a recurring task series. Each occurrence creates a new task, optionally with an agent auto-running on it.",
  accessLevel: "write",
  inputSchema,
  promptGuidelines: [
    "Use this for recurring tasks like 'every morning summarize my meetings' or 'weekly report every Monday'.",
    "Each cron tick creates a new task occurrence with its own status and comments.",
    "By default, assigns to the current agent with assign_and_run policy.",
    "Common cron patterns: daily at 9am = '0 9 * * *', weekdays at 9am = '0 9 * * 1-5', every Monday = '0 9 * * 1'.",
  ],
  execute: async (_callId, input, ctx) => {
    if (!isValidCronExpression(input.cronExpression)) {
      return errorResult(
        `Invalid cron expression: "${input.cronExpression}". Use standard 5-field format like '0 9 * * *'.`,
      );
    }

    const assignToSelf = input.assignToSelf !== false;
    const agentActorId = getAgentActorId(ctx);

    const params: CreateTaskSeriesParams = {
      userId: ctx.userId,
      title: input.title,
      description: input.description,
      cronExpression: input.cronExpression,
      defaultAssigneeActorId: assignToSelf ? agentActorId : undefined,
      executionPolicy: assignToSelf ? "assign_and_run" : "assign_only",
      maxOccurrences: input.maxOccurrences,
      endAt: input.endAt,
    };

    try {
      const series = await createTaskSeries(params);

      return textResult(
        JSON.stringify(
          {
            id: series.id,
            title: series.title,
            schedule: input.cronExpression,
            policy: series.executionPolicy,
            nextOccurrence: series.nextOccurrenceAt,
            status: series.status,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      return errorResult(
        error instanceof Error ? error.message : "Failed to create task series",
      );
    }
  },
};
