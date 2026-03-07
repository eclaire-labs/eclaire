import { and, eq } from "drizzle-orm";
import type { Context } from "telegraf";
import { getDeps } from "./deps.js";
import { stopBot } from "./bot-manager.js";

/**
 * Handles incoming messages from Telegram for bidirectional channels.
 */
export async function handleIncomingMessage(
  ctx: Context,
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

    // Send typing indicator
    await ctx.sendChatAction("typing");

    // Process the message through the AI system
    const result = await processPromptRequest(
      userId,
      message,
      { agent: "telegram-bot" },
      `telegram-${channelId}-${Date.now()}`,
      undefined,
      false,
    );

    // Send the AI response back to Telegram
    if (result.response) {
      const response = result.response;
      if (response.length <= 4096) {
        await ctx.reply(response);
      } else {
        // Split into chunks
        const chunks = response.match(/.{1,4000}/gs) || [];
        for (const chunk of chunks) {
          await ctx.reply(chunk);
          // Small delay between messages to avoid rate limits
          await new Promise((resolve) => setTimeout(resolve, 100));
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
        response: result.response,
        type: result.type,
        requestId: result.requestId,
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
