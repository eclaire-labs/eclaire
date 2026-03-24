/**
 * Session Service
 *
 * Session-first API layer. Sessions are the primary resource;
 * messages are always scoped to a session. Streaming-only internally.
 *
 * Delegates persistence to the existing conversations/messages services
 * (the DB tables are the same — only the API naming changes).
 *
 * Agent execution is decoupled from the HTTP stream via an EventEmitter.
 * The execution runs to completion (saving messages) even if the client
 * disconnects. The HTTP SSE stream subscribes to the emitter and can
 * be cancelled without affecting the execution.
 */

import { EventEmitter } from "node:events";
import type { AIMessage, ApprovalResponse } from "@eclaire/ai";
import type { OnApprovalRequired } from "@eclaire/ai";
import { convertFromLlm, createRuntimeContext } from "@eclaire/ai";
import type { Context } from "../../schemas/prompt-params.js";
import { fetchAssetContents } from "../agent/asset-fetcher.js";
import {
  ConversationNotFoundError,
  loadConversationMessages,
  saveConversationMessages,
} from "../agent/conversation-adapter.js";
import {
  createBackendAgent,
  type StreamEvent,
  transformRuntimeEvent,
} from "../agent/index.js";
import type { UserContext } from "../agent/types.js";
import { DEFAULT_AGENT_ID, getAgent } from "./agents.js";
import { createChildLogger } from "../logger.js";
import { getUserContextForPrompt } from "../user.js";
import {
  type ConversationSummary,
  type ConversationWithMessages,
  countConversations,
  createConversation,
  generateConversationTitle,
  getConversation,
  deleteConversation,
  getConversationWithMessages,
  listConversations,
  updateConversation,
} from "./conversations.js";
import { publishProcessingEvent } from "../../routes/processing-events.js";
import { recordHistory } from "./history.js";
import {
  callerActorId,
  callerOwnerUserId,
  type CallerContext,
} from "./types.js";

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
  caller: CallerContext;
}

// ============================================================================
// Execution tracking
// ============================================================================

interface PendingApproval {
  resolve: (response: ApprovalResponse) => void;
  toolName: string;
}

interface ExecutionEntry {
  abortController: AbortController;
  emitter: EventEmitter;
  startedAt: number;
  pendingApprovals: Map<string, PendingApproval>;
}

const runningExecutions = new Map<string, ExecutionEntry>();

/**
 * Abort a running execution for a session.
 * Returns true if an execution was found and aborted.
 */
export function abortExecution(sessionId: string): boolean {
  const entry = runningExecutions.get(sessionId);
  if (!entry) return false;

  // Deny all pending tool approvals before aborting
  for (const [, pending] of entry.pendingApprovals) {
    pending.resolve({ approved: false, reason: "Execution aborted" });
  }
  entry.pendingApprovals.clear();

  entry.abortController.abort();
  runningExecutions.delete(sessionId);
  return true;
}

/**
 * Approve or deny a pending tool execution for a session.
 * Returns true if a pending approval was found and resolved.
 */
export function approveToolExecution(
  sessionId: string,
  toolCallId: string,
  approved: boolean,
  reason?: string,
): boolean {
  const entry = runningExecutions.get(sessionId);
  if (!entry) return false;

  const pending = entry.pendingApprovals.get(toolCallId);
  if (!pending) return false;

  pending.resolve({ approved, reason });
  entry.pendingApprovals.delete(toolCallId);
  return true;
}

// ============================================================================
// Session CRUD — thin delegates to conversations service
// ============================================================================

export async function createSession(
  userId: string,
  caller: CallerContext,
  title?: string,
  agentActorId?: string,
): Promise<Session> {
  const actorId = callerActorId(caller);
  const ownerUserId = callerOwnerUserId(caller);
  const session = await createConversation({
    userId,
    agentActorId: agentActorId ?? DEFAULT_AGENT_ID,
    title: title || null,
  });

  await recordHistory({
    action: "conversation_created",
    itemType: "conversation",
    itemId: session.id,
    itemName: session.title ?? undefined,
    beforeData: null,
    afterData: session,
    actor: caller.actor,
    actorId,
    authorizedByActorId: caller.authorizedByActorId ?? null,
    grantId: caller.grantId ?? null,
    userId: ownerUserId,
  });

  return session;
}

export async function listSessions(
  userId: string,
  agentActorId?: string,
  limit?: number,
  offset?: number,
): Promise<{ items: Session[]; totalCount: number }> {
  const [items, totalCount] = await Promise.all([
    listConversations(userId, agentActorId, limit, offset),
    countConversations(userId, agentActorId),
  ]);
  return { items, totalCount };
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
  const actorId = callerActorId(caller);
  const ownerUserId = callerOwnerUserId(caller);
  const updated = await updateConversation(sessionId, userId, updates);

  if (updated) {
    await recordHistory({
      action: "conversation_updated",
      itemType: "conversation",
      itemId: sessionId,
      itemName: updated.title ?? undefined,
      beforeData: { updates },
      afterData: updated,
      actor: caller.actor,
      actorId,
      authorizedByActorId: caller.authorizedByActorId ?? null,
      grantId: caller.grantId ?? null,
      userId: ownerUserId,
    });
  }

  return updated;
}

