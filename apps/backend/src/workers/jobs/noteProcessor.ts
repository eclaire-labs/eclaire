import { type AIMessage, callAI } from "@eclaire/ai";
import type { JobContext } from "@eclaire/queue/core";
import { createChildLogger } from "../../lib/logger.js";

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
    const aiResponse = await callAI(messages, "workers", {
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

    // Try to parse the AI response
    try {
      // First try to extract from markdown code blocks
      const jsonMatch = aiResponse.content.match(/```json\s*([\s\S]*?)\s*```/);
      const cleanedJsonString = (jsonMatch?.[1] || aiResponse.content).trim();

      // Validate that the string looks like JSON before parsing
      if (
        !cleanedJsonString.startsWith("[") &&
        !cleanedJsonString.startsWith("{")
      ) {
        logger.warn(
          { noteId, response: aiResponse.content.substring(0, 100) },
          "AI response does not appear to be JSON, using empty tags",
        );
        return [];
      }

      const parsed = JSON.parse(cleanedJsonString);

      if (Array.isArray(parsed)) {
        return parsed.filter(
          (t: unknown): t is string => typeof t === "string",
        );
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
    } catch (parseError) {
      logger.error(
        {
          noteId,
          aiResponse: aiResponse.content.substring(0, 200),
          error:
            parseError instanceof Error ? parseError.message : "Unknown error",
        },
        "Failed to parse AI response as JSON, using empty tags",
      );
      return []; // Return empty array instead of throwing
    }
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

interface NoteJobData {
  noteId: string;
  title: string;
  content: string;
  userId: string;
}

/**
 * Main note processing job handler.
 */
async function processNoteJob(ctx: JobContext<NoteJobData>) {
  const { noteId, title, content, userId } = ctx.job.data;
  logger.info(
    { jobId: ctx.job.id, noteId, userId },
    "Starting note processing job",
  );

  // A note has a very simple, single stage.
  const STAGE_NAME = "ai_tagging";
  await ctx.initStages([STAGE_NAME]);

  try {
    await ctx.startStage(STAGE_NAME);
    await ctx.updateStageProgress(STAGE_NAME, 10);

    let tags: string[] = [];
    try {
      await ctx.updateStageProgress(STAGE_NAME, 25);
      tags = await generateNoteTags(title, content, noteId, userId, ctx.job.id);
      logger.info({ noteId, tags }, "Generated AI tags");
      await ctx.updateStageProgress(STAGE_NAME, 75);
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

    // Complete the final stage with artifacts - job completion is implicit when handler returns
    await ctx.completeStage(STAGE_NAME, finalArtifacts);

    logger.info({ jobId: ctx.job.id, noteId }, "Job completed successfully");
  } catch (error: any) {
    logger.error(
      { jobId: ctx.job.id, noteId, error: error.message },
      "FAILED note processing job",
    );

    // Report the error on the specific stage
    await ctx.failStage(STAGE_NAME, error);

    // Re-throw so the queue knows the job failed
    throw error;
  }
}

export default processNoteJob;
