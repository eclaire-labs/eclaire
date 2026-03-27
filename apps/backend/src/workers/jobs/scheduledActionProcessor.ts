/**
 * Scheduled Action Processor
 *
 * Handles execution of scheduled actions when they fire.
 * - Reminders: sends notification to channels + conversation
 * - Agent runs: invokes AI agent with tools, delivers result
 */

import type { JobContext } from "@eclaire/queue/core";
import { createChildLogger } from "../../lib/logger.js";
import {
  startExecution,
  completeExecution,
  failExecution,
  updateAfterExecution,
  createExecutionRecord,
  getExecutionStatus,
  getScheduledActionStatus,
} from "../../lib/services/scheduled-actions.js";
import { getNotificationChannels } from "../../lib/services/channels.js";
import { channelRegistry } from "../../lib/channels.js";
import { createMessage } from "../../lib/services/messages.js";
import { processPromptRequest } from "../../lib/agent/index.js";
import { DEFAULT_AGENT_ID } from "../../lib/services/agents.js";
import type {
  DeliveryTarget,
  ScheduledActionJobData,
} from "../../lib/queue/types.js";

const logger = createChildLogger("scheduled-action-processor");

// =============================================================================
// Shared Delivery
// =============================================================================

interface DeliveryOptions {
  userId: string;
  message: string;
  deliveryTargets: DeliveryTarget[];
  sourceConversationId?: string;
  agentActorId?: string;
  scheduledActionId: string;
}

/**
 * Deliver a message to the configured targets (channels + conversation).
 */
