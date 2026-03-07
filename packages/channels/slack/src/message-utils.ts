const DEFAULT_MAX_LENGTH = 3900;

/**
 * Splits a message into chunks that respect Slack's character limits.
 * Prefers splitting at paragraph, line, or sentence boundaries.
 */
export function splitMessage(
  text: string,
  maxLength = DEFAULT_MAX_LENGTH,
): string[] {
  if (text.length === 0) {
    return [];
  }

  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    const splitIndex = findSplitIndex(remaining, maxLength);
    chunks.push(remaining.slice(0, splitIndex).trimEnd());
    remaining = remaining.slice(splitIndex).trimStart();
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

function findSplitIndex(text: string, maxLength: number): number {
  // Try splitting at paragraph boundary (\n\n)
  const paragraphIdx = text.lastIndexOf("\n\n", maxLength);
  if (paragraphIdx > maxLength * 0.3) {
    return paragraphIdx + 2;
  }

  // Try splitting at line boundary (\n)
  const lineIdx = text.lastIndexOf("\n", maxLength);
  if (lineIdx > maxLength * 0.3) {
    return lineIdx + 1;
  }

  // Try splitting at sentence boundary (". ")
  const sentenceIdx = text.lastIndexOf(". ", maxLength);
  if (sentenceIdx > maxLength * 0.3) {
    return sentenceIdx + 2;
  }

  // Try splitting at word boundary (space)
  const spaceIdx = text.lastIndexOf(" ", maxLength);
  if (spaceIdx > maxLength * 0.3) {
    return spaceIdx + 1;
  }

  // Last resort: hard split
  return maxLength;
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
