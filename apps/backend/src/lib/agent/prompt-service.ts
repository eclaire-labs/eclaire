/**
 * Prompt Service
 *
 * Thin service layer that uses RuntimeAgent for AI interactions.
 */

import type {
  AIMessage,
  OnApprovalRequired,
  RuntimeToolDefinition,
  ToolCallSummaryOutput,
} from "@eclaire/ai";
import {
  convertFromLlm,
  createRuntimeContext,
  getAgentRuntimeKindForModel,
  RuntimeAgent,
  selectTools,
  type RuntimeStreamEvent,
} from "@eclaire/ai";
import type { Context } from "../../schemas/prompt-params.js";
import { getMcpRegistry } from "../mcp/index.js";
import { createChildLogger } from "../logger.js";
import { DEFAULT_AGENT_ID, getAgent } from "../services/agents.js";
import { getUserContextForPrompt } from "../user.js";
import { fetchAssetContents } from "./asset-fetcher.js";
import {
  ConversationNotFoundError,
  loadConversationMessages,
  saveConversationMessages,
} from "./conversation-adapter.js";
import {
  buildExternalHarnessPrompt,
  buildSystemPrompt,
} from "./system-prompt-builder.js";
import { getBackendTools } from "./tools/index.js";
import type { AgentDefinition, UserContext } from "./types.js";

const logger = createChildLogger("prompt-service");

export interface ProcessPromptOptions {
  userId: string;
  prompt: string;
  context?: Context;
  requestId?: string;
  conversationId?: string;
  enableThinking?: boolean;
  callerAuthMethod?: string;
  callerActorKind?: string;
  /** API key scopes (undefined for session/localhost callers). */
  callerScopes?: string[];
}

export interface PromptResponse {
  type: "text_response";
  response: string;
  requestId: string;
  conversationId?: string;
  thinkingContent?: string | null;
  toolCalls?: ToolCallSummaryOutput[];
}

function getRequestedAgentActorId(context?: Context): string {
  return context?.agentActorId ?? DEFAULT_AGENT_ID;
}

const ADMIN_ONLY_TOOLS = new Set(["manageAdminRead", "manageAdminWrite"]);
const ADMIN_ONLY_SKILLS = new Set(["admin-guide"]);

/** @internal Exported for testing. */
export function selectAgentTools(
  agent: AgentDefinition,
  userContext?: UserContext | null,
  callerScopes?: string[] | null,
): Record<string, RuntimeToolDefinition> {
  const selected = selectTools(getBackendTools(), agent.toolNames);
  const isAdmin = userContext?.isInstanceAdmin === true;

  // Determine caller capabilities from API key scopes.
  // callerScopes is null/undefined for session/localhost users → full access.
  const hasFullAccess = !callerScopes || callerScopes.includes("*");
  const hasDataWrite =
    hasFullAccess || callerScopes.includes("conversations:write");
  const hasAdminRead =
    hasFullAccess ||
    callerScopes.includes("admin:read") ||
    callerScopes.includes("admin:write");
  const hasAdminWrite = hasFullAccess || callerScopes.includes("admin:write");

  let registry: ReturnType<typeof getMcpRegistry> | null = null;
  try {
    registry = getMcpRegistry();
  } catch {
    // Registry not initialized yet
  }

  return Object.fromEntries(
    Object.entries(selected).filter(([toolName, tool]) => {
      // Filter admin-only tools for non-admin users
      if (!isAdmin && ADMIN_ONLY_TOOLS.has(toolName)) return false;

      // Filter admin tools when API key lacks admin scopes
      if (ADMIN_ONLY_TOOLS.has(toolName) && !hasAdminRead) return false;
      if (toolName === "manageAdminWrite" && !hasAdminWrite) return false;

      // Filter write tools for read-only API key callers
      if (!hasDataWrite && (tool.accessLevel ?? "write") === "write")
        return false;

      if (registry) {
        const mcpAvailability = registry.getToolAvailability(toolName);
        if (mcpAvailability && mcpAvailability.availability !== "available") {
          logger.debug(
            {
              toolName,
              availability: mcpAvailability.availability,
              reason: mcpAvailability.availabilityReason,
            },
            "MCP tool filtered out — not available",
          );
          return false;
        }
      }

      return true;
    }),
  );
}

/**
 * Filter skill names based on user context (e.g., admin-only skills).
 */
