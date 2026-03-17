/**
 * Conversation Adapter
 *
 * Handles loading and saving conversation messages for the agent.
 */

import type {
  AIMessage,
  RuntimeAgentStep,
  ToolCallSummaryOutput,
} from "@eclaire/ai";
import { NotFoundError } from "../errors.js";
import { createChildLogger } from "../logger.js";
import { saveAgentSteps } from "../services/agent-steps.js";
import {
  type ConversationWithMessages,
  createConversation,
  generateConversationTitle,
  getConversationWithMessages,
  updateConversationActivity,
} from "../services/conversations.js";
import { buildAIMessageArray, createMessage } from "../services/messages.js";

const logger = createChildLogger("conversation-adapter");

// Backward-compatible re-export for route files
export { NotFoundError as ConversationNotFoundError };

/**
 * Load conversation with messages
 */
export async function loadConversation(
  conversationId: string,
  userId: string,
): Promise<ConversationWithMessages> {
  const conversation = await getConversationWithMessages(
    conversationId,
    userId,
  );

  if (!conversation) {
    throw new NotFoundError("Conversation");
  }

  return conversation;
}

/**
 * Load conversation messages in AI message format
 */
export async function loadConversationMessages(
  conversationId: string,
  userId: string,
  systemPrompt?: string,
): Promise<AIMessage[]> {
  const conversation = await getConversationWithMessages(
    conversationId,
    userId,
  );

  if (!conversation) {
    throw new NotFoundError("Conversation");
  }

  return buildAIMessageArray(conversation.id, !!systemPrompt, systemPrompt);
}

/** Structural type covering the fields used by saveConversationMessages. */
export interface SaveableResult {
  text: string;
  thinking?: string;
  toolCallSummaries: ToolCallSummaryOutput[];
  /** Full step-by-step execution trace (persisted to agent_steps table) */
  steps?: RuntimeAgentStep[];
  /** Aggregate token usage */
  usage?: {
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
  };
}

/** Compute execution summary metadata from agent steps */
function buildExecutionMetadata(
  result: SaveableResult,
  startTime?: number,
): Record<string, unknown> {
  const steps = result.steps ?? [];
  if (steps.length === 0) return {};

  let totalToolCalls = 0;
  for (const step of steps) {
    totalToolCalls += step.toolExecutions?.length ?? 0;
  }

  const totalDurationMs = startTime ? Date.now() - startTime : undefined;

  return {
    stepCount: steps.length,
    totalToolCalls,
    ...(totalDurationMs !== undefined && { totalDurationMs }),
  };
}

export interface SaveConversationOptions {
  conversationId?: string;
  userId: string;
  agentActorId: string;
  userAuthorActorId?: string | null;
  userAuthorizedByActorId?: string | null;
  userGrantId?: string | null;
  prompt: string;
  result: SaveableResult;
  requestId?: string;
}

/**
 * Save conversation messages after agent execution.
 * Creates a new conversation if needed.
 */
export async function saveConversationMessages(
  options: SaveConversationOptions,
): Promise<string | undefined> {
  const {
    conversationId,
    userId,
    agentActorId,
    userAuthorActorId,
    userAuthorizedByActorId,
    userGrantId,
    prompt,
    result,
    requestId,
  } = options;

  // If no conversation context and we have a result, create new conversation
  if (!conversationId) {
    // Don't create conversations for simple responses without tool calls
    if (result.toolCallSummaries.length === 0) {
      return undefined;
    }

    const title = generateConversationTitle(prompt);
    const newConversation = await createConversation({
      userId,
      agentActorId,
      title,
    });

    // Add user message
    await createMessage({
      conversationId: newConversation.id,
      role: "user",
      authorActorId: userAuthorActorId ?? userId,
      content: prompt,
      metadata: {
        requestId,
        authorizedByActorId: userAuthorizedByActorId ?? null,
        grantId: userGrantId ?? null,
      },
    });

    // Add assistant response
    const executionMeta = buildExecutionMetadata(result);
    const assistantMsg = await createMessage({
      conversationId: newConversation.id,
      role: "assistant",
      authorActorId: agentActorId ?? newConversation.agentActorId,
      content: result.text,
      thinkingContent: result.thinking,
      toolCalls:
        result.toolCallSummaries.length > 0
          ? result.toolCallSummaries
          : undefined,
      metadata: { requestId, ...executionMeta },
    });

    // Persist step-by-step execution trace
    if (result.steps && result.steps.length > 0) {
      saveAgentSteps(assistantMsg.id, newConversation.id, result.steps).catch(
        (err) => {
          logger.error(
            { err, messageId: assistantMsg.id },
            "Failed to save agent steps",
          );
        },
      );
    }

    await updateConversationActivity(newConversation.id, userId);

    logger.info(
      { conversationId: newConversation.id, userId },
      "Created new conversation",
    );

    return newConversation.id;
  }

  // Add to existing conversation
  await createMessage({
    conversationId,
    role: "user",
    authorActorId: userAuthorActorId ?? userId,
    content: prompt,
    metadata: {
      requestId,
      authorizedByActorId: userAuthorizedByActorId ?? null,
      grantId: userGrantId ?? null,
    },
  });

  const executionMeta2 = buildExecutionMetadata(result);
  const assistantMsg2 = await createMessage({
    conversationId,
    role: "assistant",
    authorActorId: agentActorId,
    content: result.text,
    thinkingContent: result.thinking,
    toolCalls:
      result.toolCallSummaries.length > 0
        ? result.toolCallSummaries
        : undefined,
    metadata: { requestId, ...executionMeta2 },
  });

  // Persist step-by-step execution trace
  if (result.steps && result.steps.length > 0) {
    saveAgentSteps(assistantMsg2.id, conversationId, result.steps).catch(
      (err) => {
        logger.error(
          { err, messageId: assistantMsg2.id },
          "Failed to save agent steps",
        );
      },
    );
  }

  await updateConversationActivity(conversationId, userId);

  logger.info(
    { conversationId, userId },
    "Saved messages to existing conversation",
  );

  return conversationId;
}
