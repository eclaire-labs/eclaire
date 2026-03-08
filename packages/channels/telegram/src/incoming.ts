import { and, eq } from "drizzle-orm";
import { getDeps } from "./deps.js";
import { stopBot } from "./bot-manager.js";
import type { BotContext } from "./commands.js";
import { splitMessage } from "./message-utils.js";
import { sendStreamingResponse } from "./stream-sender.js";
import { safeSendChatAction } from "./typing-indicator.js";

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
  const { db, schema, logger, processPromptRequest, recordHistory } =
    getDeps();
  const { channels } = schema;

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

  try {
    // Get the channel to verify it supports chat/bidirectional
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
      await ctx.reply(
        "This channel is configured for notifications only. I cannot respond to messages.",
      );
      return;
    }

    // Send typing indicator (with circuit breaker protection)
    if (ctx.chat) {
      await safeSendChatAction(ctx.telegram, ctx.chat.id, "typing", logger);
    }

    const deps = getDeps();
    const requestId = `telegram-${channelId}-${Date.now()}`;

    // Lazily create a session on first message if possible
    if (!ctx.session.sessionId && deps.createSession) {
      try {
        const session = await deps.createSession(userId);
        ctx.session.sessionId = session.id;
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
      const stream = await deps.processPromptRequestStream(
        userId,
        message,
        { agent: "telegram-bot" },
        requestId,
        sessionId,
        enableThinking,
      );

      responseText = await sendStreamingResponse(
        ctx.telegram,
        ctx.chat.id,
        stream,
        { logger },
      );
    } else {
      // Non-streaming fallback
      const result = await processPromptRequest(
        userId,
        message,
        { agent: "telegram-bot" },
        requestId,
        sessionId,
        enableThinking,
      );

      responseText = result.response;
      if (responseText) {
        const chunks = splitMessage(responseText);
        for (let i = 0; i < chunks.length; i++) {
          await ctx.reply(chunks[i]!);
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
      actor: "user",
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
