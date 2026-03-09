import type { WebClient } from "@slack/web-api";
import type { SlackLogger } from "./deps.js";

const MAX_CONSECUTIVE_FAILURES = 10;

interface CircuitState {
  consecutiveFailures: number;
  suspended: boolean;
}

// Track circuit breaker state per channel ID
const circuitStates = new Map<string, CircuitState>();

function getState(channelId: string): CircuitState {
  let state = circuitStates.get(channelId);
  if (!state) {
    state = { consecutiveFailures: 0, suspended: false };
    circuitStates.set(channelId, state);
  }
  return state;
}

/**
 * Adds a thinking reaction to a message as a typing indicator.
 * Slack bots cannot show native "typing..." so we use emoji reactions instead.
 * Uses circuit breaker protection to avoid spamming on permission failures.
 */
export async function addThinkingReaction(
  client: WebClient,
  channelId: string,
  messageTs: string,
  logger: SlackLogger,
): Promise<void> {
  const state = getState(channelId);

  if (state.suspended) {
    return;
  }

  try {
    await client.reactions.add({
      channel: channelId,
      timestamp: messageTs,
      name: "thinking_face",
    });
    state.consecutiveFailures = 0;
  } catch (_err) {
    state.consecutiveFailures++;
    if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      state.suspended = true;
      logger.error(
        {
          channelId,
          consecutiveFailures: state.consecutiveFailures,
        },
        "Thinking reaction suspended after repeated failures — bot may lack permissions",
      );
    }
    // Swallow the error — typing indicator is non-critical
  }
}

/**
 * Removes the thinking reaction from a message.
 */
export async function removeThinkingReaction(
  client: WebClient,
  channelId: string,
  messageTs: string,
  logger: SlackLogger,
): Promise<void> {
  try {
    await client.reactions.remove({
      channel: channelId,
      timestamp: messageTs,
      name: "thinking_face",
    });
  } catch {
    // Best effort — reaction may have already been removed
    logger.debug(
      { channelId, messageTs },
      "Failed to remove thinking reaction (may already be removed)",
    );
  }
}

/**
 * Resets the circuit breaker for a given channel ID.
 * Call this when a channel is stopped/restarted.
 */
export function resetCircuitBreaker(channelId: string): void {
  circuitStates.delete(channelId);
}
