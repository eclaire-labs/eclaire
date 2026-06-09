import type { ChannelLogger } from "@eclaire/channels-core";
import { createCircuitBreaker } from "@eclaire/channels-core";
import type { TextChannel } from "discord.js";

// Track circuit breaker state per channel ID
const breaker = createCircuitBreaker();

/**
 * Sends a typing indicator with circuit breaker protection.
 * After repeated failures, suspends further calls to avoid spamming.
 */
export async function safeSendTyping(
  channel: TextChannel,
  logger: ChannelLogger,
): Promise<void> {
  await breaker.run(
    channel.id,
    () => channel.sendTyping(),
    (consecutiveFailures) => {
      logger.error(
        { channelId: channel.id, consecutiveFailures },
        "sendTyping suspended after repeated failures — bot may lack permissions",
      );
    },
  );
}

/**
 * Resets the circuit breaker for a given channel ID.
 * Call this when a channel is stopped/restarted.
 */
export const resetCircuitBreaker = breaker.reset;
