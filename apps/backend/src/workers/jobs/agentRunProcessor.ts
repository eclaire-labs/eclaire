/**
 * Agent Run Processor
 *
 * Executes an AI agent on a task:
 * 1. Marks the task as in-progress
 * 2. Runs the agent with the task prompt + recent comments for context
 * 3. Posts the agent's response as a task comment
 * 4. Marks the task as completed (or hands off to user)
 * 5. Records execution results in the agent_runs table
 */

import type { JobContext } from "@eclaire/queue/core";
import { createChildLogger } from "../../lib/logger.js";
import {
  getAgentRunStatus,
  startAgentRun,
  completeAgentRun,
  failAgentRun,
} from "../../lib/services/agent-runs.js";
import { createTaskComment } from "../../lib/services/taskComments.js";
import { agentCaller } from "../../lib/services/types.js";
import { processPromptRequest } from "../../lib/agent/index.js";
import { DEFAULT_AGENT_ID } from "../../lib/services/agents.js";
import { db, schema } from "../../db/index.js";
import { eq } from "drizzle-orm";
import type { AgentRunJobData } from "../../lib/queue/types.js";

const logger = createChildLogger("agent-run-processor");

const AGENT_RUN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

async function processAgentRunJob(
  ctx: JobContext<AgentRunJobData>,
): Promise<void> {
  const { agentRunId, taskId, userId, executorActorId, prompt } = ctx.job.data;

  if (!agentRunId || !taskId || !userId) {
    throw new Error(
      `Missing required job data: agentRunId=${agentRunId}, taskId=${taskId}, userId=${userId}`,
    );
  }

  // Idempotency: skip if already completed
  const existingStatus = await getAgentRunStatus(agentRunId);
  if (existingStatus === "completed" || existingStatus === "cancelled") {
    logger.info(
      { jobId: ctx.job.id, agentRunId, status: existingStatus },
      "Skipping agent run — already terminal",
    );
    return;
  }

  logger.info(
    { jobId: ctx.job.id, agentRunId, taskId, userId },
    "Starting agent run",
  );

  const STAGE_NAME = "execute";
  await ctx.initStages([STAGE_NAME]);

  try {
    // Mark agent run as running
    await startAgentRun(agentRunId);
    await ctx.startStage(STAGE_NAME);
    await ctx.updateStageProgress(STAGE_NAME, 10);

    // Mark task as in-progress
    try {
      await db
        .update(schema.tasks)
        .set({ status: "in-progress", updatedAt: new Date() })
        .where(eq(schema.tasks.id, taskId));
    } catch (error) {
      logger.warn(
        { taskId, error },
        "Failed to update task status to in-progress (task may be deleted)",
      );
    }

    await ctx.updateStageProgress(STAGE_NAME, 20);

    // Run the agent with timeout
    const requestId = `ar-${agentRunId}-${Date.now()}`;
    const agentPromise = processPromptRequest({
      userId,
      prompt,
      context: {
        agentActorId: executorActorId || DEFAULT_AGENT_ID,
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

    await ctx.updateStageProgress(STAGE_NAME, 80);

    // Post the response as a task comment
    try {
      await createTaskComment(
        { taskId, content: agentResponse },
        agentCaller(executorActorId || DEFAULT_AGENT_ID, userId),
      );
    } catch (error) {
      logger.warn(
        { taskId, agentRunId, error },
        "Failed to post agent response as task comment",
      );
    }

    // Mark agent run as completed
    await completeAgentRun(
      agentRunId,
      agentResponse,
      agentResponse.slice(0, 500),
    );

    // Check execution mode to decide whether to auto-complete or require review
    try {
      const task = await db.query.tasks.findFirst({
        where: eq(schema.tasks.id, taskId),
        columns: { executionMode: true },
      });

      if (task?.executionMode === "agent_assists") {
        // Don't auto-complete — require user review
        await db
          .update(schema.tasks)
          .set({
            reviewStatus: "pending",
            updatedAt: new Date(),
          })
          .where(eq(schema.tasks.id, taskId));
        logger.info(
          { taskId, agentRunId },
          "Task set to pending review (agent_assists mode)",
        );
      } else {
        // agent_handles or manual: auto-complete as before
        await db
          .update(schema.tasks)
          .set({
            status: "completed",
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.tasks.id, taskId));
      }
    } catch (error) {
      logger.warn(
        { taskId, error },
        "Failed to update task after agent run (task may be deleted)",
      );
    }

    await ctx.completeStage(STAGE_NAME, {
      output: agentResponse.slice(0, 200),
    });

    logger.info(
      { jobId: ctx.job.id, agentRunId, taskId },
      "Agent run completed",
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    try {
      await failAgentRun(agentRunId, errorMessage);
    } catch (failError) {
      logger.warn(
        { agentRunId, failError },
        "Failed to record agent run failure",
      );
    }

    logger.error(
      { jobId: ctx.job.id, agentRunId, taskId, error: errorMessage },
      "Agent run failed",
    );

    await ctx.failStage(
      STAGE_NAME,
      error instanceof Error ? error : new Error(errorMessage),
    );
    throw error;
  }
}

export default processAgentRunJob;
