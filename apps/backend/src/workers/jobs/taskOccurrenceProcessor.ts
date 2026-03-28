/**
 * Task Occurrence Processor
 *
 * Unified worker that handles all task occurrence types:
 * - manual_run / scheduled_run / recurring_run: agent execution
 * - reminder: notification delivery
 * - review_run: re-execution after review
 *
 * Replaces: agentRunProcessor, scheduledActionProcessor, taskSeriesProcessor
 */

import { createChildLogger } from "../../lib/logger.js";
import {
  emitOccurrenceStarted,
  emitOccurrenceCompleted,
  emitOccurrenceFailed,
  emitTaskStatusChanged,
} from "../../lib/events/task-events.js";
import type { TaskOccurrenceJobData } from "../../lib/queue/types.js";
import {
  startTaskOccurrence,
  completeTaskOccurrence,
  failTaskOccurrence,
  getTaskOccurrenceStatus,
  setDeliveryResult,
} from "../../lib/services/task-occurrences.js";
import { channelRegistry } from "../../lib/channels.js";
import { getNotificationChannels } from "../../lib/services/channels.js";
import { db, schema } from "../../db/index.js";
import { eq, desc } from "drizzle-orm";

const logger = createChildLogger("task-occurrence-processor");

const EXECUTION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Only update denormalized task fields if this occurrence is the latest one,
 * preventing concurrent occurrences from overwriting each other.
 */
async function updateTaskDenormalized(
  taskId: string,
  occurrenceId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const [latest] = await db
    .select({ id: schema.taskOccurrences.id })
    .from(schema.taskOccurrences)
    .where(eq(schema.taskOccurrences.taskId, taskId))
    .orderBy(desc(schema.taskOccurrences.createdAt))
    .limit(1);

  if (latest && latest.id !== occurrenceId) {
    logger.info(
      { taskId, occurrenceId, latestId: latest.id },
      "Skipping denormalized update — newer occurrence exists",
    );
    return;
  }

  await db.update(schema.tasks).set(fields).where(eq(schema.tasks.id, taskId));
}

// biome-ignore lint/suspicious/noExplicitAny: job context shape varies by queue driver
export default async function processTaskOccurrence(ctx: any): Promise<void> {
  const data = ctx.job.data as TaskOccurrenceJobData;
  const { occurrenceId, taskId, userId, kind, prompt } = data;

  logger.info(
    { occurrenceId, taskId, userId, kind },
    "Processing task occurrence",
  );

  // Idempotency check
  const currentStatus = await getTaskOccurrenceStatus(occurrenceId);
  if (currentStatus && currentStatus !== "queued") {
    logger.info(
      { occurrenceId, currentStatus },
      "Task occurrence already processed, skipping",
    );
    return;
  }

  try {
    // Mark as running
    await startTaskOccurrence(occurrenceId);

    // Update task's denormalized status (guarded against concurrent occurrences)
    await updateTaskDenormalized(taskId, occurrenceId, {
      latestExecutionStatus: "running",
    });

    emitOccurrenceStarted(userId, taskId, occurrenceId);

    if (kind === "reminder") {
      // Reminder: deliver notification
      await processReminder(occurrenceId, taskId, userId, prompt);
    } else {
      // Agent execution (manual_run, scheduled_run, recurring_run, review_run)
      await processAgentExecution(
        occurrenceId,
        taskId,
        userId,
        prompt,
        data.executorActorId,
      );
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error(
      { occurrenceId, taskId, kind, error: errorMessage },
      "Task occurrence failed",
    );
    await failTaskOccurrence(occurrenceId, errorMessage);

    // Update task denormalized status + attention (guarded against concurrent occurrences)
    await updateTaskDenormalized(taskId, occurrenceId, {
      latestExecutionStatus: "failed",
      latestErrorSummary: errorMessage.slice(0, 500),
      attentionStatus: "failed",
    });

    emitOccurrenceFailed(userId, taskId, occurrenceId, errorMessage);
    emitTaskStatusChanged(userId, taskId, { attentionStatus: "failed" });
  }
}

async function processReminder(
  occurrenceId: string,
  taskId: string,
  userId: string,
  prompt: string,
): Promise<void> {
  // Get delivery targets from the task
  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, taskId),
    columns: {
      title: true,
      deliveryTargets: true,
      sourceConversationId: true,
    },
  });

  const message = `🔔 **Reminder**: ${task?.title ?? "Reminder"}\n${prompt}`;

  // Deliver via notification channels
  const deliveryResults: Array<{
    channel: string;
    platform: string;
    success: boolean;
    error?: string;
  }> = [];

  try {
    const targets = task?.deliveryTargets as Array<{
      type: string;
      ref?: string;
    }> | null;
    const targetChannelIds =
      targets
        ?.filter(
          (t): t is { type: string; ref: string } =>
            t.type === "notification_channels" && !!t.ref,
        )
        .map((t) => t.ref) ?? undefined;

    const channels = await getNotificationChannels(
      userId,
      targetChannelIds?.length ? targetChannelIds : undefined,
    );

    if (channels.length === 0) {
      logger.warn(
        { occurrenceId, userId },
        "No active notification channels found for reminder delivery",
      );
    } else {
      const results = await Promise.allSettled(
        channels.map(async (channel) => {
          if (!channelRegistry.has(channel.platform)) {
            return {
              channel: channel.name,
              platform: channel.platform,
              success: false,
              error: `No adapter for platform: ${channel.platform}`,
            };
          }
          const adapter = channelRegistry.get(channel.platform);
          const result = await adapter.send(channel, message);
          return {
            channel: channel.name,
            platform: channel.platform,
            success: result.success,
            error: result.error,
          };
        }),
      );

      for (const r of results) {
        deliveryResults.push(
          r.status === "fulfilled"
            ? r.value
            : {
                channel: "unknown",
                platform: "unknown",
                success: false,
                error: "Send failed",
              },
        );
      }
    }

    await setDeliveryResult(occurrenceId, {
      channels: deliveryResults,
      deliveredAt: new Date().toISOString(),
      successCount: deliveryResults.filter((r) => r.success).length,
      totalCount: deliveryResults.length,
    });
  } catch (err) {
    logger.warn(
      { occurrenceId, error: err },
      "Notification delivery failed, completing occurrence anyway",
    );
    await setDeliveryResult(occurrenceId, {
      channels: deliveryResults,
      deliveredAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : "Unknown delivery error",
    });
  }

  const successCount = deliveryResults.filter((r) => r.success).length;
  const resultSummary =
    deliveryResults.length > 0
      ? `Reminder delivered to ${successCount}/${deliveryResults.length} channels`
      : "Reminder completed (no channels configured)";

  await completeTaskOccurrence(occurrenceId, message, resultSummary);

  // Update task denormalized status
  const noChannelsDelivered = deliveryResults.length === 0;
  await updateTaskDenormalized(taskId, occurrenceId, {
    latestExecutionStatus: "completed",
    latestResultSummary: resultSummary,
    // Surface in inbox if no channels were configured so user knows delivery didn't happen
    ...(noChannelsDelivered && { attentionStatus: "needs_triage" }),
  });

  emitOccurrenceCompleted(userId, taskId, occurrenceId, resultSummary);
  if (noChannelsDelivered) {
    emitTaskStatusChanged(userId, taskId, { attentionStatus: "needs_triage" });
  } else {
    emitTaskStatusChanged(userId, taskId, { taskStatus: "completed" });
  }

  logger.info(
    {
      occurrenceId,
      taskId,
      successCount,
      totalChannels: deliveryResults.length,
    },
    "Reminder delivered",
  );
}

