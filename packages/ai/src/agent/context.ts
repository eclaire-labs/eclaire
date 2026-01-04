/**
 * Agent Context
 *
 * Context creation and utilities for agent execution.
 */

import type { AgentContext, CreateContextOptions } from "./types.js";

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `req_${timestamp}_${random}`;
}

/**
 * Create an agent context for execution.
 *
 * @example
 * ```typescript
 * const context = createAgentContext({
 *   userId: "user_123",
 *   requestId: "req_abc",
 *   conversationId: "conv_xyz",
 *   userContext: { displayName: "Alice", timezone: "America/New_York" },
 * });
 * ```
 */
export function createAgentContext<TUserContext = unknown>(
  options: CreateContextOptions<TUserContext>
): AgentContext<TUserContext> {
  return {
    userId: options.userId,
    requestId: options.requestId ?? generateRequestId(),
    conversationId: options.conversationId,
    userContext: options.userContext,
    startTime: Date.now(),
    abortSignal: options.abortSignal,
  };
}

/**
 * Check if an agent context has been aborted
 */
export function isContextAborted(context: AgentContext): boolean {
  return context.abortSignal?.aborted ?? false;
}

/**
 * Get elapsed time since context creation in milliseconds
 */
export function getContextElapsedMs(context: AgentContext): number {
  return Date.now() - context.startTime;
}

/**
 * Create a child context with updated properties
 */
export function extendContext<TUserContext = unknown>(
  parent: AgentContext<TUserContext>,
  updates: Partial<CreateContextOptions<TUserContext>>
): AgentContext<TUserContext> {
  return {
    ...parent,
    ...updates,
    startTime: parent.startTime, // Preserve original start time
  };
}