export async function deleteSession(
  sessionId: string,
  userId: string,
  caller: CallerContext,
): Promise<boolean> {
  const actorId = callerActorId(caller);
  const ownerUserId = callerOwnerUserId(caller);
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
      actorId,
      authorizedByActorId: caller.authorizedByActorId ?? null,
      grantId: caller.grantId ?? null,
      userId: ownerUserId,
    });
  }

  return success;
}

// ============================================================================
// Send message — decoupled execution + streaming SSE
// ============================================================================

/**
 * Create a ReadableStream that subscribes to execution events via EventEmitter.
 * The stream can be cancelled (client disconnect) without affecting the execution.
 */
function createClientStream(
  emitter: EventEmitter,
): ReadableStream<StreamEvent> {
  return new ReadableStream<StreamEvent>({
    start(controller) {
      const onEvent = (event: StreamEvent) => {
        try {
          controller.enqueue(event);
        } catch {
          // Client disconnected — remove listeners, execution continues
          cleanup();
        }
      };

      const onDone = () => {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
        cleanup();
      };

      const cleanup = () => {
        emitter.off("event", onEvent);
        emitter.off("done", onDone);
      };

      emitter.on("event", onEvent);
      emitter.on("done", onDone);
    },
    cancel() {
      // Client disconnected — execution continues independently
    },
  });
}

interface RunExecutionParams {
  sessionId: string;
  userId: string;
  prompt: string;
  // biome-ignore lint/suspicious/noExplicitAny: runtime stream result type varies
  streamResult: any;
  emitter: EventEmitter;
  abortController: AbortController;
  session: ConversationSummary;
  callerActor: string;
  callerAuthorizedByActorId: string | null;
  callerGrantId: string | null;
  requestId?: string;
  startTime: number;
}

/**
 * Run agent execution independently of the HTTP stream.
 * Reads from the agent's event stream, emits events to the EventEmitter,
 * and ALWAYS saves messages on completion — even if no client is listening.
 */
