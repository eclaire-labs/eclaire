import { type Context, session, Telegraf } from "telegraf";
import { getDeps } from "./deps.js";
import { decryptConfig, type TelegramConfig } from "./config.js";
import {
  handleIncomingMessage,
  handleIncomingVoiceMessage,
} from "./incoming.js";
import {
  type BotContext,
  type TelegramSessionData,
  registerCommands,
  getCommandList,
} from "./commands.js";
import { splitMessage } from "./message-utils.js";
import { withRetry } from "./retry.js";
import { resetCircuitBreaker } from "./typing-indicator.js";

interface TelegramBotInstance {
  bot: Telegraf<BotContext>;
  config: TelegramConfig;
  channelId: string;
  userId: string;
  launchPromise: Promise<void>;
}

// Store active bot instances
const activeBots = new Map<string, TelegramBotInstance>();
// Track pending retry timers so they can be cancelled during shutdown
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Creates and starts a Telegram bot instance.
 */
async function createBotInstance(
  channelId: string,
  userId: string,
  config: TelegramConfig,
): Promise<TelegramBotInstance | null> {
  const { logger } = getDeps();

  try {
    const bot = new Telegraf<BotContext>(config.bot_token);

    // Add session middleware with default session factory
    bot.use(
      session({
        defaultSession: (): TelegramSessionData => ({
          enableThinking: true,
        }),
      }),
    );

    // Register slash commands BEFORE the text handler so Telegraf matches them first
    registerCommands(bot, channelId, userId);

    // Handle incoming text messages (non-command)
    bot.on("text", async (ctx) => {
      try {
        await handleIncomingMessage(ctx as BotContext, channelId, userId);
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
        } catch (_replyError) {
          logger.error(
            { channelId, userId },
            "Failed to send error reply to Telegram",
          );
        }
      }
    });

    // Handle incoming voice messages (STT → AI → optional voice reply)
    bot.on("voice", async (ctx) => {
      try {
        await handleIncomingVoiceMessage(ctx as BotContext, channelId, userId);
      } catch (error) {
        logger.error(
          {
            channelId,
            userId,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          "Error handling incoming Telegram voice message",
        );

        try {
          await ctx.reply(
            "Sorry, I encountered an error processing your voice message. Please try again.",
          );
        } catch (_replyError) {
          logger.error(
            { channelId, userId },
            "Failed to send error reply to Telegram",
          );
        }
      }
    });

    // Handle bot errors
    bot.catch((error: unknown, ctx: Context) => {
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

      // Register commands in Telegram's menu
      try {
        await bot.telegram.setMyCommands(getCommandList());
      } catch (cmdError) {
        logger.warn(
          {
            channelId,
            error:
              cmdError instanceof Error ? cmdError.message : "Unknown error",
          },
          "Failed to register bot commands menu (non-fatal)",
        );
      }
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
        const timer = setTimeout(async () => {
          retryTimers.delete(channelId);
          try {
            const retryPromise = bot.launch();
            const instance = activeBots.get(channelId);
            if (instance) {
              // biome-ignore lint/suspicious/noExplicitAny: Telegraf instance property not in type definition
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
        retryTimers.set(channelId, timer);
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
 * Stops a specific Telegram bot.
 */
export async function stopBot(channelId: string): Promise<void> {
  const { logger } = getDeps();

  try {
    // Cancel any pending retry timer for this channel
    const pendingTimer = retryTimers.get(channelId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      retryTimers.delete(channelId);
    }

    const instance = activeBots.get(channelId);
    if (instance) {
      try {
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
        resetCircuitBreaker(instance.config.bot_token);
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
 * Starts a Telegram bot for a specific channel.
 */
export async function startBot(channelId: string): Promise<boolean> {
  const { findChannelById, logger } = getDeps();

  try {
    // Stop existing instance if any
    await stopBot(channelId);

    const channel = await findChannelById(channelId);

    if (!channel) {
      logger.error({ channelId }, "Telegram channel not found or inactive");
      return false;
    }

    const config = decryptConfig(channel.config);
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
      await stopBot(existingInstance.channelId);
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
 * Sends a message to a Telegram channel.
 */
export async function sendMessage(
  channelId: string,
  message: string,
  options?: Record<string, unknown>,
): Promise<boolean> {
  const { logger } = getDeps();

  try {
    const instance = activeBots.get(channelId);
    if (!instance) {
      logger.error({ channelId }, "Telegram bot instance not found");
      return false;
    }

    const parseMode = options?.parseMode as string | undefined;

    const chunks = splitMessage(message);
    const sendOpts = parseMode
      ? { parse_mode: parseMode as "HTML" | "Markdown" | "MarkdownV2" }
      : {};

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i] ?? "";
      await withRetry(
        () =>
          instance.bot.telegram.sendMessage(
            instance.config.chat_identifier,
            chunk,
            sendOpts,
          ),
        {
          onRetry: (error, attempt) => {
            logger.warn(
              {
                channelId,
                attempt,
                error: error instanceof Error ? error.message : "Unknown error",
              },
              "Retrying Telegram sendMessage",
            );
          },
        },
      );

      // Small delay between messages to avoid rate limits
      if (i < chunks.length - 1) {
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
 * Starts all active Telegram channels for all users.
 */
export async function startAllBots(): Promise<void> {
  const { findActiveChannels, logger } = getDeps();

  try {
    const telegramChannels = await findActiveChannels();

    if (telegramChannels.length === 0) {
      logger.debug("No active Telegram channels, skipping");
      return;
    }

    logger.info({ count: telegramChannels.length }, "Starting Telegram bots");

    for (const channel of telegramChannels) {
      try {
        const config = decryptConfig(channel.config);
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
              channelName: channel.name,
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
 * Stops all Telegram bots (for graceful shutdown).
 */
export async function stopAllBots(): Promise<void> {
  const { logger } = getDeps();

  logger.info("Stopping all Telegram bots");

  const stopPromises = Array.from(activeBots.keys()).map((channelId) =>
    stopBot(channelId),
  );

  await Promise.all(stopPromises);

  logger.info("All Telegram bots stopped");
}

/**
 * Gets the status of all active Telegram bots.
 */
export function getBotsStatus(): {
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
