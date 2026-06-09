import type { ChannelLogger, StreamEvent } from "@eclaire/channels-core";
import { sendStreamingResponse as sendStream } from "@eclaire/channels-core";
import type { WebClient } from "@slack/web-api";

import { withRetry } from "./retry.js";

const MAX_MESSAGE_LENGTH = 3900;
const CURSOR = "◍";

interface StreamSenderOptions {
  logger: ChannelLogger;
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
  return sendStream<SlackMessage>(stream, {
    transport: {
      async send(text) {
        const result = await withRetry(() =>
          client.chat.postMessage({ channel: channelId, text }),
        );
        return { channel: channelId, ts: result.ts as string };
      },
      async edit(msg, text) {
        await withRetry(() =>
          client.chat.update({ channel: msg.channel, ts: msg.ts, text }),
        );
      },
    },
    maxMessageLength: MAX_MESSAGE_LENGTH,
    cursor: CURSOR,
    logger: options.logger,
    logContext: { channelId },
  });
}
