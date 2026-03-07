import type { TextChannel } from "discord.js";
import type { DiscordLogger } from "./deps.js";

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
 * Sends a typing indicator with circuit breaker protection.
 * After repeated failures, suspends further calls to avoid spamming.
 */
export async function safeSendTyping(
  channel: TextChannel,
  logger: DiscordLogger,
): Promise<void> {
  const state = getState(channel.id);

  if (state.suspended) {
    return;
  }

  try {
    await channel.sendTyping();
    state.consecutiveFailures = 0;
  } catch (err) {
    state.consecutiveFailures++;
    if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      state.suspended = true;
      logger.error(
        {
          channelId: channel.id,
          consecutiveFailures: state.consecutiveFailures,
        },
        "sendTyping suspended after repeated failures — bot may lack permissions",
      );
    }
    // Swallow the error — typing indicator is non-critical
  }
}

/**
 * Resets the circuit breaker for a given channel ID.
 * Call this when a channel is stopped/restarted.
 */
export function resetCircuitBreaker(channelId: string): void {
  circuitStates.delete(channelId);
}
