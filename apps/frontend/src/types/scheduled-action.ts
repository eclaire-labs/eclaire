export type ScheduledActionKind = "reminder" | "agent_run";
export type ScheduledActionStatus =
  | "active"
  | "paused"
  | "completed"
  | "cancelled";
export type ScheduledActionTriggerType = "once" | "recurring";

export interface ScheduledAction {
  id: string;
  userId: string;
  kind: ScheduledActionKind;
  status: ScheduledActionStatus;
  title: string;
  prompt: string;
  triggerType: ScheduledActionTriggerType;
  runAt: string | null;
  cronExpression: string | null;
  timezone: string | null;
  startAt: string | null;
  endAt: string | null;
  maxRuns: number | null;
  runCount: number;
  deliveryTargets: { type: string; ref?: string }[];
  sourceConversationId: string | null;
  agentActorId: string | null;
  relatedTaskId: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledActionExecution {
  id: string;
  scheduledActionId: string;
  userId: string;
  scheduledFor: string | null;
  startedAt: string | null;
  completedAt: string | null;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  output: string | null;
  error: string | null;
  deliveryResult: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
