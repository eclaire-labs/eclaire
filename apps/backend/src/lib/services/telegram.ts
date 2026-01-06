import { and, eq } from "drizzle-orm";
import { type Context, session, Telegraf } from "telegraf";
import { db, schema } from "../../db/index.js";
import { decrypt } from "../encryption.js";

const { channels, users } = schema;

import { processPromptRequest } from "../agent/index.js";
import { createChildLogger } from "../logger.js";
import { recordHistory } from "./history.js";

const logger = createChildLogger("telegram");

interface TelegramConfig {
  chat_identifier: string;
  bot_token: string;
}

interface TelegramBotInstance {
  bot: Telegraf;
  config: TelegramConfig;
  channelId: string;
  userId: string;
  launchPromise: Promise<void>;
}

// Store active bot instances
const activeBots = new Map<string, TelegramBotInstance>();

/**
 * Validates and decrypts a Telegram channel config
 */
function decryptTelegramConfig(encryptedConfig: any): TelegramConfig | null {
  try {
    if (!encryptedConfig || typeof encryptedConfig !== "object") {
      logger.error("Invalid config format - not an object");
      return null;
    }

    const { chat_identifier, bot_token } = encryptedConfig;

    if (!chat_identifier || !bot_token) {
      logger.error("Missing required config fields");
      return null;
    }

    // Decrypt the bot token if it starts with encryption format
    let decryptedBotToken = bot_token;
    if (typeof bot_token === "string" && bot_token.includes(":")) {
      decryptedBotToken = decrypt(bot_token);
      if (!decryptedBotToken) {
        logger.error("Failed to decrypt bot token");
        return null;
      }
    }

    return {
      chat_identifier,
      bot_token: decryptedBotToken,
    };
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Error decrypting Telegram config",
    );
    return null;
  }
}

/**
 * Creates and starts a Telegram bot instance
 */
