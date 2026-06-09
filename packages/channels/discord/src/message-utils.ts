import { splitMessage as splitMessageCore } from "@eclaire/channels-core";

/** Discord messages are capped at 2000 chars; leave headroom. */
export const DISCORD_MAX_MESSAGE_LENGTH = 1900;

/** Splits a message into chunks that respect Discord's character limit. */
export function splitMessage(text: string): string[] {
  return splitMessageCore(text, DISCORD_MAX_MESSAGE_LENGTH);
}