function filterSkillNames(
  skillNames: string[],
  userContext?: UserContext | null,
): string[] {
  const isAdmin = userContext?.isInstanceAdmin === true;
  if (isAdmin) return skillNames;
  return skillNames.filter((name) => !ADMIN_ONLY_SKILLS.has(name));
}

/**
 * Create a configured RuntimeAgent for the backend.
 */
export function createBackendAgent(options: {
  agent: AgentDefinition;
  userContext?: UserContext | null;
  includeTools: boolean;
  isBackgroundTask: boolean;
  assetContents?: Array<{ type: string; id: string; content: string }>;
  enableThinking?: boolean;
  onApprovalRequired?: OnApprovalRequired;
  /** API key scopes for the caller (undefined for session/localhost users). */
  callerScopes?: string[];
}) {
  // Branch on runtime kind: external harnesses get a minimal prompt, no tools
  const runtimeKind = options.agent.modelId
    ? getAgentRuntimeKindForModel(options.agent.modelId)
    : "native";

  if (runtimeKind === "external_harness") {
    return new RuntimeAgent({
      aiContext: "backend",
      modelOverride: options.agent.modelId ?? undefined,
      toolCallingMode: "off",
      toolExecution: "parallel",

      instructions: (context) => {
        const userContext = context.extra?.userContext as
          | UserContext
          | undefined;
        return buildExternalHarnessPrompt({
          userContext,
          agent: options.agent,
          assetContents: options.assetContents,
          isBackgroundTaskExecution: options.isBackgroundTask,
        });
      },

      tools: {},
      maxSteps: 1,

      aiOptions: {
        temperature: 0.1,
        maxTokens: 2000,
        timeout: 300000, // Longer timeout for external harnesses
        enableThinking: options.enableThinking,
      },
    });
  }

  // Filter tools and skills based on user context and caller scopes
  const agentTools = selectAgentTools(
    options.agent,
    options.userContext,
    options.callerScopes,
  );
  const effectiveSkillNames = filterSkillNames(
    options.agent.skillNames,
    options.userContext,
  );
  const promptTools = options.includeTools ? agentTools : {};
  const toolCallingMode = options.includeTools ? "native" : "off";
  const isReadOnly =
    options.callerScopes != null &&
    !options.callerScopes.includes("*") &&
    !options.callerScopes.includes("conversations:write");

  return new RuntimeAgent({
    aiContext: "backend",
    modelOverride: options.agent.modelId ?? undefined,
    toolCallingMode,
    toolExecution: "parallel",

    instructions: (context) => {
      const userContext = context.extra?.userContext as UserContext | undefined;
      return buildSystemPrompt({
        userContext,
        agent: { ...options.agent, skillNames: effectiveSkillNames },
        assetContents: options.assetContents,
        tools: promptTools,
        toolCallingMode,
        isBackgroundTaskExecution: options.isBackgroundTask,
        isReadOnly,
      });
    },

    tools: options.includeTools ? agentTools : {},

    maxSteps: 10,

    aiOptions: {
      temperature: 0.1,
      maxTokens: 2000,
      timeout: 180000,
      enableThinking: options.enableThinking,
    },

    onApprovalRequired: options.onApprovalRequired,
  });
}

/**
 * Process a prompt request (non-streaming)
 */
