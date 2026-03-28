import {
  ChannelRateLimiter,
  DEFAULT_CHANNEL_AGENT_ACTOR_ID,
} from "@eclaire/channels-core";
import { MessageFlags, type Message, type TextChannel } from "discord.js";

const rateLimiter = new ChannelRateLimiter();
import { getDeps } from "./deps.js";
import { stopBot, sendVoiceMessage } from "./bot-manager.js";
import { getSession } from "./commands.js";
import { splitMessage } from "./message-utils.js";
import { sendStreamingResponse } from "./stream-sender.js";
import { safeSendTyping } from "./typing-indicator.js";
import {
  convertToOggOpus,
  downloadFile,
  generateWaveform,
  getAudioDuration,
} from "./voice-utils.js";

/** Allowed Discord CDN hostnames for attachment URLs. */
const DISCORD_CDN_HOSTS = new Set([
  "cdn.discordapp.com",
  "media.discordapp.net",
]);

function isDiscordCdnUrl(url: string): boolean {
  try {
    return DISCORD_CDN_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Extracts attachment metadata from a Discord message.
 * Only includes attachments from trusted Discord CDN origins.
 */
function extractAttachments(
  message: Message,
): { url: string; name: string; contentType: string | null; size: number }[] {
  return message.attachments
    .filter((a) => isDiscordCdnUrl(a.url))
    .map((a) => ({
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
  const {
    findChannel,
    logger,
    processPromptRequest,
    recordHistory,
    routeChannelPrompt,
  } = getDeps();
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

  if (!rateLimiter.allow(channelId)) {
    logger.warn({ channelId, userId }, "Rate limited incoming Discord message");
    await message.reply(
      "You're sending messages too quickly. Please wait a moment before trying again.",
    );
    return;
  }

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

    const routing = routeChannelPrompt
      ? await routeChannelPrompt(
          userId,
          text || "",
          channel.agentActorId ?? DEFAULT_CHANNEL_AGENT_ACTOR_ID,
        )
      : {
          agentActorId: channel.agentActorId ?? DEFAULT_CHANNEL_AGENT_ACTOR_ID,
          prompt: text || "",
        };

    if (routing.error) {
      await message.reply(routing.error);
      return;
    }

    const sessionState = getSession(channelId);
    const channelAgentActorId = routing.agentActorId;
    const routedText = routing.prompt;
    if (
      sessionState.agentActorId &&
      sessionState.agentActorId !== channelAgentActorId
    ) {
      sessionState.sessionId = undefined;
      sessionState.agentActorId = undefined;
    }

    // Send typing indicator (with circuit breaker protection)
    const textChannel = message.channel as TextChannel;
    await safeSendTyping(textChannel, logger);

    const deps = getDeps();
    const requestId = `discord-${channelId}-${Date.now()}`;

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
            agentActorId: channelAgentActorId,
            channelId,
            discordUserId,
            format: "ogg",
            ttsEnabled: true,
            ttsFormat: "wav",
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

          // Send voice message reply if TTS audio was generated
          if (result.audioResponse) {
            try {
              const ogg = await convertToOggOpus(result.audioResponse);
              const duration = await getAudioDuration(ogg);
              const waveform = await generateWaveform(ogg);
              await sendVoiceMessage(channelId, ogg, duration, waveform);
            } catch (voiceError) {
              logger.warn(
                {
                  error:
                    voiceError instanceof Error
                      ? voiceError.message
                      : "Unknown error",
                },
                "Failed to send voice message reply, text reply was already sent",
              );
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
            actor: "human",
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
        ? `${routedText}${routedText ? "\n" : ""}[Attachments: ${attachments.map((a) => `${a.name} (${a.contentType ?? "unknown"}): ${a.url}`).join(", ")}]`
        : routedText;

    if (deps.processPromptRequestStream) {
      const stream = await deps.processPromptRequestStream({
        userId,
        prompt: promptText,
        context: { agentActorId: channelAgentActorId, attachments },
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
        context: { agentActorId: channelAgentActorId, attachments },
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
      actor: "human",
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
