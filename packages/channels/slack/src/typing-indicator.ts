import type { ChannelLogger } from "@eclaire/channels-core";
import { createCircuitBreaker } from "@eclaire/channels-core";
import type { WebClient } from "@slack/web-api";

// Track circuit breaker state per channel ID
const breaker = createCircuitBreaker();

/**
 * Adds a thinking reaction to a message as a typing indicator.
 * Slack bots cannot show native "typing..." so we use emoji reactions instead.
 * Uses circuit breaker protection to avoid spamming on permission failures.
 */
export async function addThinkingReaction(
  client: WebClient,
  channelId: string,
  messageTs: string,
  logger: ChannelLogger,
): Promise<void> {
  await breaker.run(
    channelId,
    () =>
      client.reactions.add({
        channel: channelId,
        timestamp: messageTs,
        name: "thinking_face",
      }),
    (consecutiveFailures) => {
      logger.error(
        { channelId, consecutiveFailures },
        "Thinking reaction suspended after repeated failures — bot may lack permissions",
      );
    },
  );
}

/**
 * Removes the thinking reaction from a message.
 */
export async function removeThinkingReaction(
  client: WebClient,
  channelId: string,
  messageTs: string,
  logger: ChannelLogger,
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
export const resetCircuitBreaker = breaker.reset;
