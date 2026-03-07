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

  // Convert links first (before bold conversion could interfere)
  // [text](url) -> <url|text>
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>");

  // Convert bold: **text** -> *text*
  result = result.replace(/\*\*(.+?)\*\*/g, "*$1*");

  // Convert strikethrough: ~~text~~ -> ~text~
  result = result.replace(/~~(.+?)~~/g, "~$1~");

  return result;
}