async function runExecution(params: RunExecutionParams): Promise<void> {
  const {
    sessionId,
    userId,
    prompt,
    streamResult,
    emitter,
    abortController,
    session,
    callerActor,
    callerAuthorizedByActorId,
    callerGrantId,
    requestId,
    startTime,
  } = params;

  const reader = streamResult.eventStream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Track approval state transitions in DB
      if (value.type === "tool_approval_required") {
        updateConversation(sessionId, userId, {
          executionStatus: "awaiting_approval",
        }).catch((err) => {
          logger.error(
            { err, sessionId },
            "Failed to set execution status to awaiting_approval",
          );
        });
        publishProcessingEvent(userId, {
          type: "session_awaiting_approval",
          sessionId,
          agentActorId: session.agentActorId,
        }).catch((err) => {
          logger.error(
            { err, sessionId },
            "Failed to publish session_awaiting_approval event",
          );
        });
      }

      if (value.type === "tool_approval_resolved") {
        updateConversation(sessionId, userId, {
          executionStatus: "running",
        }).catch((err) => {
          logger.error(
            { err, sessionId },
            "Failed to reset execution status to running after approval",
          );
        });
      }

      if (value.type === "turn_complete") {
        const result = await streamResult.result;

        const finalConversationId = await saveConversationMessages({
          conversationId: sessionId,
          userId,
          agentActorId: session.agentActorId,
          userAuthorActorId: callerActor,
          userAuthorizedByActorId: callerAuthorizedByActorId,
          userGrantId: callerGrantId,
          prompt,
          result,
          requestId,
        });

        // Auto-generate title from first message
        if (!session.title) {
          const title = generateConversationTitle(prompt);
          updateConversation(sessionId, userId, { title }).catch((err) => {
            logger.error({ err, sessionId }, "Failed to auto-title session");
          });
        }

        const endTime = Date.now();

        // Emit done event to any connected clients
        emitter.emit("event", {
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

        // Update DB status — execution completed, mark as unread
        await updateConversation(sessionId, userId, {
          executionStatus: "idle",
          hasUnreadResponse: true,
        }).catch((err) => {
          logger.error(
            { err, sessionId },
            "Failed to update execution status to idle",
          );
        });

        // Publish SSE notification for status indicators
        await publishProcessingEvent(userId, {
          type: "session_completed",
          sessionId,
          agentActorId: session.agentActorId,
        }).catch((err) => {
          logger.error(
            { err, sessionId },
            "Failed to publish session_completed event",
          );
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
      if (event) emitter.emit("event", event);
    }
  } catch (error) {
    const isAborted = abortController.signal.aborted;

    if (isAborted) {
      // Intentional abort — reset to idle, don't mark as unread
      await updateConversation(sessionId, userId, {
        executionStatus: "idle",
      }).catch((err) => {
        logger.error(
          { err, sessionId },
          "Failed to reset execution status after abort",
        );
      });

      emitter.emit("event", {
        type: "error",
        error: "Execution aborted",
        timestamp: new Date().toISOString(),
      });
    } else {
      logger.error(
        { sessionId, userId, error },
        "Error in session message execution",
      );

      // Mark as error with unread flag
      await updateConversation(sessionId, userId, {
        executionStatus: "error",
        hasUnreadResponse: true,
      }).catch((err) => {
        logger.error(
          { err, sessionId },
          "Failed to update execution status to error",
        );
      });

      // Publish SSE notification
      await publishProcessingEvent(userId, {
        type: "session_error",
        sessionId,
        agentActorId: session.agentActorId,
      }).catch((err) => {
        logger.error(
          { err, sessionId },
          "Failed to publish session_error event",
        );
      });

      emitter.emit("event", {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  } finally {
    reader.releaseLock();
    runningExecutions.delete(sessionId);
    emitter.emit("done");
    emitter.removeAllListeners();
  }
}

export async function sendMessage(
  options: SendMessageOptions,
): Promise<ReadableStream<StreamEvent>> {
  const callerActor = callerActorId(options.caller);
  const ownerUserId = callerOwnerUserId(options.caller);
  const { sessionId, userId, prompt, context, enableThinking, requestId } =
    options;

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

  logger.info({ sessionId, userId, requestId }, "Processing session message");

  const session = await getConversation(sessionId, userId);
  if (!session) {
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

  const requestedAgentActorId =
    context?.agentActorId ?? session.agentActorId ?? DEFAULT_AGENT_ID;

  if (requestedAgentActorId !== session.agentActorId) {
    return new ReadableStream<StreamEvent>({
      start(controller) {
        controller.enqueue({
          type: "error",
          error:
            "A session is bound to a single agent. Start a new session to switch agents.",
          timestamp: new Date().toISOString(),
        });
        controller.close();
      },
    });
  }

  // Get user context for personalization
  const userContext = (await getUserContextForPrompt(userId)) as UserContext;
  const agentDefinition = await getAgent(userId, session.agentActorId);

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
    actor: options.caller.actor,
    actorId: callerActor,
    authorizedByActorId: options.caller.authorizedByActorId ?? null,
    grantId: options.caller.grantId ?? null,
    userId: ownerUserId,
  }).catch((err) => {
    logger.error({ err }, "Failed to record session message history");
  });

  // Set up execution tracking early so the approval callback can reference it
  const emitter = new EventEmitter();
  const abortController = new AbortController();
  const pendingApprovals = new Map<string, PendingApproval>();

  // Approval callback — stores a Promise resolver so the approval API can unblock execution
  const onApprovalRequired: OnApprovalRequired = (request) => {
    return new Promise<ApprovalResponse>((resolve) => {
      pendingApprovals.set(request.toolCallId, {
        resolve,
        toolName: request.toolName,
      });
    });
  };

  const agent = createBackendAgent({
    agent: agentDefinition,
    userContext,
    includeTools,
    isBackgroundTask,
    assetContents,
    enableThinking,
    onApprovalRequired: isBackgroundTask ? undefined : onApprovalRequired,
  });

  const runtimeContext = createRuntimeContext({
    userId,
    requestId,
    conversationId: sessionId,
    extra: {
      userContext,
      agent: agentDefinition,
      allowedSkillNames: agentDefinition.skillNames,
      callerAuthMethod: options.caller.authMethod,
      callerActorKind: options.caller.actor,
      backgroundTaskExecution: isBackgroundTask,
    },
  });

  const previousRuntimeMessages = previousMessages
    ? convertFromLlm(previousMessages)
    : undefined;

  const streamResult = agent.stream({
    prompt,
    context: runtimeContext,
    messages: previousRuntimeMessages,
  });

  runningExecutions.set(sessionId, {
    abortController,
    emitter,
    startedAt: startTime,
    pendingApprovals,
  });

  // Mark session as running in DB
  updateConversation(sessionId, userId, { executionStatus: "running" }).catch(
    (err) => {
      logger.error(
        { err, sessionId },
        "Failed to set execution status to running",
      );
    },
  );

  // Publish SSE notification for status indicators
  publishProcessingEvent(userId, {
    type: "session_running",
    sessionId,
    agentActorId: session.agentActorId,
  }).catch((err) => {
    logger.error({ err, sessionId }, "Failed to publish session_running event");
  });

  // Fire-and-forget execution — runs independently of the HTTP stream
  runExecution({
    sessionId,
    userId,
    prompt,
    streamResult,
    emitter,
    abortController,
    session,
    callerActor,
    callerAuthorizedByActorId: options.caller.authorizedByActorId ?? null,
    callerGrantId: options.caller.grantId ?? null,
    requestId,
    startTime,
  }).catch((err) => {
    logger.error({ err, sessionId }, "Uncaught error in runExecution");
  });

  // Return a stream that subscribes to the emitter
  return createClientStream(emitter);
}
