import type { JobContext } from "@eclaire/queue/core";
import { config } from "../config.js";
import { type AIMessage, callAI } from "../../lib/ai-client.js";
import { createChildLogger } from "../../lib/logger.js";

const logger = createChildLogger("task-execution-processor");

// Configuration flag to control AI processing method
// Set to false for simple AI (default), true for prompt AI with tool access
const USE_PROMPT_AI = true;

interface PromptApiResponse {
  status: string;
  requestId: string;
  type: string;
  response: string;
  conversationId?: string;
  trace?: any;
}

/**
 * Update task status in the backend using assistant-specific endpoint
 */
async function updateTaskStatus(
  taskId: string,
  status: "not-started" | "in-progress" | "completed",
  userId: string,
  assignedAssistantId?: string,
): Promise<void> {
  const backendUrl = config.backend.url;
  const apiKey = config.aiAssistantApiKey; // From central config
  const url = `${backendUrl}/api/tasks/${taskId}/assistant-status`;

  const updates: any = {
    status,
    assignedAssistantId: assignedAssistantId || "user-ai-assistant", // Default assistant ID
  };

  // Set completedAt timestamp when marking as completed
  if (status === "completed") {
    updates.completedAt = new Date().toISOString();
  }

  logger.info(
    {
      taskId,
      status,
      updates,
      url,
      apiKeyPrefix: apiKey.substring(0, 8) + "...",
    },
    "Updating task status",
  );

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const errorText = await response.text();

      // If task was deleted during execution, log a warning but don't fail the job
      if (response.status === 404 && errorText.includes("Task not found")) {
        logger.warn(
          {
            taskId,
            status: response.status,
            errorText,
            url,
          },
          "Task was deleted during execution, skipping status update",
        );
        return; // Gracefully skip the update
      }

      logger.error(
        {
          taskId,
          status: response.status,
          statusText: response.statusText,
          errorText,
          url,
        },
        "Task status update failed",
      );
      throw new Error(
        `Failed to update task status: ${response.status} ${errorText}`,
      );
    }

    const responseData = await response.json();
    logger.info(
      {
        taskId,
        status,
        responseData,
      },
      "Task status updated successfully",
    );
  } catch (error) {
    logger.error(
      {
        taskId,
        status,
        updates,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Exception occurred while updating task status",
    );
    throw error;
  }
}

/**
 * Update lastExecutedAt timestamp on the task
 * Note: Recurrence scheduling is now handled by the queue_schedules table,
 * so we only update lastExecutedAt for display purposes.
 */
async function updateLastExecutedAt(taskId: string): Promise<void> {
  const backendUrl = config.backend.url;
  const apiKey = config.apiKey!; // Validated during startup
  const url = `${backendUrl}/api/tasks/${taskId}/execution-tracking`;

  const updates = { lastExecutedAt: new Date().toISOString() };

  logger.info(
    {
      taskId,
      updates,
      url,
      apiKeyPrefix: apiKey.substring(0, 8) + "...",
    },
    "Updating task lastExecutedAt",
  );

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const errorText = await response.text();

      // If task was deleted during execution, log a warning but don't fail the job
      if (response.status === 404 && errorText.includes("Task not found")) {
        logger.warn(
          {
            taskId,
            status: response.status,
            errorText,
            url,
          },
          "Task was deleted during execution, skipping lastExecutedAt update",
        );
        return; // Gracefully skip the update
      }

      logger.error(
        {
          taskId,
          status: response.status,
          statusText: response.statusText,
          errorText,
          url,
        },
        "Task lastExecutedAt update failed",
      );
      throw new Error(
        `Failed to update lastExecutedAt: ${response.status} ${errorText}`,
      );
    }

    const responseData = await response.json();
    logger.info(
      {
        taskId,
        responseData,
      },
      "Task lastExecutedAt updated successfully",
    );
  } catch (error) {
    logger.error(
      {
        taskId,
        updates,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Exception occurred while updating task lastExecutedAt",
    );
    throw error;
  }
}

interface TaskExecutionJobData {
  taskId: string;
  title: string;
  description: string;
  userId: string;
  assignedToId?: string;
  isAssignedToAI?: boolean;
  isRecurringExecution?: boolean; // Set by scheduler for recurring job executions
}

/**
 * Generate AI assistant response for a task using the direct AI client.
 */
