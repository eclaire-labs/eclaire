import type { Telegram } from "telegraf";
import type { StreamEvent, TelegramLogger } from "./deps.js";
import { splitMessage } from "./message-utils.js";
import { withRetry } from "./retry.js";

const THROTTLE_MS = 1000;
const MIN_CHARS_BEFORE_FIRST_EDIT = 30;
const MAX_MESSAGE_LENGTH = 4096;
const CURSOR = "▍";

interface StreamSenderOptions {
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  logger: TelegramLogger;
}

/**
 * Streams AI response text into a Telegram chat by sending an initial message
 * and progressively editing it as text chunks arrive.
 *
 * Returns the final accumulated response text.
 */
export async function sendStreamingResponse(
  telegram: Telegram,
  chatId: string | number,
  stream: ReadableStream<StreamEvent>,
  options: StreamSenderOptions,
): Promise<string> {
  const { logger, parseMode } = options;
  const sendOpts = parseMode ? { parse_mode: parseMode } : {};

  let accumulatedText = "";
  let lastEditedText = "";
  let messageId: number | null = null;
  let lastEditTime = 0;
  let pendingEdit = false;
  let editTimer: ReturnType<typeof setTimeout> | null = null;
  // Track all message IDs sent (for multi-message streaming)
  const sentMessageIds: number[] = [];

  const reader = stream.getReader();

  async function sendInitialMessage(): Promise<number> {
    const result = await withRetry(() =>
      telegram.sendMessage(chatId, CURSOR, sendOpts),
    );
    sentMessageIds.push(result.message_id);
    return result.message_id;
  }

  async function editMessage(text: string, msgId: number): Promise<void> {
    if (text === lastEditedText) return;

    try {
      await withRetry(() =>
        telegram.editMessageText(chatId, msgId, undefined, text, sendOpts),
      );
      lastEditedText = text;
    } catch (err) {
      // "message is not modified" is harmless — text was already current
      const msg = err instanceof Error ? err.message : "";
      if (!msg.includes("message is not modified")) {
        logger.warn(
          { chatId, messageId: msgId, error: msg },
          "Failed to edit streaming message",
        );
      }
    }
  }

  async function startNewMessage(): Promise<number> {
    // Finalize current message (remove cursor)
    if (messageId !== null) {
      const currentChunkText = getTextForCurrentMessage();
      await editMessage(currentChunkText, messageId);
    }
    const result = await withRetry(() =>
      telegram.sendMessage(chatId, CURSOR, sendOpts),
    );
    sentMessageIds.push(result.message_id);
    return result.message_id;
  }

  function getTextForCurrentMessage(): string {
    // If we've sent previous messages, figure out what text belongs to the current one
    if (sentMessageIds.length <= 1) {
      return accumulatedText;
    }
    // Split the text and return the last chunk
    const chunks = splitMessage(
      accumulatedText,
      MAX_MESSAGE_LENGTH - CURSOR.length - 1,
    );
    return chunks[chunks.length - 1] ?? accumulatedText;
  }

  function clearEditTimer(): void {
    if (editTimer) {
      clearTimeout(editTimer);
      editTimer = null;
    }
  }

  async function throttledEdit(): Promise<void> {
    if (messageId === null) return;

    const currentText = getTextForCurrentMessage();
    if (
      currentText.length < MIN_CHARS_BEFORE_FIRST_EDIT &&
      lastEditedText === ""
    ) {
      return;
    }

    const now = Date.now();
    const elapsed = now - lastEditTime;

    if (elapsed >= THROTTLE_MS) {
      await editMessage(currentText + CURSOR, messageId);
      lastEditTime = now;
      pendingEdit = false;
    } else if (!pendingEdit) {
      pendingEdit = true;
      const delay = THROTTLE_MS - elapsed;
      editTimer = setTimeout(async () => {
        if (messageId !== null) {
          const text = getTextForCurrentMessage();
          await editMessage(text + CURSOR, messageId);
          lastEditTime = Date.now();
          pendingEdit = false;
        }
      }, delay);
    }
  }

  try {
    messageId = await sendInitialMessage();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      switch (value.type) {
        case "text-chunk": {
          if (value.content) {
            accumulatedText += value.content;

            // Check if we need to start a new message (approaching limit)
            const currentText = getTextForCurrentMessage();
            if (currentText.length > MAX_MESSAGE_LENGTH - CURSOR.length - 100) {
              clearEditTimer();
              messageId = await startNewMessage();
              lastEditedText = "";
              lastEditTime = 0;
            }

            await throttledEdit();
          }
          break;
        }

        case "error": {
          const errorText =
            value.error ?? "An error occurred while generating the response.";
          if (messageId !== null) {
            clearEditTimer();
            await editMessage(errorText, messageId);
          }
          return accumulatedText;
        }

        case "done": {
          // Final edit handled after loop
          break;
        }

        // Ignore thought, tool-call events for now
        default:
          break;
      }
    }

    // Final edit: remove cursor, show complete text
    clearEditTimer();

    if (accumulatedText.length === 0) {
      if (messageId !== null) {
        await editMessage("No response was generated.", messageId);
      }
    } else {
      // Handle case where text needs multiple messages
      const currentText = getTextForCurrentMessage();
      if (messageId !== null) {
        await editMessage(currentText, messageId);
      }
    }

    return accumulatedText;
  } catch (err) {
    clearEditTimer();
    logger.error(
      {
        chatId,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      "Error in streaming response",
    );

    // Try to update the message with an error indication
    if (messageId !== null) {
      try {
        const fallback =
          accumulatedText || "An error occurred while generating the response.";
        await editMessage(fallback, messageId);
      } catch {
        // Best effort — already logged above
      }
    }

    return accumulatedText;
  } finally {
    reader.releaseLock();
  }
}
