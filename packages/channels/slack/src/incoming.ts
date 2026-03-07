import { and, eq } from "drizzle-orm";
import type { WebClient } from "@slack/web-api";
import { getDeps } from "./deps.js";
import { stopBot } from "./bot-manager.js";
import { splitMessage, convertMarkdownToMrkdwn } from "./message-utils.js";
import { sendStreamingResponse } from "./stream-sender.js";
import { addThinkingReaction, removeThinkingReaction } from "./typing-indicator.js";

/**
 * Handles incoming messages from Slack for bidirectional channels.
 */
export async function handleIncomingMessage(
  client: WebClient,
  text: string,
  slackChannelId: string,
  slackUserId: string,
  messageTs: string,
  channelId: string,
  userId: string,
): Promise<void> {
  const { db, schema, logger, processPromptRequest, recordHistory } =
    getDeps();
  const { channels } = schema;

  // Drop messages with no text
  if (!text) return;

  logger.info(
    {
      channelId,
      userId,
      slackUserId,
      messageLength: text.length,
    },
    "Processing incoming Slack message",
  );

  try {
    const channel = await db.query.channels.findFirst({
      where: and(eq(channels.id, channelId), eq(channels.userId, userId)),
    });

    if (!channel) {
      logger.warn(
        { channelId, userId },
        "Channel not found for incoming message - stopping bot",
      );
      await stopBot(channelId);
      return;
    }

    if (!channel.isActive) {
      logger.warn(
        { channelId, userId },
        "Channel is inactive for incoming message",
      );
      return;
    }

    if (channel.capability === "notification") {
      await client.chat.postMessage({
        channel: slackChannelId,
        thread_ts: messageTs,
        text: "This channel is configured for notifications only. I cannot respond to messages.",
      });
      return;
    }

    // Add thinking reaction as typing indicator
    await addThinkingReaction(client, slackChannelId, messageTs, logger);

    const deps = getDeps();
    const requestId = `slack-${channelId}-${Date.now()}`;

    let responseText: string | undefined;

    if (deps.processPromptRequestStream) {
      const stream = await deps.processPromptRequestStream(
        userId,
        text,
        { agent: "slack-bot" },
        requestId,
        undefined,
        false,
      );

      responseText = await sendStreamingResponse(
        client,
        slackChannelId,
        stream,
        { logger },
      );
    } else {
      // Non-streaming fallback
      const result = await processPromptRequest(
        userId,
        text,
        { agent: "slack-bot" },
        requestId,
        undefined,
        false,
      );

      responseText = result.response;
      if (responseText) {
        const mrkdwn = convertMarkdownToMrkdwn(responseText);
        const chunks = splitMessage(mrkdwn);
        for (let i = 0; i < chunks.length; i++) {
          const chunkText = chunks[i]!;
          await client.chat.postMessage({
            channel: slackChannelId,
            text: chunkText,
          });
          if (i < chunks.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
      }
    }

    // Remove thinking reaction
    await removeThinkingReaction(client, slackChannelId, messageTs, logger);

    // Record history
    await recordHistory({
      action: "slack_message_processed",
      itemType: "slack_chat",
      itemId: `slack-${slackUserId}-${Date.now()}`,
      itemName: "Slack Chat Message",
      beforeData: {
        message: text,
        slackUserId,
        channelId,
      },
      afterData: {
        response: responseText,
        platform: "slack",
        channelId,
      },
      actor: "user",
      userId,
      metadata: {
        platform: "slack",
        channelId,
      },
    });
  } catch (error) {
    logger.error(
      {
        channelId,
        userId,
        slackUserId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error processing Slack message",
    );

    // Remove thinking reaction on error
    await removeThinkingReaction(client, slackChannelId, messageTs, logger);

    await client.chat.postMessage({
      channel: slackChannelId,
      thread_ts: messageTs,
      text: "I encountered an error processing your message. Please try again later.",
    });
  }
}
