import {
  ChannelRateLimiter,
  DEFAULT_CHANNEL_AGENT_ACTOR_ID,
} from "@eclaire/channels-core";
import { getDeps } from "./deps.js";
import { stopBot } from "./bot-manager.js";
import type { BotContext } from "./commands.js";
import { splitMessage } from "./message-utils.js";
import { sendStreamingResponse } from "./stream-sender.js";
import { safeSendChatAction } from "./typing-indicator.js";
import { Input } from "telegraf";

const rateLimiter = new ChannelRateLimiter();

/**
 * Handles incoming messages from Telegram for bidirectional channels.
 * Reads session state (sessionId, enableThinking) from ctx.session and
 * lazily creates a session on first message if deps.createSession is available.
 */
export async function handleIncomingMessage(
  ctx: BotContext,
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

  // biome-ignore lint/style/noNonNullAssertion: Telegraf text handler guarantees message
  if (!("text" in ctx.message!) || !ctx.message.text) {
    return;
  }

  const message = ctx.message.text;
  const telegramUserId = ctx.from?.id;
  const telegramUsername = ctx.from?.username;

  logger.info(
    {
      channelId,
      userId,
      telegramUserId,
      telegramUsername,
      messageLength: message.length,
    },
    "Processing incoming Telegram message",
  );

  if (!rateLimiter.allow(channelId)) {
    logger.warn(
      { channelId, userId },
      "Rate limited incoming Telegram message",
    );
    await ctx.reply(
      "You're sending messages too quickly. Please wait a moment before trying again.",
    );
    return;
  }

  try {
    // Get the channel to verify it supports chat/bidirectional
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
      await ctx.reply(
        "This channel is configured for notifications only. I cannot respond to messages.",
      );
      return;
    }

    const routing = routeChannelPrompt
      ? await routeChannelPrompt(
          userId,
          message,
          channel.agentActorId ?? DEFAULT_CHANNEL_AGENT_ACTOR_ID,
        )
      : {
          agentActorId: channel.agentActorId ?? DEFAULT_CHANNEL_AGENT_ACTOR_ID,
          prompt: message,
        };

    if (routing.error) {
      await ctx.reply(routing.error);
      return;
    }

    const channelAgentActorId = routing.agentActorId;
    const routedPrompt = routing.prompt;

    if (
      ctx.session.agentActorId &&
      ctx.session.agentActorId !== channelAgentActorId
    ) {
      ctx.session.sessionId = undefined;
      ctx.session.agentActorId = undefined;
    }

    // Send typing indicator (with circuit breaker protection)
    if (ctx.chat) {
      await safeSendChatAction(ctx.telegram, ctx.chat.id, "typing", logger);
    }

    const deps = getDeps();
    const requestId = `telegram-${channelId}-${Date.now()}`;

    // Lazily create a session on first message if possible
    if (
      (!ctx.session.sessionId ||
        ctx.session.agentActorId !== channelAgentActorId) &&
      deps.createSession
    ) {
      try {
        const session = await deps.createSession(
          userId,
          undefined,
          channelAgentActorId,
        );
        ctx.session.sessionId = session.id;
        ctx.session.agentActorId = channelAgentActorId;
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

    const sessionId = ctx.session.sessionId;
    const enableThinking = ctx.session.enableThinking ?? false;

    // Use streaming if available, otherwise fall back to non-streaming
    let responseText: string | undefined;

    if (deps.processPromptRequestStream && ctx.chat) {
      const stream = await deps.processPromptRequestStream({
        userId,
        prompt: routedPrompt,
        context: { agentActorId: channelAgentActorId },
        requestId,
        conversationId: sessionId,
        enableThinking,
      });

      responseText = await sendStreamingResponse(
        ctx.telegram,
        ctx.chat.id,
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
        const chunks = splitMessage(responseText);
        for (let i = 0; i < chunks.length; i++) {
          await ctx.reply(chunks[i] ?? "");
          if (i < chunks.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
      }
    }

    // Record history
    await recordHistory({
      action: "telegram_message_processed",
      itemType: "telegram_chat",
      itemId: `tg-${telegramUserId}-${Date.now()}`,
      itemName: "Telegram Chat Message",
      beforeData: {
        message,
        telegramUserId,
        telegramUsername,
        channelId,
      },
      afterData: {
        response: responseText,
        platform: "telegram",
        channelId,
      },
      actor: "human",
      userId: userId,
      metadata: {
        platform: "telegram",
        channelId,
      },
    });
  } catch (error) {
    logger.error(
      {
        channelId,
        userId,
        telegramUserId,
        telegramUsername,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error processing Telegram message",
    );

    await ctx.reply(
      "I encountered an error processing your message. Please try again later.",
    );
  }
}

/**
 * Handles incoming voice messages from Telegram.
 * Downloads the voice file (OGG/Opus), transcribes via STT, processes through
 * the AI agent, and replies with text + optional voice note.
 */
export async function handleIncomingVoiceMessage(
  ctx: BotContext,
  channelId: string,
  userId: string,
): Promise<void> {
  const { findChannel, logger, processAudioMessage, recordHistory } = getDeps();

  if (!processAudioMessage) {
    logger.debug(
      { channelId },
      "Voice message received but audio processing not available",
    );
    return;
  }

  if (!rateLimiter.allow(channelId)) {
    logger.warn(
      { channelId, userId },
      "Rate limited incoming Telegram voice message",
    );
    await ctx.reply(
      "You're sending messages too quickly. Please wait a moment before trying again.",
    );
    return;
  }

  // biome-ignore lint/style/noNonNullAssertion: Telegraf voice handler guarantees message
  const voice = (ctx.message as {
    voice?: { file_id: string; duration: number };
  })!.voice;
  if (!voice) return;

  const telegramUserId = ctx.from?.id;
  const telegramUsername = ctx.from?.username;

  logger.info(
    {
      channelId,
      userId,
      telegramUserId,
      telegramUsername,
      duration: voice.duration,
    },
    "Processing incoming Telegram voice message",
  );

  try {
    const channel = await findChannel(channelId, userId);
    if (!channel || !channel.isActive) {
      if (!channel) {
        logger.warn(
          { channelId, userId },
          "Channel not found for voice message - stopping bot",
        );
        await stopBot(channelId);
      }
      return;
    }

    if (channel.capability === "notification") {
      await ctx.reply(
        "This channel is configured for notifications only. I cannot respond to messages.",
      );
      return;
    }

    // Send typing indicator
    if (ctx.chat) {
      await safeSendChatAction(ctx.telegram, ctx.chat.id, "typing", logger);
    }

    // Download voice file from Telegram servers (always OGG/Opus)
    const fileLink = await ctx.telegram.getFileLink(voice.file_id);
    const response = await fetch(fileLink.href);
    if (!response.ok) {
      throw new Error(`Failed to download voice file: ${response.status}`);
    }
    const audioBuffer = Buffer.from(await response.arrayBuffer());

    const agentActorId = channel.agentActorId ?? DEFAULT_CHANNEL_AGENT_ACTOR_ID;

    // Process: STT → AI → optional TTS
    const result = await processAudioMessage(userId, audioBuffer, {
      channelId,
      agentActorId,
      format: "ogg",
      sessionId: ctx.session.sessionId,
      ttsEnabled: true,
      ttsFormat: "mp3",
    });

    // Send text response
    if (result.response) {
      const chunks = splitMessage(result.response);
      for (let i = 0; i < chunks.length; i++) {
        await ctx.reply(chunks[i] ?? "");
        if (i < chunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }

    // Send voice reply if TTS audio was generated
    if (result.audioResponse) {
      await ctx.replyWithVoice(
        Input.fromBuffer(result.audioResponse, "response.mp3"),
      );
    }

    // Record history
    await recordHistory({
      action: "telegram_voice_message_processed",
      itemType: "telegram_voice",
      itemId: `tg-voice-${telegramUserId}-${Date.now()}`,
      itemName: "Telegram Voice Message",
      beforeData: {
        telegramUserId,
        telegramUsername,
        channelId,
        voiceMessage: true,
        duration: voice.duration,
      },
      afterData: {
        response: result.response,
        platform: "telegram",
        channelId,
      },
      actor: "human",
      userId,
      metadata: { platform: "telegram", channelId },
    });
  } catch (error) {
    logger.error(
      {
        channelId,
        userId,
        telegramUserId,
        telegramUsername,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error processing Telegram voice message",
    );

    await ctx.reply(
      "I encountered an error processing your voice message. Please try again later.",
    );
  }
}
