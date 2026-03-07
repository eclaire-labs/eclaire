import type { Telegram } from "telegraf";
import type { TelegramLogger } from "./deps.js";

const MAX_CONSECUTIVE_FAILURES = 10;

interface CircuitState {
  consecutiveFailures: number;
  suspended: boolean;
}

// Track circuit breaker state per bot token
const circuitStates = new Map<string, CircuitState>();

function getState(botToken: string): CircuitState {
  let state = circuitStates.get(botToken);
  if (!state) {
    state = { consecutiveFailures: 0, suspended: false };
    circuitStates.set(botToken, state);
  }
  return state;
}

/**
 * Sends a chat action (e.g. "typing") with circuit breaker protection.
 * After repeated 401 errors, suspends further calls to avoid triggering
 * Telegram's bot token revocation.
 */
export async function safeSendChatAction(
  telegram: Telegram,
  chatId: string | number,
  action: string,
  logger: TelegramLogger,
): Promise<void> {
  // Use a stable identifier - the bot token is available on the telegram instance
  const botToken = (telegram as { token?: string }).token ?? "unknown";
  const state = getState(botToken);

  if (state.suspended) {
    return;
  }

  try {
    await telegram.sendChatAction(chatId, action as "typing");
    // Reset on success
    state.consecutiveFailures = 0;
  } catch (err) {
    const errorCode = getErrorCode(err);
    if (errorCode === 401) {
      state.consecutiveFailures++;
      if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        state.suspended = true;
        logger.error(
          {
            consecutiveFailures: state.consecutiveFailures,
          },
          "sendChatAction suspended after repeated 401 errors — bot token may be invalid",
        );
      }
    }
    // Swallow the error — typing indicator is non-critical
  }
}

/**
 * Resets the circuit breaker for a given bot token.
 * Call this when a bot is stopped/restarted.
 */
export function resetCircuitBreaker(botToken: string): void {
  circuitStates.delete(botToken);
}

function getErrorCode(err: unknown): number | null {
  if (
    err &&
    typeof err === "object" &&
    "response" in err &&
    err.response &&
    typeof err.response === "object" &&
    "error_code" in err.response &&
    typeof err.response.error_code === "number"
  ) {
    return err.response.error_code;
  }
  return null;
}