async function processAgentExecution(
  occurrenceId: string,
  taskId: string,
  userId: string,
  prompt: string,
  executorActorId?: string,
): Promise<void> {
  // Get task context
  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, taskId),
    columns: {
      title: true,
      description: true,
      prompt: true,
      delegateMode: true,
      sourceConversationId: true,
    },
  });

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  // Build the effective prompt
  const effectivePrompt =
    prompt || task.prompt || `Work on the task: ${task.title}`;

  const context: Record<string, string> = {};
  if (task.description) context.taskDescription = task.description;
  if (executorActorId) context.agentActorId = executorActorId;

  // Execute via AI agent with timeout
  const { processPromptRequest } = await import(
    "../../lib/agent/prompt-service.js"
  );

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("Agent execution timed out")),
      EXECUTION_TIMEOUT_MS,
    ),
  );

  const result = await Promise.race([
    processPromptRequest({
      userId,
      prompt: effectivePrompt,
      context,
      conversationId: task.sourceConversationId ?? undefined,
    }),
    timeoutPromise,
  ]);

  const output = result.response ?? "";
  const resultSummary = output.slice(0, 500);
  const requiresReview = task.delegateMode === "assist";

  // Complete the occurrence
  await completeTaskOccurrence(occurrenceId, output, resultSummary);

  // Post output as a task comment (skip if agent produced no text output)
  if (output.trim()) {
    try {
      const { createTaskComment: createComment } = await import(
        "../../lib/services/taskComments.js"
      );
      // Use a system caller for agent-generated comments
      await createComment(
        { taskId, content: output },
        {
          actor: "agent",
          actorId: executorActorId ?? userId,
          ownerUserId: userId,
        },
      );
    } catch (_err) {
      logger.warn(
        { occurrenceId, taskId },
        "Failed to post agent output as comment",
      );
    }
  } else {
    logger.warn(
      { occurrenceId, taskId },
      "Agent produced no text output — skipping comment",
    );
  }

  // Update task denormalized status based on review gate
  if (requiresReview) {
    await updateTaskDenormalized(taskId, occurrenceId, {
      latestExecutionStatus: "completed",
      latestResultSummary: resultSummary,
      reviewStatus: "pending",
      attentionStatus: "needs_review",
    });

    // Mark occurrence as awaiting review
    await db
      .update(schema.taskOccurrences)
      .set({ reviewStatus: "pending", requiresReview: true })
      .where(eq(schema.taskOccurrences.id, occurrenceId));

    emitOccurrenceCompleted(userId, taskId, occurrenceId, resultSummary);
    emitTaskStatusChanged(userId, taskId, {
      attentionStatus: "needs_review",
    });
  } else {
    // Auto-complete (handle mode)
    await updateTaskDenormalized(taskId, occurrenceId, {
      latestExecutionStatus: "completed",
      latestResultSummary: resultSummary,
      taskStatus: "completed",
      completedAt: new Date(),
    });

    emitOccurrenceCompleted(userId, taskId, occurrenceId, resultSummary);
    emitTaskStatusChanged(userId, taskId, { taskStatus: "completed" });
  }

  logger.info(
    { occurrenceId, taskId, requiresReview },
    "Agent execution completed",
  );
}
