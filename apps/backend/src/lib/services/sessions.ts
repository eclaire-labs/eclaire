/**
 * Session Service
 *
 * Session-first API layer. Sessions are the primary resource;
 * messages are always scoped to a session. Streaming-only internally.
 *
 * Delegates persistence to the existing conversations/messages services
 * (the DB tables are the same — only the API naming changes).
 */

import type { AIMessage } from "@eclaire/ai";
import { convertFromLlm, createRuntimeContext } from "@eclaire/ai";
import type { Context } from "../../schemas/prompt-params.js";
import {
  createBackendAgent,
  type StreamEvent,
  transformRuntimeEvent,
} from "../agent/index.js";
import {
  ConversationNotFoundError,
  loadConversationMessages,
  saveConversationMessages,
} from "../agent/conversation-adapter.js";
import { fetchAssetContents } from "../agent/asset-fetcher.js";
import type { UserContext } from "../agent/types.js";
import { createChildLogger } from "../logger.js";
import { getUserContextForPrompt } from "../user.js";
import {
  createConversation,
  deleteConversation,
  getConversationWithMessages,
  generateConversationTitle,
  listConversations,
  updateConversation,
  type ConversationSummary,
  type ConversationWithMessages,
} from "./conversations.js";
import { recordHistory } from "./history.js";
import type { CallerContext } from "./types.js";

const logger = createChildLogger("services:sessions");

// Re-export for consumers
export type { StreamEvent };

// ============================================================================
// Types
// ============================================================================

/** A session is a conversation (same DB row, different API name). */
export type Session = ConversationSummary;
export type SessionWithMessages = ConversationWithMessages;

export interface SendMessageOptions {
  sessionId: string;
  userId: string;
  prompt: string;
  context?: Context;
  enableThinking?: boolean;
  requestId?: string;
  caller?: CallerContext;
}

// ============================================================================
// Abort mechanism
// ============================================================================

const runningExecutions = new Map<string, AbortController>();

/**
 * Abort a running execution for a session.
 * Returns true if an execution was found and aborted.
 */
export function abortExecution(sessionId: string): boolean {
  const controller = runningExecutions.get(sessionId);
  if (!controller) return false;
  controller.abort();
  runningExecutions.delete(sessionId);
  return true;
}

// ============================================================================
// Session CRUD — thin delegates to conversations service
// ============================================================================

export async function createSession(
  userId: string,
  caller: CallerContext,
  title?: string,
): Promise<Session> {
  const session = await createConversation({
    userId,
    title: title || "New session",
  });

  await recordHistory({
    action: "conversation_created",
    itemType: "conversation",
    itemId: session.id,
    itemName: session.title,
    beforeData: null,
    afterData: session,
    actor: caller.actor,
    actorId: caller.userId,
    userId,
  });

  return session;
}

export async function listSessions(
  userId: string,
  limit?: number,
  offset?: number,
): Promise<Session[]> {
  return listConversations(userId, limit, offset);
}

export async function getSession(
  sessionId: string,
  userId: string,
): Promise<SessionWithMessages | null> {
  return getConversationWithMessages(sessionId, userId);
}

export async function updateSession(
  sessionId: string,
  userId: string,
  caller: CallerContext,
  updates: { title?: string },
): Promise<Session | null> {
  const updated = await updateConversation(sessionId, userId, updates);

  if (updated) {
    await recordHistory({
      action: "conversation_updated",
      itemType: "conversation",
      itemId: sessionId,
      itemName: updated.title,
      beforeData: { updates },
      afterData: updated,
      actor: caller.actor,
      actorId: caller.userId,
      userId,
    });
  }

  return updated;
}

export async function deleteSession(
  sessionId: string,
  userId: string,
  caller: CallerContext,
): Promise<boolean> {
  const success = await deleteConversation(sessionId, userId);

  if (success) {
    // Clean up any running execution
    abortExecution(sessionId);

    await recordHistory({
      action: "conversation_deleted",
      itemType: "conversation",
      itemId: sessionId,
      itemName: "Deleted Session",
      beforeData: { sessionId },
      afterData: null,
      actor: caller.actor,
      actorId: caller.userId,
      userId,
    });
  }

  return success;
}

// ============================================================================
// Send message — always returns streaming SSE
// ============================================================================

