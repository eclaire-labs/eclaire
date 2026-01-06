import { type AIMessage, callAI } from "@eclaire/ai";
import type { JobContext } from "@eclaire/queue/core";
import { createChildLogger } from "../../lib/logger.js";

const logger = createChildLogger("task-processor");

interface TaskJobData {
  taskId: string;
  title: string;
  description: string;
  userId: string;
}

/**
 * Generate tags for a task using AI.
 */
async function generateTaskTags(
  title: string,
  description: string,
  taskId: string,
  userId: string,
  jobId?: string,
): Promise<string[]> {
  const content = `Title: ${title}\nDescription: ${description || "No description."}`;
  logger.info({ taskId }, "Calling AI client for task tag generation");

  const messages: AIMessage[] = [
    {
      role: "system",
      content:
        "You are an expert project manager that analyzes tasks and generates relevant tags (e.g., 'marketing', 'bug-fix', 'research', 'design-review'). Always respond with a JSON array of strings containing 2-4 relevant tags.",
    },
    {
      role: "user",
      content: `Based on the following task, generate a list of 2-4 relevant tags as a JSON array of strings.\n\n${content.substring(0, 4000)}\n\nPlease respond with only a JSON array of strings, like: ["tag1", "tag2"]`,
    },
  ];

  try {
    const aiResponse = await callAI(messages, "workers", {
      temperature: 0.2,
      maxTokens: 150,
      timeout: 60000,
      traceMetadata: {
        userId,
        jobId,
        jobType: "task-processing",
        workerType: "task-tag-generation",
      },
    });
    const jsonMatch = aiResponse.content.match(/```json\s*([\s\S]*?)\s*```/);
    const cleanedJsonString = jsonMatch?.[1] || aiResponse.content;
    const parsed = JSON.parse(cleanedJsonString);

    if (Array.isArray(parsed)) {
      return parsed.filter((t: unknown): t is string => typeof t === "string");
    } else if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray(parsed.tags)
    ) {
      return parsed.tags.filter(
        (t: unknown): t is string => typeof t === "string",
      );
    }
    logger.warn(
      { taskId, parsed },
      "Unexpected response format from AI for task tags",
    );
    return [];
  } catch (error) {
    logger.error(
      {
        taskId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "AI tag generation for task failed",
    );
    throw error; // Re-throw to fail the stage
  }
}

/**
 * Main task processing job handler.
 */
async function processTaskJob(ctx: JobContext<TaskJobData>) {
  const { taskId, title, description, userId } = ctx.job.data;
  logger.info(
    { jobId: ctx.job.id, taskId, userId },
    "Starting task processing job",
  );

  const STAGE_NAME = "ai_tagging";
  await ctx.initStages([STAGE_NAME]);

  try {
    await ctx.startStage(STAGE_NAME);
    await ctx.updateStageProgress(STAGE_NAME, 10);

    const tags = await generateTaskTags(
      title,
      description,
      taskId,
      userId,
      ctx.job.id,
    );
    logger.info({ taskId, tags }, "Generated AI tags for task");

    const finalArtifacts = {
      tags: tags,
    };

    // Complete the final stage with artifacts - job completion is implicit when handler returns
    await ctx.completeStage(STAGE_NAME, finalArtifacts);

    logger.info(
      { jobId: ctx.job.id, taskId },
      "Task job completed successfully",
    );
  } catch (error: any) {
    logger.error(
      { jobId: ctx.job.id, taskId, error: error.message },
      "FAILED task processing job",
    );
    await ctx.failStage(STAGE_NAME, error);
    throw error;
  }
}

export default processTaskJob;
