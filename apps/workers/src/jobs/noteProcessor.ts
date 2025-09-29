import type { Job } from "bullmq";
import { type AIMessage, callAI } from "../lib/ai-client";
import { createChildLogger } from "../lib/logger";
import { createProcessingReporter } from "../lib/processing-reporter";

const logger = createChildLogger("note-processor");

/**
 * Generate tags for a note using AI.
 * (This function is unchanged)
 */
async function generateNoteTags(
  title: string,
  content: string,
  noteId: string,
  userId: string,
  jobId?: string,
): Promise<string[]> {
  const textContent = content ? content.substring(0, 4000) : "";
  logger.info({ noteId }, "Calling AI client for tag generation");

  const messages: AIMessage[] = [
    {
      role: "system",
      content:
        "You are an expert content analyzer that generates relevant tags for notes. Always respond with a JSON array of strings containing 3-5 relevant tags.",
    },
    {
      role: "user",
      content: `Based on the following note title and content, generate a list of maximum 5 relevant tags as a JSON array of strings. \n\nTitle: "${title}"\nContent: ${textContent}\n\nPlease respond with only a JSON array of strings, like: ["tag1", "tag2", "tag3"]`,
    },
  ];

  try {
    const aiResponse = await callAI(messages, {
      temperature: 0.3,
      maxTokens: 200,
      timeout: 60000,
      traceMetadata: {
        userId,
        jobId,
        jobType: "note-processing",
        workerType: "note-tag-generation",
      },
    });
    const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/);
    const cleanedJsonString = jsonMatch?.[1] || aiResponse;
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
      { noteId, parsed },
      "Unexpected response format from AI for note tags",
    );
    return [];
  } catch (error) {
    logger.error(
      {
        noteId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "AI tag generation failed",
    );
    throw error; // Re-throw to fail the stage
  }
}

/**
 * Main note processing job handler.
 */
async function processNoteJob(job: Job) {
  const { noteId, title, content, userId } = job.data;
  logger.info(
    { jobId: job.id, noteId, userId },
    "Starting note processing job",
  );

  // A note has a very simple, single stage.
  const STAGE_NAME = "ai_tagging";
  const reporter = createProcessingReporter("notes", noteId, userId);
  await reporter.initializeJob([STAGE_NAME]);

  try {
    await reporter.updateStage(STAGE_NAME, "processing", 10);

    let tags: string[] = [];
    try {
      await reporter.updateProgress(STAGE_NAME, 25);
      tags = await generateNoteTags(
        title,
        content,
        noteId,
        userId,
        job.id?.toString(),
      );
      logger.info({ noteId, tags }, "Generated AI tags");
      await reporter.updateProgress(STAGE_NAME, 75);
    } catch (aiError: any) {
      // If AI fails, we no longer just continue. We let the job fail
      // so it can be retried. The user will see the error on the UI.
      logger.error(
        { noteId, error: aiError.message },
        "AI tag generation error",
      );
      // The error will be caught by the main catch block.
      throw aiError;
    }

    // This is the final result of the worker's processing.
    const finalArtifacts = {
      tags: tags,
    };

    // Mark the stage as complete. We don't need to pass artifacts here
    // as we'll send them with completeJob().
    await reporter.completeStage(STAGE_NAME);

    // Complete the job and deliver the final artifacts in one go.
    await reporter.completeJob(finalArtifacts);

    logger.info({ jobId: job.id, noteId }, "Job completed successfully");
  } catch (error: any) {
    logger.error(
      { jobId: job.id, noteId, error: error.message },
      "FAILED note processing job",
    );

    // Report the error on the specific stage and then fail the overall job.
    await reporter.reportError(error as Error, STAGE_NAME);
    await reporter.failJob(error.message);

    // It's important to re-throw so BullMQ knows the job failed.
    throw error;
  }
}

export default processNoteJob;