export async function processPromptRequest(
  options: ProcessPromptOptions,
): Promise<PromptResponse> {
  const {
    userId,
    prompt,
    context,
    requestId,
    conversationId,
    enableThinking,
    callerAuthMethod,
    callerActorKind,
    callerScopes,
  } = options;

  const startTime = Date.now();
  logger.info(
    { requestId, userId, hasConversationId: !!conversationId },
    "Processing prompt request",
  );

  try {
    // Get user context for personalization
    const userContext = (await getUserContextForPrompt(userId)) as UserContext;
    const agentDefinition = await getAgent(
      userId,
      getRequestedAgentActorId(context),
    );

    // Fetch asset contents if provided
    const assetContents = context?.assets
      ? await fetchAssetContents(context.assets, userId)
      : undefined;

    const hasAssets = assetContents && assetContents.length > 0;
    const isBackgroundTask = context?.backgroundTaskExecution === true;
    const includeTools = !hasAssets || isBackgroundTask;

    // Load conversation history if exists
    let previousMessages: AIMessage[] | undefined;
    if (conversationId) {
      try {
        previousMessages = await loadConversationMessages(
          conversationId,
          userId,
        );
      } catch (error) {
        if (error instanceof ConversationNotFoundError) {
          throw error;
        }
        logger.warn(
          { conversationId, error },
          "Failed to load conversation, starting fresh",
        );
      }
    }

    const agentRuntimeKind = agentDefinition.modelId
      ? getAgentRuntimeKindForModel(agentDefinition.modelId)
      : "native";

    const effectiveSkillNames = filterSkillNames(
      agentDefinition.skillNames,
      userContext,
    );

    const agent = createBackendAgent({
      agent: agentDefinition,
      userContext,
      includeTools,
      isBackgroundTask,
      assetContents,
      enableThinking,
      callerScopes,
    });

    const runtimeContext = createRuntimeContext({
      userId,
      requestId,
      conversationId,
      extra: {
        userContext,
        agent: agentDefinition,
        ...(agentRuntimeKind === "native"
          ? { allowedSkillNames: effectiveSkillNames }
          : {}),
        callerAuthMethod,
        callerActorKind,
        callerScopes,
        backgroundTaskExecution: isBackgroundTask,
      },
    });

    const previousRuntimeMessages = previousMessages
      ? convertFromLlm(previousMessages)
      : undefined;

    const result = await agent.generate({
      prompt,
      context: runtimeContext,
      messages: previousRuntimeMessages,
    });

    const finalConversationId = await saveConversationMessages({
      conversationId,
      userId,
      agentActorId: agentDefinition.id,
      prompt,
      result,
      requestId,
    });

    const endTime = Date.now();
    logger.info(
      {
        requestId,
        userId,
        conversationId: finalConversationId,
        totalExecutionTimeMs: endTime - startTime,
        totalSteps: result.steps.length,
        totalToolCalls: result.toolCallSummaries.length,
      },
      "Prompt request completed",
    );

    return {
      type: "text_response",
      response: result.text,
      requestId: requestId || `req_text_${Date.now()}`,
      conversationId: finalConversationId,
      thinkingContent: result.thinking || null,
      toolCalls:
        result.toolCallSummaries.length > 0
          ? result.toolCallSummaries
          : undefined,
    };
  } catch (error) {
    const endTime = Date.now();
    logger.error(
      {
        requestId,
        userId,
        totalExecutionTimeMs: endTime - startTime,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error processing prompt request",
    );
    throw error;
  }
}

// Streaming event types for API compatibility
export interface StreamEvent {
  type:
    | "thought"
    | "tool-call"
    | "text-chunk"
    | "error"
    | "done"
    | "approval-required"
    | "approval-resolved";
  timestamp?: string;
  content?: string;
  /** Tool call ID — used for tracking parallel tool executions */
  id?: string;
  name?: string;
  status?: "starting" | "executing" | "completed" | "error";
  arguments?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  requestId?: string;
  conversationId?: string;
  totalTokens?: number;
  executionTimeMs?: number;
  responseType?: string;
  thinkingContent?: string;
  toolCalls?: ToolCallSummaryOutput[];
  /** Human-readable tool label (for approval events) */
  label?: string;
  /** Whether the approval was granted (for approval-resolved events) */
  approved?: boolean;
  /** Reason for approval/denial */
  reason?: string;
}

/**
 * Transform RuntimeAgent stream events to API-compatible stream events.
 * Returns null for internal events that shouldn't be sent to the frontend.
 */
export function transformRuntimeEvent(
  event: RuntimeStreamEvent,
): StreamEvent | null {
  const timestamp = new Date().toISOString();

  switch (event.type) {
    case "text_delta":
      return { type: "text-chunk", content: event.text, timestamp };

    case "thinking_delta":
      return { type: "thought", content: event.text, timestamp };

    case "tool_call_start":
      return {
        type: "tool-call",
        id: event.id,
        name: event.name,
        status: "starting",
        timestamp,
      };

    case "tool_call_end":
      return {
        type: "tool-call",
        id: event.id,
        name: event.name,
        status: "starting",
        arguments: event.arguments,
        timestamp,
      };

    case "tool_progress":
      return {
        type: "tool-call",
        id: event.id,
        name: event.name,
        status: "executing",
        timestamp,
      };

    case "tool_result": {
      const isError = event.result.isError;
      const textContent = event.result.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n");

      if (isError) {
        return {
          type: "tool-call",
          id: event.id,
          name: event.name,
          status: "error",
          error: textContent,
          timestamp,
        };
      }
      return {
        type: "tool-call",
        id: event.id,
        name: event.name,
        status: "completed",
        result: textContent,
        timestamp,
      };
    }

    case "tool_approval_required":
      return {
        type: "approval-required",
        id: event.id,
        name: event.name,
        label: event.label,
        arguments: event.arguments,
        timestamp,
      };

    case "tool_approval_resolved":
      return {
        type: "approval-resolved",
        id: event.id,
        name: event.name,
        approved: event.approved,
        reason: event.reason,
        timestamp,
      };

    case "error":
      return { type: "error", error: event.error, timestamp };

    // Internal events — not sent to frontend
    case "text_start":
    case "text_end":
    case "thinking_start":
    case "thinking_end":
    case "tool_call_delta":
    case "message_complete":
    case "turn_complete":
      return null;

    default:
      return null;
  }
}

/**
 * Process a prompt request with streaming response
 */
export async function processPromptRequestStream(
  options: ProcessPromptOptions,
): Promise<ReadableStream<StreamEvent>> {
  const {
    userId,
    prompt,
    context,
    requestId,
    conversationId,
    enableThinking,
    callerAuthMethod,
    callerActorKind,
    callerScopes,
  } = options;

  const startTime = Date.now();
  logger.info(
    { requestId, userId, hasConversationId: !!conversationId },
    "Processing streaming prompt request",
  );

  // Get user context for personalization
  const userContext = (await getUserContextForPrompt(userId)) as UserContext;
  const agentDefinition = await getAgent(
    userId,
    getRequestedAgentActorId(context),
  );

  // Fetch asset contents if provided
  const assetContents = context?.assets
    ? await fetchAssetContents(context.assets, userId)
    : undefined;

  const hasAssets = assetContents && assetContents.length > 0;
  const isBackgroundTask = context?.backgroundTaskExecution === true;
  const includeTools = !hasAssets || isBackgroundTask;

  // Load conversation history if exists
  let previousMessages: AIMessage[] | undefined;
  if (conversationId) {
    try {
      previousMessages = await loadConversationMessages(conversationId, userId);
    } catch (error) {
      if (error instanceof ConversationNotFoundError) {
        // Return error stream
        return new ReadableStream<StreamEvent>({
          start(controller) {
            controller.enqueue({
              type: "error",
              error: "Conversation not found",
              timestamp: new Date().toISOString(),
            });
            controller.close();
          },
        });
      }
      logger.warn(
        { conversationId, error },
        "Failed to load conversation, starting fresh",
      );
    }
  }

  const streamAgentRuntimeKind = agentDefinition.modelId
    ? getAgentRuntimeKindForModel(agentDefinition.modelId)
    : "native";

  const streamEffectiveSkillNames = filterSkillNames(
    agentDefinition.skillNames,
    userContext,
  );

  const agent = createBackendAgent({
    agent: agentDefinition,
    userContext,
    includeTools,
    isBackgroundTask,
    assetContents,
    enableThinking,
    callerScopes,
  });

  const runtimeContext = createRuntimeContext({
    userId,
    requestId,
    conversationId,
    extra: {
      userContext,
      agent: agentDefinition,
      ...(streamAgentRuntimeKind === "native"
        ? { allowedSkillNames: streamEffectiveSkillNames }
        : {}),
      callerAuthMethod,
      callerActorKind,
      callerScopes,
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
              conversationId,
              userId,
              agentActorId: agentDefinition.id,
              prompt,
              result,
              requestId,
            });

            const endTime = Date.now();

            controller.enqueue({
              type: "done",
              requestId: requestId || `req_stream_${Date.now()}`,
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
                requestId,
                userId,
                conversationId: finalConversationId,
                totalExecutionTimeMs: endTime - startTime,
                totalSteps: result.steps.length,
                totalToolCalls: result.toolCallSummaries.length,
              },
              "Streaming prompt request completed",
            );
            continue;
          }

          const event = transformRuntimeEvent(value);
          if (event) controller.enqueue(event);
        }
      } catch (error) {
        logger.error(
          {
            requestId,
            userId,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          "Error in streaming prompt request",
        );

        controller.enqueue({
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        });
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });
}
