/**
 * Slash-command handler bodies shared by all channel adapters.
 *
 * Each action returns the reply string; operational failures throw and are
 * mapped to platform-appropriate error replies by the adapter. Registration
 * plumbing (Telegraf commands, Discord interactions, Bolt handlers) stays
 * per-adapter.
 */

import { BUILTIN_COMMANDS, generateHelpText } from "@eclaire/core";

import type { ChannelDeps } from "./deps.js";
import { DEFAULT_CHANNEL_AGENT_ACTOR_ID } from "./types.js";

/** Per-conversation session state shared by command and incoming handlers. */
export interface CommandSessionState {
  sessionId?: string;
  agentActorId?: string;
  enableThinking: boolean;
}

async function resolveAgentActorId(
  deps: ChannelDeps,
  channelId: string,
  userId: string,
): Promise<string> {
  const channel = await deps.findChannel(channelId, userId);
  return channel?.agentActorId ?? DEFAULT_CHANNEL_AGENT_ACTOR_ID;
}

/** Start a fresh conversation session and point `state` at it. */
export async function startNewConversation(
  deps: ChannelDeps,
  state: CommandSessionState,
  channelId: string,
  userId: string,
): Promise<string> {
  if (!deps.createSession) {
    return "Session management is not available.";
  }
  const agentActorId = await resolveAgentActorId(deps, channelId, userId);
  const session = await deps.createSession(userId, undefined, agentActorId);
  state.sessionId = session.id;
  state.agentActorId = agentActorId;
  return "New conversation started.";
}

/** Delete the current session (if any) and start fresh. */
export async function clearConversation(
  deps: ChannelDeps,
  state: CommandSessionState,
  channelId: string,
  userId: string,
): Promise<string> {
  if (state.sessionId && deps.deleteSession) {
    await deps.deleteSession(state.sessionId, userId);
  }
  state.sessionId = undefined;
  state.agentActorId = undefined;

  if (deps.createSession) {
    const agentActorId = await resolveAgentActorId(deps, channelId, userId);
    const session = await deps.createSession(userId, undefined, agentActorId);
    state.sessionId = session.id;
    state.agentActorId = agentActorId;
  }
  return "Conversation cleared.";
}

/** List the user's recent conversations for this channel's agent. */
export async function listConversationHistory(
  deps: ChannelDeps,
  channelId: string,
  userId: string,
): Promise<string> {
  if (!deps.listSessions) {
    return "Session history is not available.";
  }
  const agentActorId = await resolveAgentActorId(deps, channelId, userId);
  const sessions = await deps.listSessions(userId, 10, undefined, agentActorId);
  if (sessions.length === 0) {
    return "No conversations found.";
  }
  const lines = sessions.map((s, i) => {
    const t = s.title || "New session";
    const title = t.length > 40 ? `${t.slice(0, 37)}...` : t;
    return `${i + 1}. ${title} (${s.messageCount} msgs)`;
  });
  return `Recent conversations:\n\n${lines.join("\n")}`;
}

/** Describe the currently configured AI model. */
export function describeModel(deps: ChannelDeps): string {
  if (!deps.getModelInfo) {
    return "Model information is not available.";
  }
  const info = deps.getModelInfo();
  if (!info) {
    return "No model is currently configured.";
  }
  return `Current model: ${info.name}\nProvider: ${info.provider}\nModel: ${info.model}`;
}

/** Toggle thinking mode on the session state. */
export function toggleThinking(state: CommandSessionState): string {
  state.enableThinking = !state.enableThinking;
  return `Thinking mode: ${state.enableThinking ? "ON" : "OFF"}`;
}

/** Help text for the channel-surface builtin commands. */
export function buildHelpText(commandPrefix = ""): string {
  const channelCommands = BUILTIN_COMMANDS.filter(
    (c) => !c.surfaces || c.surfaces.includes("channel"),
  );
  const helpText = generateHelpText(channelCommands, commandPrefix);
  return `Available commands:\n\n${helpText}`;
}
