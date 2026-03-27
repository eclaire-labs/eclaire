/**
 * Schedule Action Tool
 *
 * Create a scheduled action: reminder, recurring agent run, or timed task.
 * Replaces the pattern of using createTask for reminders and scheduled work.
 */

import {
  textResult,
  errorResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import {
  createScheduledAction,
  type CreateScheduledActionParams,
} from "../../services/scheduled-actions.js";
import { isValidCronExpression } from "../../queue/cron-utils.js";
import type { DeliveryTarget } from "../../queue/types.js";

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
    .describe("Short, human-readable label (e.g. 'Go to school')"),
  kind: z
    .enum(["reminder", "agent_run"])
    .describe(
      "Type of action. 'reminder' for simple notifications. 'agent_run' for AI-powered tasks (summaries, searches, etc.).",
    ),
  message: z
    .string()
    .describe(
      "For reminders: the notification text. For agent_run: the prompt/instructions for the AI agent to execute.",
    ),
  triggerAt: z
    .string()
    .optional()
    .describe(
      "For one-off actions: when to fire, as ISO 8601 datetime (e.g. '2026-03-26T14:05:00-04:00'). Convert relative times using current time + user timezone.",
    ),
  cronExpression: z
    .string()
    .optional()
    .describe(
      "For recurring actions: cron schedule (e.g. '0 9 * * *' for daily at 9am, '0 9 * * 1-5' for weekdays at 9am).",
    ),
  relatedTaskId: z
    .string()
    .optional()
    .describe(
      "Optional task ID to link this action to (e.g. 'task-abc123'). Use when scheduling a reminder or follow-up for a specific task.",
    ),
  maxRuns: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Maximum number of times to run (for recurring actions)."),
  endAt: z
    .string()
    .optional()
    .describe(
      "When to stop recurring, as ISO 8601 datetime. Ignored for one-off actions.",
    ),
});

export const scheduleActionTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "scheduleAction",
  label: "Schedule Action",
  description:
    "Schedule a reminder, recurring agent task, or timed action. Use for reminders, periodic summaries, scheduled checks, or any time-based automation.",
  accessLevel: "write",
  inputSchema,
  promptGuidelines: [
    "Use this tool for reminders ('remind me to X in Y minutes') and scheduled agent work ('every morning summarize my tasks').",
    "For one-off actions, provide triggerAt. For recurring actions, provide cronExpression.",
    "Convert relative times ('in 5 minutes', 'tomorrow at 3pm') to absolute ISO 8601 datetime using the current date/time and user timezone.",
    "Use kind='reminder' for simple notifications. Use kind='agent_run' for work requiring AI (summaries, searches, analysis).",
    "Common cron patterns: daily at 9am = '0 9 * * *', weekdays at 9am = '0 9 * * 1-5', every Monday = '0 9 * * 1', hourly = '0 * * * *'.",
    "Do NOT use createTask for reminders or scheduled work — use scheduleAction instead.",
  ],
  execute: async (_callId, input, ctx) => {
    const isRecurring = !!input.cronExpression;
    const isOnce = !!input.triggerAt;

    // Validate: must have one of triggerAt or cronExpression
    if (!isOnce && !isRecurring) {
      return errorResult(
        "Provide either triggerAt (for one-off) or cronExpression (for recurring).",
      );
    }
    if (isOnce && isRecurring) {
      return errorResult(
        "Provide either triggerAt or cronExpression, not both.",
      );
    }

    // Validate cronExpression for recurring
    if (isRecurring && !isValidCronExpression(input.cronExpression as string)) {
      return errorResult(
        `Invalid cron expression: "${input.cronExpression}". Use standard 5-field format like '0 9 * * *' (daily at 9am).`,
      );
    }

    // Validate triggerAt for one-off
    if (isOnce) {
      const triggerDate = new Date(input.triggerAt as string);
      if (Number.isNaN(triggerDate.getTime())) {
        return errorResult(
          `Invalid datetime: ${input.triggerAt}. Use ISO 8601 format like '2026-03-26T14:05:00Z'.`,
        );
      }
      if (triggerDate.getTime() <= Date.now()) {
        return errorResult(
          "The trigger time must be in the future. Please provide a future datetime.",
        );
      }
    }

    // Build delivery targets — notify channels + reply in conversation
    const deliveryTargets: DeliveryTarget[] = [
      { type: "notification_channels" },
    ];

    const conversationId = ctx.sessionId;
    if (conversationId) {
      deliveryTargets.push({ type: "conversation", ref: conversationId });
    }

    const agentActorId = getAgentActorId(ctx);

    const params: CreateScheduledActionParams = {
      userId: ctx.userId,
      kind: input.kind,
      title: input.title,
      prompt: input.message,
      triggerType: isRecurring ? "recurring" : "once",
      runAt: input.triggerAt,
      cronExpression: input.cronExpression,
      endAt: input.endAt,
      maxRuns: input.maxRuns,
      deliveryTargets,
      sourceConversationId: conversationId,
      agentActorId,
      relatedTaskId: input.relatedTaskId,
    };

    try {
      const action = await createScheduledAction(params);

      // Format human-friendly confirmation
      let when: string;
      if (isOnce) {
        const triggerDate = new Date(input.triggerAt as string);
        const timeStr = triggerDate.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
        const dateStr = triggerDate.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
        const isToday =
          new Date().toDateString() === triggerDate.toDateString();
        when = isToday ? `today at ${timeStr}` : `${dateStr} at ${timeStr}`;
      } else {
        when = `recurring (${input.cronExpression})`;
        if (input.maxRuns) when += `, max ${input.maxRuns} runs`;
        if (input.endAt) {
          const endDate = new Date(input.endAt);
          when += `, until ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
        }
      }

      return textResult(
        JSON.stringify(
          {
            id: action.id,
            title: action.title,
            kind: action.kind,
            schedule: when,
            status: action.status,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      return errorResult(
        error instanceof Error
          ? error.message
          : "Failed to create scheduled action",
      );
    }
  },
};
