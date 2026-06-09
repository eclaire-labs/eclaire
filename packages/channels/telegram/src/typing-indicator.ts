import type { ChannelLogger } from "@eclaire/channels-core";
import { createCircuitBreaker } from "@eclaire/channels-core";
import type { Telegram } from "telegraf";

import { getErrorCode } from "./retry.js";

// Track circuit breaker state per bot token. Only 401s count toward
// suspension — repeated 401 calls can trigger Telegram's token revocation.
const breaker = createCircuitBreaker({
  shouldCountFailure: (err) => getErrorCode(err) === 401,
});

/**
 * Sends a chat action (e.g. "typing") with circuit breaker protection.
 * After repeated 401 errors, suspends further calls to avoid triggering
 * Telegram's bot token revocation.
 */
export async function safeSendChatAction(
  telegram: Telegram,
  chatId: string | number,
  action: string,
  logger: ChannelLogger,
): Promise<void> {
  // Use a stable identifier - the bot token is available on the telegram instance
  const botToken = (telegram as { token?: string }).token ?? "unknown";

  await breaker.run(
    botToken,
    () => telegram.sendChatAction(chatId, action as "typing"),
    (consecutiveFailures) => {
      logger.error(
        { consecutiveFailures },
        "sendChatAction suspended after repeated 401 errors — bot token may be invalid",
      );
    },
  );
}

/**
 * Resets the circuit breaker for a given bot token.
 * Call this when a bot is stopped/restarted.
 */
export const resetCircuitBreaker = breaker.reset;
