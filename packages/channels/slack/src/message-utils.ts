import { splitMessage as splitMessageCore } from "@eclaire/channels-core";

/** Slack messages are capped at 4000 chars of text; leave headroom. */
export const SLACK_MAX_MESSAGE_LENGTH = 3900;

/** Splits a message into chunks that respect Slack's character limit. */
export function splitMessage(text: string): string[] {
  return splitMessageCore(text, SLACK_MAX_MESSAGE_LENGTH);
}

/**
 * Converts standard Markdown to Slack's mrkdwn format.
 *
 * Key differences:
 * - Bold: **text** -> *text*
 * - Italic: *text* or _text_ -> _text_ (Slack uses _ for italic)
 * - Links: [text](url) -> <url|text>
 * - Strikethrough: ~~text~~ -> ~text~
 */
export function convertMarkdownToMrkdwn(text: string): string {
  let result = text;

  // 1. Escape special Slack characters to prevent mrkdwn injection.
  //    Must happen before any conversion that introduces intentional brackets.
  result = result.replace(/&/g, "&amp;");
  result = result.replace(/</g, "&lt;");
  result = result.replace(/>/g, "&gt;");

  // 2. Convert markdown links: [text](url) -> <url|text>
  //    These produce intentional Slack link brackets on already-escaped text.
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>");

  // 3. Convert bold: **text** -> *text*
  result = result.replace(/\*\*(.+?)\*\*/g, "*$1*");

  // 4. Convert strikethrough: ~~text~~ -> ~text~
  result = result.replace(/~~(.+?)~~/g, "~$1~");

  return result;
}
