import { and, eq } from "drizzle-orm";
import { Client, GatewayIntentBits, type TextChannel } from "discord.js";
import { getDeps } from "./deps.js";
import { decryptConfig, type DiscordConfig } from "./config.js";
import { handleIncomingMessage } from "./incoming.js";
import { splitMessage } from "./message-utils.js";
import { withRetry } from "./retry.js";
import { resetCircuitBreaker } from "./typing-indicator.js";

interface ChannelMeta {
  channelId: string;
  userId: string;
  discordChannelId: string;
}

interface DiscordClientInstance {
  client: Client;
  managedChannels: Map<string, ChannelMeta>;
  readyPromise: Promise<void>;
}

// Pool clients by bot token to share one WebSocket per token
const clientPool = new Map<string, DiscordClientInstance>();
// Map eclaire channelId -> bot token for reverse lookup
const channelTokenMap = new Map<string, string>();

function createClient(
  botToken: string,
  initialChannel: ChannelMeta,
): DiscordClientInstance {
  const { logger } = getDeps();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  const managedChannels = new Map<string, ChannelMeta>();
  managedChannels.set(initialChannel.channelId, initialChannel);

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    // Find which eclaire channel manages this Discord channel
    let channelMeta: ChannelMeta | undefined;
    for (const meta of managedChannels.values()) {
      if (meta.discordChannelId === message.channelId) {
        channelMeta = meta;
        break;
      }
    }

    if (!channelMeta) return;

    try {
      await handleIncomingMessage(message, channelMeta.channelId, channelMeta.userId);
    } catch (error) {
      logger.error(
        {
          channelId: channelMeta.channelId,
          userId: channelMeta.userId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Error handling incoming Discord message",
      );

      try {
        await message.reply(
          "Sorry, I encountered an error processing your message. Please try again.",
        );
      } catch (_replyError) {
        logger.error(
          { channelId: channelMeta.channelId },
          "Failed to send error reply to Discord",
        );
      }
    }
  });

  client.on("error", (error) => {
    logger.error(
      { error: error.message },
      "Discord client error",
    );
  });

  client.on("warn", (warning) => {
    logger.warn(
      { warning },
      "Discord client warning",
    );
  });

  const readyPromise = new Promise<void>((resolve, reject) => {
    client.once("ready", () => {
      logger.info(
        {
          botUser: client.user?.tag,
          channelId: initialChannel.channelId,
        },
        "Discord bot connected and ready",
      );
      resolve();
    });

    client.once("error", (err) => {
      reject(err);
    });
  });

  client.login(botToken).catch((err) => {
    logger.error(
      {
        channelId: initialChannel.channelId,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      "Failed to login Discord bot",
    );
  });

  return { client, managedChannels, readyPromise };
}

/**
 * Stops a specific Discord channel.
 * Destroys the client only if no other channels use it.
 */
