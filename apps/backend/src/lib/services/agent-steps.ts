/**
 * Agent Steps Service
 *
 * Persists and retrieves the step-by-step execution trace of agent runs.
 * Steps are stored per assistant message and loaded on-demand by the frontend.
 */

import type { RuntimeAgentStep } from "@eclaire/ai";
import { generateAgentStepId } from "@eclaire/core";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { createChildLogger } from "../logger.js";

const { agentSteps } = schema;
const logger = createChildLogger("services:agent-steps");

/** Maximum size (in bytes) for a single tool execution's result before truncation */
const MAX_TOOL_RESULT_SIZE = 50_000;

/**
 * Extract text and thinking content from an AssistantMessage's content blocks.
 */
function extractContentFromStep(step: RuntimeAgentStep): {
  thinkingContent: string | null;
  textContent: string | null;
} {
  let thinkingContent: string | null = null;
  let textContent: string | null = null;

  if (step.assistantMessage?.content) {
    const thinkingParts: string[] = [];
    const textParts: string[] = [];

    for (const block of step.assistantMessage.content) {
      if (block.type === "thinking" && block.text) {
        thinkingParts.push(block.text);
      } else if (block.type === "text" && block.text) {
        textParts.push(block.text);
      }
    }

    if (thinkingParts.length > 0) thinkingContent = thinkingParts.join("\n");
    if (textParts.length > 0) textContent = textParts.join("\n");
  }

  return { thinkingContent, textContent };
}

/**
 * Truncate tool execution results that exceed the size limit.
 * Returns a JSON-safe copy with large results replaced by truncated versions.
 */
function truncateToolExecutions(
  // biome-ignore lint/suspicious/noExplicitAny: tool execution data from runtime has varying shapes
  toolExecutions: any[],
  // biome-ignore lint/suspicious/noExplicitAny: tool execution data from runtime has varying shapes
): any[] {
  return toolExecutions.map((exec) => {
    const copy = { ...exec };

    // Truncate result if too large
    if (copy.result) {
      try {
        const resultJson = JSON.stringify(copy.result);
        if (resultJson.length > MAX_TOOL_RESULT_SIZE) {
          copy.result = {
            _truncated: true,
            _originalSize: `${Math.round(resultJson.length / 1024)}KB`,
            _message: "Result truncated for storage",
            // Keep isError flag
            ...(copy.result.isError ? { isError: true } : {}),
            // Keep a summary of content if possible
            ...(copy.result.content?.[0]?.text
              ? {
                  content: [
                    {
                      type: "text",
                      text: `${copy.result.content[0].text.slice(0, 2000)}...`,
                    },
                  ],
                }
              : {}),
          };
        }
      } catch {
        // If JSON serialization fails, replace with error marker
        copy.result = {
          _truncated: true,
          _message: "Result could not be serialized",
        };
      }
    }

    // Truncate large arguments too
    if (copy.input) {
      try {
        const inputJson = JSON.stringify(copy.input);
        if (inputJson.length > MAX_TOOL_RESULT_SIZE) {
          copy.input = {
            _truncated: true,
            _originalSize: `${Math.round(inputJson.length / 1024)}KB`,
          };
        }
      } catch {
        copy.input = { _truncated: true };
      }
    }

    return copy;
  });
}

/**
 * Save agent execution steps for a message.
 * Called after the agent completes and the assistant message is persisted.
 */
export async function saveAgentSteps(
  messageId: string,
  conversationId: string,
  steps: RuntimeAgentStep[],
): Promise<void> {
  if (steps.length === 0) return;

  try {
    const values = steps.map((step) => {
      const { thinkingContent, textContent } = extractContentFromStep(step);

      const toolExecs = step.toolExecutions
        ? truncateToolExecutions(step.toolExecutions)
        : null;

      return {
        id: generateAgentStepId(),
        messageId,
        conversationId,
        stepNumber: step.stepNumber,
        timestamp: new Date(step.timestamp),
        thinkingContent,
        textContent,
        isTerminal: step.isTerminal,
        stopReason: step.stopReason ?? null,
        promptTokens: null as number | null,
        completionTokens: null as number | null,
        toolExecutions: toolExecs,
      };
    });

    await db.insert(agentSteps).values(values);

    logger.info(
      { messageId, conversationId, stepCount: steps.length },
      "Saved agent execution steps",
    );
  } catch (error) {
    logger.error(
      {
        messageId,
        conversationId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to save agent steps",
    );
  }
}

/**
 * Get agent execution steps for a specific message.
 * Used for lazy-loading step detail in the frontend.
 */
export async function getAgentSteps(messageId: string, conversationId: string) {
  try {
    const steps = await db
      .select()
      .from(agentSteps)
      .where(
        and(
          eq(agentSteps.messageId, messageId),
          eq(agentSteps.conversationId, conversationId),
        ),
      )
      .orderBy(asc(agentSteps.stepNumber));

    return steps;
  } catch (error) {
    logger.error(
      {
        messageId,
        conversationId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to get agent steps",
    );
    return [];
  }
}
