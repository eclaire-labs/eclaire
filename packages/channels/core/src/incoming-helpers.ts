/**
 * Shared pieces of the adapters' incoming-message flows. The overall
 * handler skeleton stays per-adapter (platform quirks dominate); only the
 * identical routing and session blocks live here.
 */

import type { CommandSessionState } from "./command-actions.js";
import type { ChannelDeps } from "./deps.js";
import type { ChannelRecord } from "./types.js";
import { DEFAULT_CHANNEL_AGENT_ACTOR_ID } from "./types.js";

export interface PromptRouting {
  agentActorId: string;
  prompt: string;
  addressedAgentName?: string;
  error?: string;
}

/**
 * Resolve which agent should handle a prompt (and the possibly rewritten
 * prompt), falling back to the channel's default agent when no router is
 * injected. A non-empty `error` means the adapter should reply with it
 * and stop.
 */
export async function resolvePromptRouting(
  deps: ChannelDeps,
  userId: string,
  prompt: string,
  channel: ChannelRecord,
): Promise<PromptRouting> {
  const defaultAgentActorId =
    channel.agentActorId ?? DEFAULT_CHANNEL_AGENT_ACTOR_ID;
  return deps.routeChannelPrompt
    ? deps.routeChannelPrompt(userId, prompt, defaultAgentActorId)
    : { agentActorId: defaultAgentActorId, prompt };
}

/**
 * Make session state match the routed agent: reset on agent mismatch and
 * lazily create a session if possible. Creation failures are logged and
 * swallowed — the message is still processed without session tracking.
 */
export async function ensureSession(
  deps: ChannelDeps,
  state: CommandSessionState,
  userId: string,
  agentActorId: string,
  channelId: string,
): Promise<void> {
  if (state.agentActorId && state.agentActorId !== agentActorId) {
    state.sessionId = undefined;
    state.agentActorId = undefined;
  }

  if (
    (!state.sessionId || state.agentActorId !== agentActorId) &&
    deps.createSession
  ) {
    try {
      const session = await deps.createSession(userId, undefined, agentActorId);
      state.sessionId = session.id;
      state.agentActorId = agentActorId;
    } catch (sessionError) {
      deps.logger.warn(
        {
          channelId,
          error:
            sessionError instanceof Error
              ? sessionError.message
              : "Unknown error",
        },
        "Failed to create session, continuing without session tracking",
      );
    }
  }
}
