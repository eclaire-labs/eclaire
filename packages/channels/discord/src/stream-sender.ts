import type { ChannelLogger, StreamEvent } from "@eclaire/channels-core";
import { sendStreamingResponse as sendStream } from "@eclaire/channels-core";
import type { Message, TextChannel } from "discord.js";

import { withRetry } from "./retry.js";

const MAX_MESSAGE_LENGTH = 2000;
const CURSOR = "◍";

interface StreamSenderOptions {
  logger: ChannelLogger;
}

/**
 * Streams AI response text into a Discord channel by sending an initial message
 * and progressively editing it as text chunks arrive.
 *
 * Returns the final accumulated response text.
 */
export async function sendStreamingResponse(
  channel: TextChannel,
  stream: ReadableStream<StreamEvent>,
  options: StreamSenderOptions,
): Promise<string> {
  return sendStream<Message>(stream, {
    transport: {
      send: (text) => withRetry(() => channel.send(text)),
      async edit(msg, text) {
        await withRetry(() => msg.edit(text));
      },
    },
    maxMessageLength: MAX_MESSAGE_LENGTH,
    cursor: CURSOR,
    logger: options.logger,
    logContext: { channelId: channel.id },
  });
}
