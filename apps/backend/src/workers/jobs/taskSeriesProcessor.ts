/**
 * Task Series Processor
 *
 * Fired by the scheduler at each cron tick for a task series.
 * Creates a new task occurrence and optionally triggers an agent run.
 */

import type { JobContext } from "@eclaire/queue/core";
import { createChildLogger } from "../../lib/logger.js";
import { createOccurrence } from "../../lib/services/task-series.js";

const logger = createChildLogger("task-series-processor");

interface TaskSeriesTickData {
  taskSeriesId: string;
  userId: string;
}

async function processTaskSeriesTick(
  ctx: JobContext<TaskSeriesTickData>,
): Promise<void> {
  const { taskSeriesId, userId } = ctx.job.data;

  if (!taskSeriesId || !userId) {
    throw new Error(
      `Missing required job data: taskSeriesId=${taskSeriesId}, userId=${userId}`,
    );
  }

  logger.info(
    { jobId: ctx.job.id, taskSeriesId, userId },
    "Processing task series tick",
  );

  const STAGE_NAME = "create-occurrence";
  await ctx.initStages([STAGE_NAME]);

  try {
    await ctx.startStage(STAGE_NAME);

    const { taskId, agentRunId } = await createOccurrence(taskSeriesId);

    if (!taskId) {
      logger.info(
        { taskSeriesId },
        "No occurrence created (series may be inactive)",
      );
      await ctx.completeStage(STAGE_NAME, { skipped: true });
      return;
    }

    await ctx.completeStage(STAGE_NAME, { taskId, agentRunId });

    logger.info(
      { jobId: ctx.job.id, taskSeriesId, taskId, agentRunId },
      "Task series tick completed",
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      { jobId: ctx.job.id, taskSeriesId, error: errorMessage },
      "Task series tick failed",
    );

    await ctx.failStage(
      STAGE_NAME,
      error instanceof Error ? error : new Error(errorMessage),
    );
    throw error;
  }
}

export default processTaskSeriesTick;
