import type { WebClient } from "@slack/web-api";
import type { StreamEvent, SlackLogger } from "./deps.js";
import { splitMessage } from "./message-utils.js";
import { withRetry } from "./retry.js";

const THROTTLE_MS = 1000;
const MIN_CHARS_BEFORE_FIRST_EDIT = 30;
const MAX_MESSAGE_LENGTH = 3900;
const CURSOR = "\u25CD";

interface StreamSenderOptions {
  logger: SlackLogger;
}

interface SlackMessage {
  channel: string;
  ts: string;
}

/**
 * Streams AI response text into a Slack channel by sending an initial message
 * and progressively editing it as text chunks arrive.
 *
 * Returns the final accumulated response text.
 */
export async function sendStreamingResponse(
  client: WebClient,
  channelId: string,
  stream: ReadableStream<StreamEvent>,
  options: StreamSenderOptions,
): Promise<string> {
  const { logger } = options;

  let accumulatedText = "";
  let lastEditedText = "";
  let currentMessage: SlackMessage | null = null;
  let lastEditTime = 0;
  let pendingEdit = false;
  let editTimer: ReturnType<typeof setTimeout> | null = null;
  const sentMessages: SlackMessage[] = [];

  const reader = stream.getReader();

  async function sendInitialMessage(): Promise<SlackMessage> {
    const result = await withRetry(() =>
      client.chat.postMessage({ channel: channelId, text: CURSOR }),
    );
    const msg: SlackMessage = { channel: channelId, ts: result.ts as string };
    sentMessages.push(msg);
    return msg;
  }

  async function editMessage(text: string, msg: SlackMessage): Promise<void> {
    if (text === lastEditedText) return;

    try {
      await withRetry(() =>
        client.chat.update({ channel: msg.channel, ts: msg.ts, text }),
      );
      lastEditedText = text;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "";
      logger.warn(
        { channelId, messageTs: msg.ts, error: errMsg },
        "Failed to edit streaming message",
      );
    }
  }

  async function startNewMessage(): Promise<SlackMessage> {
    // Finalize current message (remove cursor)
    if (currentMessage !== null) {
      const currentChunkText = getTextForCurrentMessage();
      await editMessage(currentChunkText, currentMessage);
    }
    const result = await withRetry(() =>
      client.chat.postMessage({ channel: channelId, text: CURSOR }),
    );
    const msg: SlackMessage = { channel: channelId, ts: result.ts as string };
    sentMessages.push(msg);
    return msg;
  }

  function getTextForCurrentMessage(): string {
    if (sentMessages.length <= 1) {
      return accumulatedText;
    }
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
    if (currentMessage === null) return;

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
      await editMessage(currentText + CURSOR, currentMessage);
      lastEditTime = now;
      pendingEdit = false;
    } else if (!pendingEdit) {
      pendingEdit = true;
      const delay = THROTTLE_MS - elapsed;
      editTimer = setTimeout(async () => {
        if (currentMessage !== null) {
          const text = getTextForCurrentMessage();
          await editMessage(text + CURSOR, currentMessage);
          lastEditTime = Date.now();
          pendingEdit = false;
        }
      }, delay);
    }
  }

  try {
    currentMessage = await sendInitialMessage();

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
          break;
        }

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
        channelId,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      "Error in streaming response",
    );

    if (currentMessage !== null) {
      try {
        const fallback =
          accumulatedText || "An error occurred while generating the response.";
        await editMessage(fallback, currentMessage);
      } catch {
        // Best effort
      }
    }

    return accumulatedText;
  } finally {
    reader.releaseLock();
  }
}
