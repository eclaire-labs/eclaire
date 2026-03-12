import { MessageFlags, type Message, type TextChannel } from "discord.js";
import { getDeps } from "./deps.js";
import { stopBot } from "./bot-manager.js";
import { getSession } from "./commands.js";
import { splitMessage } from "./message-utils.js";
import { sendStreamingResponse } from "./stream-sender.js";
import { safeSendTyping } from "./typing-indicator.js";
import { downloadFile } from "./voice-utils.js";

/**
 * Extracts attachment metadata from a Discord message.
 */
function extractAttachments(
  message: Message,
): { url: string; name: string; contentType: string | null; size: number }[] {
  return message.attachments.map((a) => ({
    url: a.url,
    name: a.name,
    contentType: a.contentType,
    size: a.size,
  }));
}

/**
 * Handles incoming messages from Discord for bidirectional channels.
 */
export async function handleIncomingMessage(
  message: Message,
  channelId: string,
  userId: string,
): Promise<void> {
  const { findChannel, logger, processPromptRequest, recordHistory } =
    getDeps();

  const text = message.content;
  const attachments = extractAttachments(message);

  // Drop messages with no text and no attachments
  if (!text && attachments.length === 0) return;

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

    // Get or lazily create session for multi-turn context
    const sessionState = getSession(channelId);
    if (!sessionState.sessionId && deps.createSession) {
      try {
        const session = await deps.createSession(userId);
        sessionState.sessionId = session.id;
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

    // Handle voice messages
    const isVoiceMessage = message.flags.has(MessageFlags.IsVoiceMessage);
    if (isVoiceMessage && deps.processAudioMessage) {
      const voiceAttachment = attachments.find(
        (a) => a.contentType?.includes("ogg") || a.name.endsWith(".ogg"),
      );
      if (voiceAttachment) {
        try {
          const audioBuffer = await downloadFile(voiceAttachment.url);
          const result = await deps.processAudioMessage(userId, audioBuffer, {
            agent: "discord-bot",
            channelId,
            discordUserId,
            format: "ogg",
          });
          responseText = result.response;
          if (responseText) {
            const chunks = splitMessage(responseText);
            for (let i = 0; i < chunks.length; i++) {
              await message.reply(chunks[i] ?? "");
              if (i < chunks.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
            }
          }
          // Record history and return early
          await recordHistory({
            action: "discord_voice_message_processed",
            itemType: "discord_voice",
            itemId: `discord-voice-${discordUserId}-${Date.now()}`,
            itemName: "Discord Voice Message",
            beforeData: {
              discordUserId,
              discordUsername,
              channelId,
              voiceMessage: true,
            },
            afterData: {
              response: responseText,
              platform: "discord",
              channelId,
            },
            actor: "user",
            userId,
            metadata: { platform: "discord", channelId },
          });
          return;
        } catch (audioError) {
          logger.warn(
            {
              error:
                audioError instanceof Error
                  ? audioError.message
                  : "Unknown error",
            },
            "Failed to process voice message, falling back to text",
          );
        }
      }
    }

    // Build prompt text: include attachment URLs if present
    const promptText =
      attachments.length > 0
        ? `${text || ""}${text ? "\n" : ""}[Attachments: ${attachments.map((a) => `${a.name} (${a.contentType ?? "unknown"}): ${a.url}`).join(", ")}]`
        : text;

    if (deps.processPromptRequestStream) {
      const stream = await deps.processPromptRequestStream({
        userId,
        prompt: promptText,
        context: { agent: "discord-bot", attachments },
        requestId,
        conversationId: sessionId,
        enableThinking,
      });

      responseText = await sendStreamingResponse(textChannel, stream, {
        logger,
      });
    } else {
      // Non-streaming fallback
      const result = await processPromptRequest({
        userId,
        prompt: promptText,
        context: { agent: "discord-bot", attachments },
        requestId,
        conversationId: sessionId,
        enableThinking,
      });

      responseText = result.response;
      if (responseText) {
        const chunks = splitMessage(responseText);
        for (let i = 0; i < chunks.length; i++) {
          await message.reply(chunks[i] ?? "");
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
        attachments: attachments.length > 0 ? attachments : undefined,
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
