import { and, eq } from "drizzle-orm";
import type { Message, TextChannel } from "discord.js";
import { getDeps } from "./deps.js";
import { stopBot } from "./bot-manager.js";
import { splitMessage } from "./message-utils.js";
import { sendStreamingResponse } from "./stream-sender.js";
import { safeSendTyping } from "./typing-indicator.js";

/**
 * Handles incoming messages from Discord for bidirectional channels.
 */
export async function handleIncomingMessage(
  message: Message,
  channelId: string,
  userId: string,
): Promise<void> {
  const { db, schema, logger, processPromptRequest, recordHistory } =
    getDeps();
  const { channels } = schema;

  const text = message.content;
  if (!text) return;

  const discordUserId = message.author.id;
  const discordUsername = message.author.username;

  logger.info(
    {
      channelId,
      userId,
      discordUserId,
      discordUsername,
      messageLength: text.length,
    },
    "Processing incoming Discord message",
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
      await message.reply(
        "This channel is configured for notifications only. I cannot respond to messages.",
      );
      return;
    }

    // Send typing indicator (with circuit breaker protection)
    const textChannel = message.channel as TextChannel;
    await safeSendTyping(textChannel, logger);

    const deps = getDeps();
    const requestId = `discord-${channelId}-${Date.now()}`;

    let responseText: string | undefined;

    if (deps.processPromptRequestStream) {
      const stream = await deps.processPromptRequestStream(
        userId,
        text,
        { agent: "discord-bot" },
        requestId,
        undefined,
        false,
      );

      responseText = await sendStreamingResponse(
        textChannel,
        stream,
        { logger },
      );
    } else {
      // Non-streaming fallback
      const result = await processPromptRequest(
        userId,
        text,
        { agent: "discord-bot" },
        requestId,
        undefined,
        false,
      );

      responseText = result.response;
      if (responseText) {
        const chunks = splitMessage(responseText);
        for (let i = 0; i < chunks.length; i++) {
          await message.reply(chunks[i]!);
          if (i < chunks.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
      }
    }

    // Record history
    await recordHistory({
      action: "discord_message_processed",
      itemType: "discord_chat",
      itemId: `discord-${discordUserId}-${Date.now()}`,
      itemName: "Discord Chat Message",
      beforeData: {
        message: text,
        discordUserId,
        discordUsername,
        channelId,
      },
      afterData: {
        response: responseText,
        platform: "discord",
        channelId,
      },
      actor: "user",
      userId: userId,
      metadata: {
        platform: "discord",
        channelId,
      },
    });
  } catch (error) {
    logger.error(
      {
        channelId,
        userId,
        discordUserId,
        discordUsername,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error processing Discord message",
    );

    await message.reply(
      "I encountered an error processing your message. Please try again later.",
    );
  }
}