async function generateAIAssistantResponse(
  title: string,
  description: string,
  taskId: string,
): Promise<string> {
  logger.info({ taskId }, "Calling AI client for task response generation");

  const taskContent = `Title: ${title}\nDescription: ${description || "No description provided."}`;

  const messages: AIMessage[] = [
    {
      role: "system",
      content:
        "You are a helpful AI assistant that has been assigned to work on tasks. When you receive a task assignment, analyze it thoughtfully and provide a professional response about how you would approach it, any initial thoughts or questions you have, and any helpful insights. Be concise but thorough.",
    },
    {
      role: "user",
      content: `I have assigned you to work on this task. Please analyze it and provide your response on how you would approach it or any initial thoughts/questions you have.\n\n${taskContent}\n\nPlease provide a thoughtful response about how you would handle this task.`,
    },
  ];

  try {
    const aiResponse = await callAI(messages, "workers", {
      temperature: 0.7,
      maxTokens: 500,
      timeout: 60000,
    });

    logger.info(
      {
        taskId,
        responseLength: aiResponse.content.length,
      },
      "AI response generated successfully for task",
    );

    return aiResponse.content;
  } catch (error) {
    logger.error(
      {
        taskId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "AI response generation for task failed",
    );
    throw error;
  }
}

/**
 * Generate AI assistant response for a task using the prompt API with tool access.
 */
async function generatePromptAIResponse(
  title: string,
  description: string,
  taskId: string,
  userId: string,
): Promise<string> {
  logger.info(
    { taskId, userId },
    "Calling prompt API for task response generation",
  );

  const backendUrl = config.backend.url;
  const apiKey = config.aiAssistantApiKey; // From central config
  const url = `${backendUrl}/api/prompt`;

  const taskContent = `Title: ${title}\nDescription: ${description || "No description provided."}`;
  const prompt = `You have been assigned to work on this task. You need to analyze it and take the necessary actions to complete it using the available tools.\n\nTask Details:\n${taskContent}\n\nPlease complete this task now by searching for relevant information and providing the results.`;

  const requestBody = {
    prompt,
    context: {
      backgroundTaskExecution: true,
    },
    trace: false,
    targetUserId: userId, // Specify that tools should run as the task owner
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        {
          taskId,
          userId,
          status: response.status,
          statusText: response.statusText,
          errorText,
          url,
        },
        "Prompt API call failed",
      );
      throw new Error(
        `Failed to call prompt API: ${response.status} ${errorText}`,
      );
    }

    const responseData = (await response.json()) as PromptApiResponse;
    logger.info(
      {
        taskId,
        userId,
        responseLength: responseData.response?.length || 0,
      },
      "Prompt AI response generated successfully for task",
    );

    return responseData.response || "AI response processing completed.";
  } catch (error) {
    logger.error(
      {
        taskId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Prompt AI response generation for task failed",
    );
    throw error;
  }
}

/**
 * Create a task comment from AI assistant.
 */
