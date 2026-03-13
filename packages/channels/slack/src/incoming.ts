import type { WebClient } from "@slack/web-api";
import { DEFAULT_CHANNEL_AGENT_ACTOR_ID } from "@eclaire/channels-core";
import { getDeps } from "./deps.js";
import { stopBot } from "./bot-manager.js";
import { getSession } from "./commands.js";
import { splitMessage, convertMarkdownToMrkdwn } from "./message-utils.js";
import { sendStreamingResponse } from "./stream-sender.js";
import {
  addThinkingReaction,
  removeThinkingReaction,
} from "./typing-indicator.js";

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
  const {
    findChannel,
    logger,
    processPromptRequest,
    recordHistory,
    routeChannelPrompt,
  } = getDeps();

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
    const channel = await findChannel(channelId, userId);

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

    const routing = routeChannelPrompt
      ? await routeChannelPrompt(
          userId,
          text,
          channel.agentActorId ?? DEFAULT_CHANNEL_AGENT_ACTOR_ID,
        )
      : {
          agentActorId: channel.agentActorId ?? DEFAULT_CHANNEL_AGENT_ACTOR_ID,
          prompt: text,
        };

    if (routing.error) {
      await client.chat.postMessage({
        channel: slackChannelId,
        thread_ts: messageTs,
        text: routing.error,
      });
      return;
    }

    const sessionState = getSession(channelId);
    const channelAgentActorId = routing.agentActorId;
    const routedPrompt = routing.prompt;
    if (
      sessionState.agentActorId &&
      sessionState.agentActorId !== channelAgentActorId
    ) {
      sessionState.sessionId = undefined;
      sessionState.agentActorId = undefined;
    }

    // Add thinking reaction as typing indicator
    await addThinkingReaction(client, slackChannelId, messageTs, logger);

    const deps = getDeps();
    const requestId = `slack-${channelId}-${Date.now()}`;

    // Get or lazily create session for multi-turn context
    if (
      (!sessionState.sessionId ||
        sessionState.agentActorId !== channelAgentActorId) &&
      deps.createSession
    ) {
      try {
        const session = await deps.createSession(
          userId,
          undefined,
          channelAgentActorId,
        );
        sessionState.sessionId = session.id;
        sessionState.agentActorId = channelAgentActorId;
      } catch (sessionError) {
        logger.warn(
          {
            channelId,
            error:
              sessionError instanceof Error
                ? sessionError.message
                : "Unknown error",
          },
          "Failed to create session, continuing without session tracking",
        );
      }
    }

    const sessionId = sessionState.sessionId;
    const enableThinking = sessionState.enableThinking ?? false;

    let responseText: string | undefined;

    if (deps.processPromptRequestStream) {
      const stream = await deps.processPromptRequestStream({
        userId,
        prompt: routedPrompt,
        context: { agentActorId: channelAgentActorId },
        requestId,
        conversationId: sessionId,
        enableThinking,
      });

      responseText = await sendStreamingResponse(
        client,
        slackChannelId,
        stream,
        { logger },
      );
    } else {
      // Non-streaming fallback
      const result = await processPromptRequest({
        userId,
        prompt: routedPrompt,
        context: { agentActorId: channelAgentActorId },
        requestId,
        conversationId: sessionId,
        enableThinking,
      });

      responseText = result.response;
      if (responseText) {
        const mrkdwn = convertMarkdownToMrkdwn(responseText);
        const chunks = splitMessage(mrkdwn);
        for (let i = 0; i < chunks.length; i++) {
          const chunkText = chunks[i] ?? "";
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
      actor: "human",
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