async function createBotInstance(
  channelId: string,
  userId: string,
  config: TelegramConfig,
): Promise<TelegramBotInstance | null> {
  try {
    const bot = new Telegraf(config.bot_token);

    // Add session middleware for conversation tracking
    bot.use(session());

    // Handle incoming messages for bidirectional channels
    bot.on("text", async (ctx) => {
      try {
        await handleIncomingMessage(ctx, channelId, userId);
      } catch (error) {
        logger.error(
          {
            channelId,
            userId,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          "Error handling incoming Telegram message",
        );

        try {
          await ctx.reply(
            "Sorry, I encountered an error processing your message. Please try again.",
          );
        } catch (replyError) {
          logger.error(
            { channelId, userId },
            "Failed to send error reply to Telegram",
          );
        }
      }
    });

    // Handle bot commands
    bot.command("start", async (ctx) => {
      try {
        await ctx.reply(
          "Hello! I'm your Eclaire assistant. How can I help you today?",
        );
      } catch (error) {
        logger.error(
          { channelId, userId },
          "Failed to send start command reply",
        );
      }
    });

    bot.command("help", async (ctx) => {
      try {
        await ctx.reply(
          "I can help you with various tasks. Just send me a message and I'll do my best to assist you!",
        );
      } catch (error) {
        logger.error(
          { channelId, userId },
          "Failed to send help command reply",
        );
      }
    });

    // Handle bot errors
    bot.catch((error, ctx) => {
      logger.error(
        {
          channelId,
          userId,
          error: error instanceof Error ? error.message : "Unknown error",
          updateType: ctx.updateType,
        },
        "Telegram bot error caught",
      );
    });

    // Validate bot token first with a quick API call
    try {
      const botInfo = await bot.telegram.getMe();
      logger.info(
        {
          channelId,
          userId,
          botUsername: botInfo.username,
          botId: botInfo.id,
        },
        "Bot token validated successfully",
      );
    } catch (validationError) {
      logger.error(
        {
          channelId,
          userId,
          error:
            validationError instanceof Error
              ? validationError.message
              : "Unknown error",
        },
        "Bot token validation failed",
      );
      throw new Error("Invalid bot token or network error");
    }

    // Start the bot polling in background (non-blocking)
    const launchPromise = bot.launch().catch((launchError) => {
      const errorMessage =
        launchError instanceof Error ? launchError.message : "Unknown error";
      logger.error(
        {
          channelId,
          userId,
          error: errorMessage,
        },
        "Bot polling failed after startup",
      );

      // Remove from active bots if polling fails
      activeBots.delete(channelId);

      // Handle conflicts with retry
      if (errorMessage.includes("409") || errorMessage.includes("Conflict")) {
        logger.warn(
          { channelId, userId },
          "Bot conflict detected, will retry polling after delay",
        );
        setTimeout(async () => {
          try {
            const retryPromise = bot.launch();
            // Update the instance with new promise
            const instance = activeBots.get(channelId);
            if (instance) {
              (instance as any).launchPromise = retryPromise;
            }
            await retryPromise;
            logger.info({ channelId, userId }, "Bot polling retry successful");
          } catch (retryError) {
            logger.error(
              {
                channelId,
                userId,
                error:
                  retryError instanceof Error
                    ? retryError.message
                    : "Unknown error",
              },
              "Bot polling retry failed",
            );
          }
        }, 2000);
      }
    });

    const instance: TelegramBotInstance = {
      bot,
      config,
      channelId,
      userId,
      launchPromise,
    };

    logger.info(
      { channelId, userId },
      "Telegram bot instance created, polling started in background",
    );
    return instance;
  } catch (error) {
    logger.error(
      {
        channelId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to create Telegram bot instance",
    );
    return null;
  }
}

/**
 * Handles incoming messages from Telegram for bidirectional channels
 */
async function handleIncomingMessage(
  ctx: Context,
  channelId: string,
  userId: string,
) {
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
      // Stop the bot for this channel since the channel no longer exists
      await stopTelegramBot(channelId);
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

    // Process the message through the existing AI system
    const result = await processPromptRequest(
      userId,
      message,
      {
        agent: "telegram-bot",
      },
      `telegram-${channelId}-${Date.now()}`,
      undefined, // no specific conversation
      false, // no thinking
    );

    // Send the AI response back to Telegram
    if (result.response) {
      // Split long messages if needed (Telegram has a 4096 character limit)
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

/**
 * Starts all active Telegram channels for all users
 */
export async function startAllTelegramBots(): Promise<void> {
  try {
    logger.info("Starting all Telegram bots");

    const telegramChannels = await db.query.channels.findMany({
      where: and(eq(channels.platform, "telegram"), channels.isActive),
      with: {
        user: {
          columns: {
            id: true,
            displayName: true,
          },
        },
      },
    });

    logger.info(
      { count: telegramChannels.length },
      "Found active Telegram channels",
    );

    for (const channel of telegramChannels) {
      try {
        const config = decryptTelegramConfig(channel.config);
        if (!config) {
          logger.error(
            { channelId: channel.id },
            "Failed to decrypt Telegram config, skipping",
          );
          continue;
        }

        const instance = await createBotInstance(
          channel.id,
          channel.userId,
          config,
        );
        if (instance) {
          activeBots.set(channel.id, instance);
          logger.info(
            {
              channelId: channel.id,
              userId: channel.userId,
              userName: channel.user.displayName,
            },
            "Telegram bot started successfully",
          );
        }
      } catch (error) {
        logger.error(
          {
            channelId: channel.id,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          "Failed to start Telegram bot for channel",
        );
      }
    }

    logger.info(
      { activeBotsCount: activeBots.size },
      "Telegram bot startup completed",
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Error starting Telegram bots",
    );
  }
}

/**
 * Stops a specific Telegram bot
 */
export async function stopTelegramBot(channelId: string): Promise<void> {
  try {
    const instance = activeBots.get(channelId);
    if (instance) {
      try {
        // Stop the bot gracefully - this will resolve the launchPromise
        await instance.bot.stop();
        logger.info({ channelId }, "Telegram bot stopped gracefully");

        // Wait for the launch promise to resolve (with timeout)
        try {
          await Promise.race([
            instance.launchPromise,
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("Launch promise timeout")),
                5000,
              ),
            ),
          ]);
          logger.debug({ channelId }, "Launch promise resolved after bot stop");
        } catch (launchError) {
          logger.debug(
            {
              channelId,
              error:
                launchError instanceof Error
                  ? launchError.message
                  : "Unknown error",
            },
            "Launch promise did not resolve cleanly (this is normal)",
          );
        }
      } catch (stopError) {
        logger.warn(
          {
            channelId,
            error:
              stopError instanceof Error ? stopError.message : "Unknown error",
          },
          "Error during graceful bot stop, forcing cleanup",
        );
      } finally {
        // Always remove from active bots map
        activeBots.delete(channelId);
        logger.info(
          { channelId },
          "Telegram bot removed from active instances",
        );
      }
    } else {
      logger.debug({ channelId }, "No active bot instance found to stop");
    }
  } catch (error) {
    logger.error(
      {
        channelId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error stopping Telegram bot",
    );
  }
}

/**
 * Starts a Telegram bot for a specific channel
 */
export async function startTelegramBot(channelId: string): Promise<boolean> {
  try {
    // Stop existing instance if any
    await stopTelegramBot(channelId);

    const channel = await db.query.channels.findFirst({
      where: and(
        eq(channels.id, channelId),
        eq(channels.platform, "telegram"),
        channels.isActive,
      ),
    });

    if (!channel) {
      logger.error({ channelId }, "Telegram channel not found or inactive");
      return false;
    }

    const config = decryptTelegramConfig(channel.config);
    if (!config) {
      logger.error({ channelId }, "Failed to decrypt Telegram config");
      return false;
    }

    // Check if there's already a bot running with the same token
    const existingInstance = Array.from(activeBots.values()).find(
      (instance) => instance.config.bot_token === config.bot_token,
    );

    if (existingInstance) {
      logger.warn(
        {
          channelId,
          existingChannelId: existingInstance.channelId,
        },
        "Bot token already in use by another channel, stopping existing instance",
      );
      await stopTelegramBot(existingInstance.channelId);
    }

    const instance = await createBotInstance(channelId, channel.userId, config);
    if (instance) {
      activeBots.set(channelId, instance);
      logger.info({ channelId }, "Telegram bot started successfully");
      return true;
    }

    return false;
  } catch (error) {
    logger.error(
      {
        channelId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error starting Telegram bot",
    );
    return false;
  }
}

/**
 * Sends a message to a Telegram channel
 */
export async function sendTelegramMessage(
  channelId: string,
  message: string,
  options?: {
    parseMode?: "HTML" | "Markdown" | "MarkdownV2";
    disableWebPagePreview?: boolean;
  },
): Promise<boolean> {
  try {
    const instance = activeBots.get(channelId);
    if (!instance) {
      logger.error({ channelId }, "Telegram bot instance not found");
      return false;
    }

    // Split long messages if needed
    if (message.length <= 4096) {
      await instance.bot.telegram.sendMessage(
        instance.config.chat_identifier,
        message,
        options?.parseMode ? { parse_mode: options.parseMode } : {},
      );
    } else {
      // Split into chunks
      const chunks = message.match(/.{1,4000}/gs) || [];
      for (const chunk of chunks) {
        await instance.bot.telegram.sendMessage(
          instance.config.chat_identifier,
          chunk,
          options?.parseMode ? { parse_mode: options.parseMode } : {},
        );
        // Small delay between messages to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    logger.info(
      {
        channelId,
        messageLength: message.length,
      },
      "Telegram message sent successfully",
    );

    return true;
  } catch (error) {
    logger.error(
      {
        channelId,
        messageLength: message.length,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to send Telegram message",
    );
    return false;
  }
}

/**
 * Stops all Telegram bots (for graceful shutdown)
 */
export async function stopAllTelegramBots(): Promise<void> {
  logger.info("Stopping all Telegram bots");

  const stopPromises = Array.from(activeBots.keys()).map((channelId) =>
    stopTelegramBot(channelId),
  );

  await Promise.all(stopPromises);

  logger.info("All Telegram bots stopped");
}

/**
 * Gets the status of all active Telegram bots
 */
export function getTelegramBotsStatus(): {
  channelId: string;
  userId: string;
  isActive: boolean;
}[] {
  return Array.from(activeBots.entries()).map(([channelId, instance]) => ({
    channelId,
    userId: instance.userId,
    isActive: true,
  }));
}
