import { createRetry } from "@eclaire/channels-core";
import { DiscordAPIError } from "discord.js";

/**
 * Extracts the retry_after delay (in ms) from a Discord 429 error, if present.
 */
export function getRetryAfterMs(err: unknown): number | null {
  if (err instanceof DiscordAPIError && err.status === 429) {
    // DiscordAPIError exposes retryAfter in seconds
    const retryAfter = (err as DiscordAPIError & { retryAfter?: number })
      .retryAfter;
    if (typeof retryAfter === "number" && retryAfter > 0) {
      return retryAfter * 1000;
    }
    // Fallback: 5 seconds
    return 5000;
  }
  return null;
}

export const { withRetry, isRecoverableError } = createRetry({
  // Discord API rate limit (429)
  isRecoverable: (err) => err instanceof DiscordAPIError && err.status === 429,
  getRetryAfterMs,
});
