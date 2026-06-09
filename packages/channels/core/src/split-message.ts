/**
 * Message splitting shared by all channel adapters.
 * Each platform passes its own max length (Discord 1900, Slack 3900, Telegram 4000).
 */

/**
 * Splits a message into chunks that respect the platform's character limit.
 * Prefers splitting at paragraph, line, or sentence boundaries.
 */
export function splitMessage(text: string, maxLength: number): string[] {
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
    return paragraphIdx + 2; // Include the double newline in the first chunk
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
 * Send pre-split chunks sequentially with a small delay between them
 * to avoid platform rate limits. No delay after the last chunk.
 */
export async function sendInChunks(
  chunks: string[],
  send: (chunk: string) => Promise<unknown>,
  interChunkDelayMs = 100,
): Promise<void> {
  for (let i = 0; i < chunks.length; i++) {
    await send(chunks[i] ?? "");
    if (i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, interChunkDelayMs));
    }
  }
}