export async function sendMessage(
  options: SendMessageOptions,
): Promise<ReadableStream<StreamEvent>> {
  const {
    sessionId,
    userId,
    prompt,
    context,
    enableThinking,
    requestId,
  } = options;

  const startTime = Date.now();

  // Reject if there's already a running execution for this session
  if (runningExecutions.has(sessionId)) {
    return new ReadableStream<StreamEvent>({
      start(controller) {
        controller.enqueue({
          type: "error",
          error: "An execution is already running for this session",
          timestamp: new Date().toISOString(),
        });
        controller.close();
      },
    });
  }

  // Create abort controller
  const abortController = new AbortController();
  runningExecutions.set(sessionId, abortController);

  logger.info(
    { sessionId, userId, requestId },
    "Processing session message",
  );

  // Get user context for personalization
  const userContext = (await getUserContextForPrompt(userId)) as UserContext;

  // Fetch asset contents if provided
  const assetContents = context?.assets
    ? await fetchAssetContents(context.assets, userId)
    : undefined;

  const hasAssets = assetContents && assetContents.length > 0;
  const isBackgroundTask = context?.backgroundTaskExecution === true;
  const includeTools = !hasAssets || isBackgroundTask;

  // Load conversation history
  let previousMessages: AIMessage[] | undefined;
  try {
    previousMessages = await loadConversationMessages(sessionId, userId);
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      runningExecutions.delete(sessionId);
      return new ReadableStream<StreamEvent>({
        start(controller) {
          controller.enqueue({
            type: "error",
            error: "Session not found",
            timestamp: new Date().toISOString(),
          });
          controller.close();
        },
      });
    }
    logger.warn(
      { sessionId, error },
      "Failed to load session messages, starting fresh",
    );
  }

  // Record history non-blocking
  recordHistory({
    action: "ai_prompt_streaming_response",
    itemType: "prompt",
    itemId: requestId || `req_session_${Date.now()}`,
    itemName: "AI Session Message",
    beforeData: { prompt },
    afterData: { streaming: true, sessionId },
    actor: options.caller?.actor ?? "assistant",
    actorId: options.caller?.userId,
    userId,
  }).catch((err) => {
    logger.error({ err }, "Failed to record session message history");
  });

  const agent = createBackendAgent({
    includeTools,
    isBackgroundTask,
    assetContents,
    enableThinking,
  });

  const runtimeContext = createRuntimeContext({
    userId,
    requestId,
    conversationId: sessionId,
    extra: { userContext },
  });

  const previousRuntimeMessages = previousMessages
    ? convertFromLlm(previousMessages)
    : undefined;

  const streamResult = agent.stream({
    prompt,
    context: runtimeContext,
    messages: previousRuntimeMessages,
  });

  return new ReadableStream<StreamEvent>({
    async start(controller) {
      const reader = streamResult.eventStream.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          if (value.type === "turn_complete") {
            const result = await streamResult.result;

            const finalConversationId = await saveConversationMessages({
              conversationId: sessionId,
              userId,
              prompt,
              result,
              requestId,
            });

            const endTime = Date.now();

            controller.enqueue({
              type: "done",
              requestId: requestId || `req_session_${Date.now()}`,
              conversationId: finalConversationId,
              totalTokens: result.usage.totalTokens,
              executionTimeMs: endTime - startTime,
              responseType: "text_response",
              thinkingContent: result.thinking,
              toolCalls:
                result.toolCallSummaries.length > 0
                  ? result.toolCallSummaries
                  : undefined,
              timestamp: new Date().toISOString(),
            });

            logger.info(
              {
                sessionId,
                userId,
                totalExecutionTimeMs: endTime - startTime,
                totalSteps: result.steps.length,
              },
              "Session message completed",
            );
            continue;
          }

          const event = transformRuntimeEvent(value);
          if (event) controller.enqueue(event);
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          controller.enqueue({
            type: "error",
            error: "Execution aborted",
            timestamp: new Date().toISOString(),
          });
        } else {
          logger.error(
            { sessionId, userId, error },
            "Error in session message stream",
          );
          controller.enqueue({
            type: "error",
            error: error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date().toISOString(),
          });
        }
      } finally {
        reader.releaseLock();
        runningExecutions.delete(sessionId);
        controller.close();
      }
    },
  });
}