async function createTaskComment(
  taskId: string,
  content: string,
): Promise<void> {
  const backendUrl = config.backend.url;
  const apiKey = config.aiAssistantApiKey; // From central config
  const url = `${backendUrl}/api/tasks/${taskId}/comments`;

  logger.info(
    {
      taskId,
      url,
      apiKeyPrefix: apiKey.substring(0, 8) + "...",
      contentLength: content.length,
    },
    "About to create task comment",
  );

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ content }),
    });

    logger.info(
      {
        taskId,
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        url,
      },
      "Received response from task comment API",
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        {
          taskId,
          status: response.status,
          statusText: response.statusText,
          errorText,
          url,
          apiKeyPrefix: apiKey.substring(0, 8) + "...",
        },
        "Task comment API call failed - response details",
      );
      throw new Error(
        `Failed to create comment: ${response.status} ${errorText}`,
      );
    }

    const responseData = await response.json();
    logger.info(
      {
        taskId,
        responseData,
        url,
      },
      "Task comment created successfully with response data",
    );

    logger.info({ taskId }, "AI assistant comment created successfully");
  } catch (error) {
    logger.error(
      {
        taskId,
        url,
        apiKeyPrefix: apiKey.substring(0, 8) + "...",
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Exception occurred while creating task comment",
    );
    logger.error(
      {
        taskId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to create AI assistant comment",
    );
    throw error;
  }
}

// Note: Recurrence is handled by the queue scheduler (queue_schedules table).
// The scheduler automatically creates the next job based on the cron expression.
// This processor only needs to execute the task and update lastExecutedAt.

/**
 * Process user task execution (non-AI assistant)
 */
async function processUserTask(ctx: JobContext<TaskExecutionJobData>) {
  const { taskId, title, userId } = ctx.job.data;

  logger.info({ taskId, userId }, "Processing user task execution");

  // For user tasks, we could:
  // 1. Send notifications
  // 2. Update task status
  // 3. Create reminder comments
  // For now, we'll just log that the task was processed

  const STAGE_NAME = "user_task_processing";
  await ctx.initStages([STAGE_NAME]);

  try {
    // Update lastExecutedAt when job executes
    await updateLastExecutedAt(taskId);

    await ctx.startStage(STAGE_NAME);
    await ctx.updateStageProgress(STAGE_NAME, 50);

    logger.info({ taskId, title }, "User task processing completed");

    await ctx.updateStageProgress(STAGE_NAME, 100);
    await ctx.completeStage(STAGE_NAME, { processed: true });

    // Note: Recurrence is handled by the scheduler - no need to update nextRunAt
  } catch (error: any) {
    logger.error(
      { taskId, error: error.message },
      "Failed to process user task",
    );
    await ctx.failStage(STAGE_NAME, error);
    throw error;
  }
}

/**
 * Main task execution processor - handles both AI assistant and user tasks
 */
async function processTaskExecution(ctx: JobContext<TaskExecutionJobData>) {
  const { taskId, title, description, userId, assignedToId, isAssignedToAI } = ctx.job.data;
  logger.info(
    { jobId: ctx.job.id, taskId, userId, assignedToId },
    "Starting task execution processing job",
  );

  logger.info(
    {
      jobId: ctx.job.id,
      taskId,
      title,
      description,
      userId,
      assignedToId,
      fullJobData: ctx.job.data,
    },
    "Task execution job details",
  );

  try {
    // Use the isAssignedToAI field provided by the backend job data
    const isAI = isAssignedToAI || false;

    logger.info(
      {
        taskId,
        assignedToId,
        isAI,
        hasAssignedTo: !!assignedToId,
      },
      "Using isAssignedToAI field from job data",
    );

    if (assignedToId && isAI) {
      logger.info({ taskId, assignedToId }, "Processing AI assistant task");
      logger.info(
        {
          taskId,
          assignedToId,
          userId,
          title,
          description,
        },
        "Entering AI assistant processing path with full details",
      );

      const STAGE_NAME = "ai_response";
      await ctx.initStages([STAGE_NAME]);

      try {
        // Mark task as in-progress when AI assistant starts working
        try {
          await updateTaskStatus(taskId, "in-progress", userId, assignedToId);
        } catch (statusError) {
          logger.error(
            {
              taskId,
              error:
                statusError instanceof Error
                  ? statusError.message
                  : "Unknown error",
            },
            "Failed to update task status to in-progress, continuing with processing",
          );
        }

        // Update lastExecutedAt when job executes
        await updateLastExecutedAt(taskId);

        await ctx.startStage(STAGE_NAME);
        await ctx.updateStageProgress(STAGE_NAME, 10);

        // Generate AI response - use prompt AI or simple AI based on configuration
        let aiResponse: string;
        if (USE_PROMPT_AI) {
          logger.info(
            { taskId },
            "Generating AI assistant response using prompt AI",
          );
          logger.info(
            {
              taskId,
              title,
              description,
              userId,
            },
            "About to generate prompt AI response with task details",
          );

          aiResponse = await generatePromptAIResponse(
            title,
            description,
            taskId,
            userId,
          );
        } else {
          logger.info(
            { taskId },
            "Generating AI assistant response using simple AI",
          );
          logger.info(
            {
              taskId,
              title,
              description,
            },
            "About to generate simple AI response with task details",
          );

          aiResponse = await generateAIAssistantResponse(
            title,
            description,
            taskId,
          );
        }

        logger.info(
          {
            taskId,
            responseLength: aiResponse.length,
            responsePreview: aiResponse.substring(0, 100) + "...",
          },
          "AI response generated successfully",
        );

        await ctx.updateStageProgress(STAGE_NAME, 50);

        // Create comment with AI response
        logger.info({ taskId }, "Creating task comment with AI response");
        logger.info(
          {
            taskId,
            responseLength: aiResponse.length,
          },
          "About to create task comment with AI response",
        );

        await createTaskComment(taskId, aiResponse);

        logger.info(
          {
            taskId,
          },
          "Task comment creation completed successfully",
        );

        await ctx.updateStageProgress(STAGE_NAME, 90);

        const finalArtifacts = {
          aiResponse: aiResponse,
          commentCreated: true,
        };

        // Complete the final stage with artifacts - job completion is implicit when handler returns
        await ctx.completeStage(STAGE_NAME, finalArtifacts);

        // Mark task as completed now that AI assistant has finished
        try {
          await updateTaskStatus(taskId, "completed", userId, assignedToId);
        } catch (statusError) {
          logger.error(
            {
              taskId,
              error:
                statusError instanceof Error
                  ? statusError.message
                  : "Unknown error",
            },
            "Failed to update task status to completed, but processing was successful",
          );
        }

        // Note: Recurrence is handled by the scheduler - no need to update nextRunAt

        logger.info(
          { jobId: ctx.job.id, taskId },
          "AI assistant task processing completed successfully",
        );
      } catch (error: any) {
        logger.error(
          { jobId: ctx.job.id, taskId, error: error.message },
          "Failed AI assistant task processing",
        );
        await ctx.failStage(STAGE_NAME, error);
        throw error;
      }
    } else {
      // Process as user task
      logger.info({ taskId, assignedToId }, "Processing user task");
      logger.info(
        {
          taskId,
          assignedToId,
          userId,
          reason: !assignedToId ? "no assignedToId" : "not AI assistant",
        },
        "Entering user task processing path",
      );

      await processUserTask(ctx);

      logger.info(
        {
          taskId,
          assignedToId,
        },
        "User task processing completed",
      );
    }

    logger.info(
      { jobId: ctx.job.id, taskId },
      "Task execution completed successfully",
    );
  } catch (error: any) {
    logger.error(
      { jobId: ctx.job.id, taskId, error: error.message },
      "Failed task execution processing job",
    );
    throw error;
  }
}

export default processTaskExecution;
