import type { Job } from "bullmq";
import { type AIMessage, callAI } from "../../lib/ai-client.js";
import { createChildLogger } from "../../lib/logger.js";
import { createProcessingReporter } from "../lib/processing-reporter.js";

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
async function processTaskJob(job: Job<TaskJobData>) {
  const { taskId, title, description, userId } = job.data;
  logger.info(
    { jobId: job.id, taskId, userId },
    "Starting task processing job",
  );

  const STAGE_NAME = "ai_tagging";
  // Pass jobType to ensure we update the correct job row (tag_generation vs execution)
  const reporter = await createProcessingReporter("tasks", taskId, userId, "tag_generation");
  await reporter.initializeJob([STAGE_NAME]);

  try {
    await reporter.updateStage(STAGE_NAME, "processing", 10);

    const tags = await generateTaskTags(
      title,
      description,
      taskId,
      userId,
      job.id?.toString(),
    );
    logger.info({ taskId, tags }, "Generated AI tags for task");

    const finalArtifacts = {
      tags: tags,
    };

    // Mark the stage as complete.
    await reporter.completeStage(STAGE_NAME);

    // Complete the job and deliver the final artifacts.
    await reporter.completeJob(finalArtifacts);

    logger.info({ jobId: job.id, taskId }, "Task job completed successfully");
  } catch (error: any) {
    logger.error(
      { jobId: job.id, taskId, error: error.message },
      "FAILED task processing job",
    );
    await reporter.reportError(error as Error, STAGE_NAME);
    await reporter.failJob(error.message);
    throw error;
  }
}

export default processTaskJob;