export async function stopBot(channelId: string): Promise<void> {
  const { logger } = getDeps();

  try {
    const botToken = channelTokenMap.get(channelId);
    if (!botToken) {
      logger.debug({ channelId }, "No active Discord client found to stop");
      return;
    }

    const instance = clientPool.get(botToken);
    if (!instance) {
      channelTokenMap.delete(channelId);
      return;
    }

    // Remove this channel from the managed set
    const meta = instance.managedChannels.get(channelId);
    if (meta) {
      resetCircuitBreaker(meta.discordChannelId);
    }
    instance.managedChannels.delete(channelId);
    channelTokenMap.delete(channelId);

    logger.info({ channelId }, "Discord channel removed from client");

    // Destroy the client if no more channels use it
    if (instance.managedChannels.size === 0) {
      try {
        instance.client.destroy();
        logger.info({ channelId }, "Discord client destroyed (no remaining channels)");
      } catch (destroyError) {
        logger.warn(
          {
            channelId,
            error: destroyError instanceof Error ? destroyError.message : "Unknown error",
          },
          "Error during Discord client destroy",
        );
      } finally {
        clientPool.delete(botToken);
      }
    }
  } catch (error) {
    logger.error(
      {
        channelId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error stopping Discord bot",
    );
  }
}

/**
 * Starts a Discord bot for a specific channel.
 */
export async function startBot(channelId: string): Promise<boolean> {
  const { db, schema, logger } = getDeps();
  const { channels } = schema;

  try {
    // Stop existing instance if any
    await stopBot(channelId);

    const channel = await db.query.channels.findFirst({
      where: and(
        eq(channels.id, channelId),
        eq(channels.platform, "discord"),
        channels.isActive,
      ),
    });

    if (!channel) {
      logger.error({ channelId }, "Discord channel not found or inactive");
      return false;
    }

    const config = decryptConfig(channel.config);
    if (!config) {
      logger.error({ channelId }, "Failed to decrypt Discord config");
      return false;
    }

    const meta: ChannelMeta = {
      channelId,
      userId: channel.userId,
      discordChannelId: config.channel_id,
    };

    // Check if there's already a client for this bot token
    const existingInstance = clientPool.get(config.bot_token);
    if (existingInstance) {
      // Reuse the existing client
      existingInstance.managedChannels.set(channelId, meta);
      channelTokenMap.set(channelId, config.bot_token);
      logger.info(
        { channelId, existingChannels: existingInstance.managedChannels.size },
        "Discord channel added to existing client",
      );
      return true;
    }

    // Create a new client
    const instance = createClient(config.bot_token, meta);
    clientPool.set(config.bot_token, instance);
    channelTokenMap.set(channelId, config.bot_token);

    // Wait for the client to be ready (with timeout)
    try {
      await Promise.race([
        instance.readyPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Discord client ready timeout")), 30_000),
        ),
      ]);
    } catch (readyError) {
      logger.error(
        {
          channelId,
          error: readyError instanceof Error ? readyError.message : "Unknown error",
        },
        "Discord client failed to become ready",
      );
      // Clean up on failure
      await stopBot(channelId);
      return false;
    }

    logger.info({ channelId }, "Discord bot started successfully");
    return true;
  } catch (error) {
    logger.error(
      {
        channelId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error starting Discord bot",
    );
    return false;
  }
}

/**
 * Sends a message to a Discord channel.
 */
export async function sendMessage(
  channelId: string,
  message: string,
  _options?: Record<string, unknown>,
): Promise<boolean> {
  const { logger } = getDeps();

  try {
    const botToken = channelTokenMap.get(channelId);
    if (!botToken) {
      logger.error({ channelId }, "No Discord client for this channel");
      return false;
    }

    const instance = clientPool.get(botToken);
    if (!instance) {
      logger.error({ channelId }, "Discord client instance not found");
      return false;
    }

    const meta = instance.managedChannels.get(channelId);
    if (!meta) {
      logger.error({ channelId }, "Channel metadata not found");
      return false;
    }

    const textChannel = instance.client.channels.cache.get(meta.discordChannelId) as TextChannel | undefined;
    if (!textChannel) {
      // Try fetching the channel if not in cache
      try {
        const fetched = await instance.client.channels.fetch(meta.discordChannelId);
        if (!fetched || !fetched.isTextBased()) {
          logger.error({ channelId, discordChannelId: meta.discordChannelId }, "Discord channel not found or not text-based");
          return false;
        }
      } catch (fetchError) {
        logger.error(
          { channelId, error: fetchError instanceof Error ? fetchError.message : "Unknown error" },
          "Failed to fetch Discord channel",
        );
        return false;
      }
    }

    const targetChannel = (textChannel ?? await instance.client.channels.fetch(meta.discordChannelId)) as TextChannel;

    const chunks = splitMessage(message);
    for (let i = 0; i < chunks.length; i++) {
      await withRetry(
        () => targetChannel.send(chunks[i]!),
        {
          onRetry: (error, attempt) => {
            logger.warn(
              {
                channelId,
                attempt,
                error: error instanceof Error ? error.message : "Unknown error",
              },
              "Retrying Discord sendMessage",
            );
          },
        },
      );

      if (i < chunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    logger.info(
      { channelId, messageLength: message.length },
      "Discord message sent successfully",
    );

    return true;
  } catch (error) {
    logger.error(
      {
        channelId,
        messageLength: message.length,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to send Discord message",
    );
    return false;
  }
}

/**
 * Starts all active Discord channels for all users.
 */
export async function startAllBots(): Promise<void> {
  const { db, schema, logger } = getDeps();
  const { channels } = schema;

  try {
    logger.info("Starting all Discord bots");

    const discordChannels = await db.query.channels.findMany({
      where: and(eq(channels.platform, "discord"), channels.isActive),
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
      { count: discordChannels.length },
      "Found active Discord channels",
    );

    // Group by bot token to create one client per token
    const tokenGroups = new Map<string, { channel: typeof discordChannels[number]; config: DiscordConfig }[]>();

    for (const channel of discordChannels) {
      const config = decryptConfig(channel.config);
      if (!config) {
        logger.error(
          { channelId: channel.id },
          "Failed to decrypt Discord config, skipping",
        );
        continue;
      }

      const group = tokenGroups.get(config.bot_token) ?? [];
      group.push({ channel, config });
      tokenGroups.set(config.bot_token, group);
    }

    for (const [botToken, group] of tokenGroups) {
      try {
        // Create client with the first channel
        const first = group[0]!;
        const firstMeta: ChannelMeta = {
          channelId: first.channel.id,
          userId: first.channel.userId,
          discordChannelId: first.config.channel_id,
        };

        const instance = createClient(botToken, firstMeta);
        clientPool.set(botToken, instance);
        channelTokenMap.set(first.channel.id, botToken);

        // Register remaining channels on the same client
        for (let i = 1; i < group.length; i++) {
          const entry = group[i]!;
          const meta: ChannelMeta = {
            channelId: entry.channel.id,
            userId: entry.channel.userId,
            discordChannelId: entry.config.channel_id,
          };
          instance.managedChannels.set(entry.channel.id, meta);
          channelTokenMap.set(entry.channel.id, botToken);
        }

        // Wait for client to be ready
        try {
          await Promise.race([
            instance.readyPromise,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Discord client ready timeout")), 30_000),
            ),
          ]);
        } catch (readyError) {
          logger.error(
            {
              error: readyError instanceof Error ? readyError.message : "Unknown error",
              channelCount: group.length,
            },
            "Discord client failed to become ready during startup",
          );
          continue;
        }

        for (const entry of group) {
          logger.info(
            {
              channelId: entry.channel.id,
              userId: entry.channel.userId,
              userName: entry.channel.user.displayName,
            },
            "Discord bot started successfully",
          );
        }
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error.message : "Unknown error",
            channelCount: group.length,
          },
          "Failed to start Discord client for token group",
        );
      }
    }

    const totalChannels = Array.from(clientPool.values())
      .reduce((sum, inst) => sum + inst.managedChannels.size, 0);
    logger.info(
      { activeClients: clientPool.size, activeChannels: totalChannels },
      "Discord bot startup completed",
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Error starting Discord bots",
    );
  }
}

/**
 * Stops all Discord bots (for graceful shutdown).
 */
export async function stopAllBots(): Promise<void> {
  const { logger } = getDeps();

  logger.info("Stopping all Discord bots");

  // Destroy all clients directly
  for (const [botToken, instance] of clientPool) {
    try {
      // Reset circuit breakers for all managed channels
      for (const meta of instance.managedChannels.values()) {
        resetCircuitBreaker(meta.discordChannelId);
        channelTokenMap.delete(meta.channelId);
      }
      instance.client.destroy();
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "Error destroying Discord client during shutdown",
      );
    }
  }

  clientPool.clear();
  channelTokenMap.clear();

  logger.info("All Discord bots stopped");
}
