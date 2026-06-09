import type { ChannelLogger, StreamEvent } from "@eclaire/channels-core";
import { sendStreamingResponse as sendStream } from "@eclaire/channels-core";
import type { Telegram } from "telegraf";

import { withRetry } from "./retry.js";

const MAX_MESSAGE_LENGTH = 4096;
const CURSOR = "▍";

interface StreamSenderOptions {
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  logger: ChannelLogger;
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

  return sendStream<number>(stream, {
    transport: {
      async send(text) {
        const result = await withRetry(() =>
          telegram.sendMessage(chatId, text, sendOpts),
        );
        return result.message_id;
      },
      async edit(messageId, text) {
        await withRetry(() =>
          telegram.editMessageText(
            chatId,
            messageId,
            undefined,
            text,
            sendOpts,
          ),
        );
      },
      // "message is not modified" is harmless — text was already current
      isIgnorableEditError: (err) =>
        err instanceof Error && err.message.includes("message is not modified"),
    },
    maxMessageLength: MAX_MESSAGE_LENGTH,
    cursor: CURSOR,
    logger,
    logContext: { chatId },
  });
}
