import { splitMessage as splitMessageCore } from "@eclaire/channels-core";

/** Telegram messages are capped at 4096 chars; leave headroom. */
export const TELEGRAM_MAX_MESSAGE_LENGTH = 4000;

/** Splits a message into chunks that respect Telegram's character limit. */
export function splitMessage(text: string): string[] {
  return splitMessageCore(text, TELEGRAM_MAX_MESSAGE_LENGTH);
}