async function deliverToTargets(
  opts: DeliveryOptions,
): Promise<{ notifiedCount: number; results: Record<string, unknown>[] }> {
  const results: Record<string, unknown>[] = [];
  let notifiedCount = 0;

  for (const target of opts.deliveryTargets) {
    if (target.type === "notification_channels") {
      try {
        const channels = await getNotificationChannels(opts.userId);

        if (channels.length === 0) {
          logger.warn(
            { userId: opts.userId, scheduledActionId: opts.scheduledActionId },
            "No active notification channels for delivery",
          );
          results.push({
            type: "notification_channels",
            success: false,
            error: "No active channels",
          });
          continue;
        }

        const channelResults = await Promise.allSettled(
          channels.map(async (channel) => {
            if (!channelRegistry.has(channel.platform)) {
              return {
                channel: channel.name,
                success: false,
                error: `No adapter for ${channel.platform}`,
              };
            }
            const adapter = channelRegistry.get(channel.platform);
            const result = await adapter.send(channel, opts.message);
            return {
              channel: channel.name,
              success: result.success,
              error: result.error,
            };
          }),
        );

        const processed = channelResults.map((r) =>
          r.status === "fulfilled"
            ? r.value
            : { channel: "unknown", success: false, error: "Send failed" },
        );

        const succeeded = processed.filter((r) => r.success).length;
        notifiedCount += succeeded;

        results.push({
          type: "notification_channels",
          success: succeeded > 0,
          sent: succeeded,
          total: processed.length,
          details: processed,
        });
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            scheduledActionId: opts.scheduledActionId,
          },
          "Failed to deliver to notification channels",
        );
        results.push({
          type: "notification_channels",
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else if (target.type === "conversation") {
      const conversationId = target.ref ?? opts.sourceConversationId;
      if (!conversationId) {
        results.push({
          type: "conversation",
          success: false,
          error: "No conversation ID available",
        });
        continue;
      }

      try {
        await createMessage({
          conversationId,
          role: "assistant",
          authorActorId: opts.agentActorId ?? null,
          content: opts.message,
        });

        notifiedCount++;
        results.push({
          type: "conversation",
          success: true,
          conversationId,
        });
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            conversationId,
            scheduledActionId: opts.scheduledActionId,
          },
          "Failed to deliver to conversation",
        );
        results.push({
          type: "conversation",
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return { notifiedCount, results };
}

// =============================================================================
// Kind-Specific Processors
// =============================================================================

/**
 * Process a reminder: format message and deliver.
 */
async function processReminder(
  data: ScheduledActionJobData,
): Promise<{ output: string; deliveryResult: Record<string, unknown> }> {
  const { title, prompt } = data;
  const message = `🔔 **Reminder**: ${title}${prompt !== title ? `\n${prompt}` : ""}`;

  const { notifiedCount, results } = await deliverToTargets({
    userId: data.userId,
    message,
    deliveryTargets: data.deliveryTargets,
    sourceConversationId: data.sourceConversationId,
    agentActorId: data.agentActorId,
    scheduledActionId: data.scheduledActionId,
  });

  const output =
    notifiedCount > 0
      ? `Reminder delivered to ${notifiedCount} target(s): ${title}`
      : `Reminder delivery failed for all targets: ${title}`;

  return { output, deliveryResult: { targets: results } };
}

/**
 * Process an agent run: invoke the AI agent with the prompt, then deliver the result.
 */
async function processAgentRun(
  data: ScheduledActionJobData,
): Promise<{ output: string; deliveryResult: Record<string, unknown> }> {
  const { title, prompt, userId, agentActorId, scheduledActionId } = data;

  logger.info(
    { scheduledActionId, userId },
    "Running AI agent for scheduled action",
  );

  // Invoke the AI agent with the stored prompt (5 minute timeout)
  const AGENT_RUN_TIMEOUT_MS = 5 * 60 * 1000;
  const requestId = `sa-exec-${scheduledActionId}-${Date.now()}`;
  const agentPromise = processPromptRequest({
    userId,
    prompt,
    context: {
      agentActorId: agentActorId || DEFAULT_AGENT_ID,
      backgroundTaskExecution: true,
    },
    requestId,
    enableThinking: false,
  });
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("Agent run timed out after 5 minutes")),
      AGENT_RUN_TIMEOUT_MS,
    ),
  );
  const result = await Promise.race([agentPromise, timeoutPromise]);

  const agentResponse = result.response || "Agent completed without output.";

  logger.info(
    {
      scheduledActionId,
      responseLength: agentResponse.length,
    },
    "AI agent response generated for scheduled action",
  );

  // Deliver the agent's response
  const formattedMessage = `📋 **${title}**\n\n${agentResponse}`;

  const { notifiedCount, results } = await deliverToTargets({
    userId: data.userId,
    message: formattedMessage,
    deliveryTargets: data.deliveryTargets,
    sourceConversationId: data.sourceConversationId,
    agentActorId: data.agentActorId,
    scheduledActionId: data.scheduledActionId,
  });

  const output =
    notifiedCount > 0
      ? `Agent run completed and delivered to ${notifiedCount} target(s): ${agentResponse.slice(0, 500)}`
      : `Agent run completed but delivery failed: ${agentResponse.slice(0, 500)}`;

  return {
    output,
    deliveryResult: { targets: results, agentResponse },
  };
}

// =============================================================================
// Main Processor
// =============================================================================

/**
 * Main scheduled action processor.
 */
async function processScheduledAction(
  ctx: JobContext<ScheduledActionJobData>,
): Promise<void> {
  const { scheduledActionId, kind, userId } = ctx.job.data;
  let { executionId } = ctx.job.data;

  if (!scheduledActionId || !userId) {
    throw new Error(
      `Missing required job data: scheduledActionId=${scheduledActionId}, userId=${userId}`,
    );
  }

  // Guard: skip if the action was cancelled or deleted since it was enqueued
  const actionStatus = await getScheduledActionStatus(scheduledActionId);
  if (
    !actionStatus ||
    actionStatus === "cancelled" ||
    actionStatus === "completed"
  ) {
    logger.info(
      { jobId: ctx.job.id, scheduledActionId, actionStatus },
      "Skipping execution — action is no longer active",
    );
    return;
  }

  // Idempotency: if this execution already completed (e.g., queue retry), skip it
  if (executionId) {
    const existingStatus = await getExecutionStatus(executionId);
    if (existingStatus === "completed") {
      logger.info(
        { jobId: ctx.job.id, executionId, scheduledActionId },
        "Skipping already-completed execution (idempotency check)",
      );
      return;
    }
  }

  // For recurring jobs (enqueued by scheduler), executionId may be empty.
  // Create one on-the-fly.
  if (!executionId) {
    executionId = await createExecutionRecord(scheduledActionId, userId);
  }

  logger.info(
    {
      jobId: ctx.job.id,
      scheduledActionId,
      executionId,
      kind,
      userId,
    },
    "Starting scheduled action execution",
  );

  const STAGE_NAME = "execute";
  await ctx.initStages([STAGE_NAME]);

  try {
    // Mark execution as running
    await startExecution(executionId);
    await ctx.startStage(STAGE_NAME);
    await ctx.updateStageProgress(STAGE_NAME, 10);

    let output: string;
    let deliveryResult: Record<string, unknown> | undefined;

    if (kind === "reminder") {
      const result = await processReminder(ctx.job.data);
      output = result.output;
      deliveryResult = result.deliveryResult;
    } else if (kind === "agent_run") {
      const result = await processAgentRun(ctx.job.data);
      output = result.output;
      deliveryResult = result.deliveryResult;
    } else {
      throw new Error(`Unknown scheduled action kind: ${kind}`);
    }

    await ctx.updateStageProgress(STAGE_NAME, 90);

    // Mark execution as completed
    await completeExecution(executionId, output, deliveryResult);

    // Update the parent scheduled action
    await updateAfterExecution(scheduledActionId);

    await ctx.completeStage(STAGE_NAME, { output });

    logger.info(
      {
        jobId: ctx.job.id,
        scheduledActionId,
        executionId,
        kind,
      },
      "Scheduled action execution completed",
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Record failure
    try {
      await failExecution(executionId, errorMessage);
      await updateAfterExecution(scheduledActionId);
    } catch (failError) {
      logger.warn(
        { executionId, failError },
        "Failed to record execution failure",
      );
    }

    logger.error(
      {
        jobId: ctx.job.id,
        scheduledActionId,
        executionId,
        error: errorMessage,
      },
      "Scheduled action execution failed",
    );

    await ctx.failStage(
      STAGE_NAME,
      error instanceof Error ? error : new Error(errorMessage),
    );
    throw error;
  }
}

export default processScheduledAction;
