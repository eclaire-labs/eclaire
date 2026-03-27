import z from "zod/v4";

export const ScheduledActionSchema = z
  .object({
    kind: z.enum(["reminder", "agent_run"]),
    title: z.string().min(1),
    prompt: z.string().min(1),
    triggerType: z.enum(["once", "recurring"]),
    runAt: z.string().optional(),
    cronExpression: z.string().optional(),
    timezone: z.string().optional(),
    startAt: z.string().optional(),
    endAt: z.string().optional(),
    maxRuns: z.number().int().min(1).optional(),
    deliveryTargets: z
      .array(
        z.object({
          type: z.enum(["notification_channels", "conversation"]),
          ref: z.string().optional(),
        }),
      )
      .optional(),
    sourceConversationId: z.string().optional(),
    agentActorId: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.triggerType === "once") return !!data.runAt;
      if (data.triggerType === "recurring") return !!data.cronExpression;
      return true;
    },
    {
      message:
        "One-time actions require runAt; recurring actions require cronExpression",
    },
  )
  .refine(
    (data) => {
      if (data.triggerType === "once") return !data.cronExpression;
      if (data.triggerType === "recurring") return !data.runAt;
      return true;
    },
    {
      message:
        "One-time actions must not have cronExpression; recurring actions must not have runAt",
    },
  );

export const ScheduledActionSearchParamsSchema = z.object({
  status: z.enum(["active", "paused", "completed", "cancelled"]).optional(),
  kind: z.enum(["reminder", "agent_run"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const ScheduledActionExecutionSearchParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});
