/**
 * Run Task Agent Tool
 *
 * Triggers an AI agent to work on a specific task.
 * Creates an AgentRun record and enqueues it for execution.
 */

import {
  textResult,
  errorResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { createAgentRun } from "../../services/agent-runs.js";
import { buildTaskPrompt } from "../../services/task-series.js";
import { db, schema } from "../../../db/index.js";
import { eq, and } from "drizzle-orm";
import { getAgentActorId } from "./caller.js";

const inputSchema = z.object({
  taskId: z.string().describe("The ID of the task to run the agent on."),
  instructions: z
    .string()
    .optional()
    .describe(
      "Optional additional instructions for the agent beyond the task title/description.",
    ),
});

export const runTaskAgentTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "runTaskAgent",
  label: "Run Agent on Task",
  description:
    "Trigger an AI agent to work on a task. The agent will read the task, use tools to complete it, post results as a comment, and mark it done.",
  accessLevel: "write",
  inputSchema,
  promptGuidelines: [
    "Use this tool when the user wants an agent to work on or execute a task.",
    "The agent will read the task title and description, use available tools, post results as a comment, and mark the task completed.",
    "You can provide additional instructions to guide the agent beyond the task description.",
    "Do NOT use scheduleAction for task execution — use runTaskAgent instead.",
  ],
  execute: async (_callId, input, ctx) => {
    const { taskId } = input;

    // Verify task exists and belongs to user
    const [task] = await db
      .select({
        id: schema.tasks.id,
        title: schema.tasks.title,
        description: schema.tasks.description,
        assigneeActorId: schema.tasks.assigneeActorId,
        executionMode: schema.tasks.executionMode,
      })
      .from(schema.tasks)
      .where(
        and(eq(schema.tasks.id, taskId), eq(schema.tasks.userId, ctx.userId)),
      )
      .limit(1);

    if (!task) {
      return errorResult(`Task not found: ${taskId}`);
    }

    // If task is still in manual mode, upgrade to agent_assists (safe default)
    if (task.executionMode === "manual") {
      await db
        .update(schema.tasks)
        .set({ executionMode: "agent_assists", updatedAt: new Date() })
        .where(eq(schema.tasks.id, taskId));
    }

    // Build prompt from task + optional instructions
    let prompt = buildTaskPrompt(task.title, task.description);
    if (input.instructions) {
      prompt += `\n\nAdditional instructions: ${input.instructions}`;
    }

    const executorActorId =
      task.assigneeActorId || getAgentActorId(ctx) || ctx.userId;

    try {
      const run = await createAgentRun({
        taskId,
        userId: ctx.userId,
        requestedByActorId: getAgentActorId(ctx) || ctx.userId,
        executorActorId,
        prompt,
      });

      return textResult(
        JSON.stringify(
          {
            agentRunId: run.id,
            taskId,
            status: "queued",
            message: `Agent run started on task "${task.title}"`,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      return errorResult(
        error instanceof Error ? error.message : "Failed to start agent run",
      );
    }
  },
};
