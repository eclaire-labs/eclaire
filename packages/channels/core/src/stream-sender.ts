/**
 * Streaming response sender shared by all channel adapters.
 *
 * Streams AI response text into a chat by sending an initial message and
 * progressively editing it as text chunks arrive: throttled edits with a
 * trailing cursor glyph, rollover to a new message when approaching the
 * platform's length limit, and error/empty-response handling.
 *
 * Platform specifics (how to send/edit a message, retry behavior) are
 * injected via `StreamTransport`.
 */

import type { ChannelLogger, StreamEvent } from "./deps.js";
import { splitMessage } from "./split-message.js";

const DEFAULT_THROTTLE_MS = 1000;
const DEFAULT_MIN_CHARS_BEFORE_FIRST_EDIT = 30;
const DEFAULT_CURSOR = "◍";

export interface StreamTransport<M> {
  /** Send a new message containing `text`. Wrap in the adapter's withRetry. */
  send(text: string): Promise<M>;
  /** Edit a message to `text`. Wrap in the adapter's withRetry; throw on failure. */
  edit(msg: M, text: string): Promise<void>;
  /** Edit errors to silently ignore (e.g. Telegram "message is not modified"). */
  isIgnorableEditError?: (err: unknown) => boolean;
}

export interface StreamSenderConfig<M> {
  transport: StreamTransport<M>;
  /** Platform message length limit (used for rollover to a new message). */
  maxMessageLength: number;
  cursor?: string;
  throttleMs?: number;
  minCharsBeforeFirstEdit?: number;
  logger: ChannelLogger;
  /** Extra fields for warn/error logs (e.g. { channelId } or { chatId }). */
  logContext?: Record<string, unknown>;
}

/**
 * Consume an AI response stream, mirroring it into chat messages.
 * Returns the final accumulated response text.
 */
export async function sendStreamingResponse<M>(
  stream: ReadableStream<StreamEvent>,
  config: StreamSenderConfig<M>,
): Promise<string> {
  const { transport, maxMessageLength, logger } = config;
  const cursor = config.cursor ?? DEFAULT_CURSOR;
  const throttleMs = config.throttleMs ?? DEFAULT_THROTTLE_MS;
  const minCharsBeforeFirstEdit =
    config.minCharsBeforeFirstEdit ?? DEFAULT_MIN_CHARS_BEFORE_FIRST_EDIT;
  const logContext = config.logContext ?? {};

  let accumulatedText = "";
  let lastEditedText = "";
  let currentMessage: M | null = null;
  let lastEditTime = 0;
  let pendingEdit = false;
  let editTimer: ReturnType<typeof setTimeout> | null = null;
  let sentMessageCount = 0;

  const reader = stream.getReader();

  async function sendCursorMessage(): Promise<M> {
    const msg = await transport.send(cursor);
    sentMessageCount++;
    return msg;
  }

  async function editMessage(text: string, msg: M): Promise<void> {
    if (text === lastEditedText) return;

    try {
      await transport.edit(msg, text);
      lastEditedText = text;
    } catch (err) {
      if (!transport.isIgnorableEditError?.(err)) {
        logger.warn(
          {
            ...logContext,
            error: err instanceof Error ? err.message : "",
          },
          "Failed to edit streaming message",
        );
      }
    }
  }

  async function startNewMessage(): Promise<M> {
    // Finalize current message (remove cursor)
    if (currentMessage !== null) {
      const currentChunkText = getTextForCurrentMessage();
      await editMessage(currentChunkText, currentMessage);
    }
    return sendCursorMessage();
  }

  function getTextForCurrentMessage(): string {
    // If we've sent previous messages, figure out what text belongs to the current one
    if (sentMessageCount <= 1) {
      return accumulatedText;
    }
    // Split the text and return the last chunk
    const chunks = splitMessage(
      accumulatedText,
      maxMessageLength - cursor.length - 1,
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
    if (currentMessage === null) return;

    const currentText = getTextForCurrentMessage();
    if (currentText.length < minCharsBeforeFirstEdit && lastEditedText === "") {
      return;
    }

    const now = Date.now();
    const elapsed = now - lastEditTime;

    if (elapsed >= throttleMs) {
      await editMessage(currentText + cursor, currentMessage);
      lastEditTime = now;
      pendingEdit = false;
    } else if (!pendingEdit) {
      pendingEdit = true;
      const delay = throttleMs - elapsed;
      editTimer = setTimeout(async () => {
        if (currentMessage !== null) {
          const text = getTextForCurrentMessage();
          await editMessage(text + cursor, currentMessage);
          lastEditTime = Date.now();
          pendingEdit = false;
        }
      }, delay);
    }
  }

  try {
    currentMessage = await sendCursorMessage();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      switch (value.type) {
        case "text-chunk": {
          if (value.content) {
            accumulatedText += value.content;

            // Check if we need to start a new message (approaching limit)
            const currentText = getTextForCurrentMessage();
            if (currentText.length > maxMessageLength - cursor.length - 100) {
              clearEditTimer();
              currentMessage = await startNewMessage();
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
          if (currentMessage !== null) {
            clearEditTimer();
            await editMessage(errorText, currentMessage);
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
      if (currentMessage !== null) {
        await editMessage("No response was generated.", currentMessage);
      }
    } else {
      // Handle case where text needs multiple messages
      const currentText = getTextForCurrentMessage();
      if (currentMessage !== null) {
        await editMessage(currentText, currentMessage);
      }
    }

    return accumulatedText;
  } catch (err) {
    clearEditTimer();
    logger.error(
      {
        ...logContext,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      "Error in streaming response",
    );

    // Try to update the message with an error indication
    if (currentMessage !== null) {
      try {
        const fallback =
          accumulatedText || "An error occurred while generating the response.";
        await editMessage(fallback, currentMessage);
      } catch {
        // Best effort — already logged above
      }
    }

    return accumulatedText;
  } finally {
    reader.releaseLock();
  }
}
