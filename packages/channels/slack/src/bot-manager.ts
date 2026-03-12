import { App } from "@slack/bolt";
import { getDeps } from "./deps.js";
import { decryptConfig, type SlackConfig } from "./config.js";
import { handleIncomingMessage } from "./incoming.js";
import { registerCommands } from "./commands.js";
import { splitMessage, convertMarkdownToMrkdwn } from "./message-utils.js";
import { withRetry } from "./retry.js";
import { resetCircuitBreaker } from "./typing-indicator.js";

interface ChannelMeta {
  channelId: string;
  userId: string;
  slackChannelId: string;
  mentionMode: SlackConfig["mention_mode"];
}

interface SlackAppInstance {
  app: App;
  botUserId: string | null;
  managedChannels: Map<string, ChannelMeta>;
  readyPromise: Promise<void>;
}

// Pool App instances by bot token to share one WebSocket per token
const appPool = new Map<string, SlackAppInstance>();
// Map eclaire channelId -> bot token for reverse lookup
const channelTokenMap = new Map<string, string>();

// Deduplication: track recently seen message timestamps to prevent
// double-processing when both `message` and `app_mention` fire for the same event.
const DEDUP_TTL_MS = 60_000;
const seenMessages = new Map<string, number>();

function isDuplicate(ts: string): boolean {
  const now = Date.now();
  // Prune expired entries periodically (every 100 checks)
  if (seenMessages.size > 0 && seenMessages.size % 100 === 0) {
    for (const [key, expiry] of seenMessages) {
      if (expiry < now) seenMessages.delete(key);
    }
  }
  if (seenMessages.has(ts)) return true;
  seenMessages.set(ts, now + DEDUP_TTL_MS);
  return false;
}

// Thread participation cache: remember threads the bot has replied in
// so users don't need to @mention on every message in mention_or_reply mode.
const THREAD_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_THREAD_CACHE_SIZE = 5000;
const participatedThreads = new Map<string, number>();

function markThreadParticipation(channelTs: string): void {
  // Evict oldest entries if at capacity
  if (participatedThreads.size >= MAX_THREAD_CACHE_SIZE) {
    const now = Date.now();
    for (const [key, expiry] of participatedThreads) {
      if (expiry < now) participatedThreads.delete(key);
    }
    // If still at capacity after pruning expired, remove oldest
    if (participatedThreads.size >= MAX_THREAD_CACHE_SIZE) {
      const firstKey = participatedThreads.keys().next().value;
      if (firstKey) participatedThreads.delete(firstKey);
    }
  }
  participatedThreads.set(channelTs, Date.now() + THREAD_CACHE_TTL_MS);
}

function hasParticipatedInThread(channelTs: string): boolean {
  const expiry = participatedThreads.get(channelTs);
  if (!expiry) return false;
  if (expiry < Date.now()) {
    participatedThreads.delete(channelTs);
    return false;
  }
  return true;
}

// Message debouncing: batch rapid messages from the same user in the same
// channel/thread to avoid triggering multiple AI responses.
const DEBOUNCE_MS = 1500;
interface DebouncedMessage {
  timer: ReturnType<typeof setTimeout>;
  texts: string[];
  lastArgs: {
    client: InstanceType<typeof App>["client"];
    channel: string;
    user: string;
    ts: string;
    channelMeta: ChannelMeta;
  };
}
const debounceMap = new Map<string, DebouncedMessage>();

function debounceKey(
  slackChannel: string,
  slackUser: string,
  threadTs: string | null,
): string {
  return `${slackChannel}:${slackUser}:${threadTs ?? "main"}`;
}

/**
 * Schedules a reconnection attempt for all channels managed by a bot token.
 * Uses exponential backoff with jitter and up to 10 attempts.
 */
function _scheduleReconnect(
  botToken: string,
  managedChannels: Map<string, ChannelMeta>,
  logger: ReturnType<typeof getDeps>["logger"],
  attempt = 1,
): void {
  const maxAttempts = 10;
  if (attempt > maxAttempts) {
    logger.error({ attempt }, "Slack reconnect failed after max attempts");
    return;
  }

  const baseDelay = Math.min(2000 * 1.8 ** (attempt - 1), 30_000);
  const jitter = baseDelay * 0.25 * Math.random();
  const delay = Math.round(baseDelay + jitter);
  logger.info({ attempt, delayMs: delay }, "Scheduling Slack reconnect");

  setTimeout(async () => {
    // Clean up old app
    const oldInstance = appPool.get(botToken);
    if (oldInstance) {
      try {
        await oldInstance.app.stop();
      } catch {
        /* already stopped */
      }
      appPool.delete(botToken);
    }

    // Restart all channels that were on this token
    const channelIds = Array.from(managedChannels.keys());
    if (channelIds.length === 0) return;

    const firstId = channelIds[0];
    if (!firstId) return;
    const success = await startBot(firstId);
    if (!success) {
      _scheduleReconnect(botToken, managedChannels, logger, attempt + 1);
      return;
    }

    // Re-register remaining channels on the new app
    const newInstance = appPool.get(channelTokenMap.get(firstId) ?? "");
    if (newInstance) {
      for (let i = 1; i < channelIds.length; i++) {
        const chId = channelIds[i];
        if (!chId) continue;
        const meta = managedChannels.get(chId);
        if (meta) {
          newInstance.managedChannels.set(chId, meta);
          channelTokenMap.set(chId, botToken);
        }
      }
    }

    logger.info(
      { channelCount: channelIds.length },
      "Slack reconnect successful",
    );
  }, delay);
}

async function dispatchDebounced(
  key: string,
  logger: ReturnType<typeof getDeps>["logger"],
): Promise<void> {
  const entry = debounceMap.get(key);
  if (!entry) return;
  debounceMap.delete(key);

  const { texts, lastArgs } = entry;
  const { client, channel, user, ts, channelMeta } = lastArgs;
  const combinedText = texts.join("\n");

  try {
    await handleIncomingMessage(
      client,
      combinedText,
      channel,
      user,
      ts,
      channelMeta.channelId,
      channelMeta.userId,
    );

    // Track thread participation so the bot auto-responds in this thread
    const replyThreadTs = ts;
    markThreadParticipation(`${channel}:${replyThreadTs}`);
  } catch (error) {
    logger.error(
      {
        channelId: channelMeta.channelId,
        userId: channelMeta.userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error handling incoming Slack message",
    );

    try {
      await client.chat.postMessage({
        channel,
        thread_ts: ts,
        text: "Sorry, I encountered an error processing your message. Please try again.",
      });
    } catch (_replyError) {
      logger.error(
        { channelId: channelMeta.channelId },
        "Failed to send error reply to Slack",
      );
    }
  }
}

function createApp(
  botToken: string,
  appToken: string,
  initialChannel: ChannelMeta,
): SlackAppInstance {
  const { logger } = getDeps();

  const app = new App({
    token: botToken,
    appToken,
    socketMode: true,
  });

  const managedChannels = new Map<string, ChannelMeta>();
  managedChannels.set(initialChannel.channelId, initialChannel);

  let botUserId: string | null = null;

  // Register slash command handlers
  registerCommands(app, managedChannels);

  // Handle incoming messages
  app.message(async ({ message, client }) => {
    // Only handle regular user messages (not bot messages, edits, etc.)
    if (message.subtype !== undefined) return;
    if (!("user" in message) || !("text" in message) || !("ts" in message))
      return;
    if (!message.user || !message.text) return;

    // Deduplicate: skip if we've already seen this message timestamp
    if (isDuplicate(message.ts)) return;

    // Find which eclaire channel manages this Slack channel
    let channelMeta: ChannelMeta | undefined;
    for (const meta of managedChannels.values()) {
      if (meta.slackChannelId === message.channel) {
        channelMeta = meta;
        break;
      }
    }

    if (!channelMeta) return;

    // Mention filtering
    let messageText = message.text;
    const threadTs =
      "thread_ts" in message ? (message.thread_ts as string) : null;
    const threadKey = threadTs ? `${message.channel}:${threadTs}` : null;

    if (channelMeta.mentionMode !== "all") {
      const isMentioned = botUserId
        ? messageText.includes(`<@${botUserId}>`)
        : false;

      // In mention_or_reply mode, respond if:
      // - The message is any reply in a thread (original behavior), OR
      // - The bot has previously participated in this thread (auto-continue)
      const isThreadReply =
        channelMeta.mentionMode === "mention_or_reply" && threadTs != null;

      const isReplyInParticipatedThread =
        isThreadReply ||
        (threadKey != null && hasParticipatedInThread(threadKey));

      if (!isMentioned && !isReplyInParticipatedThread) return;

      // Strip bot mention from message content
      if (botUserId && isMentioned) {
        messageText = messageText
          .replace(new RegExp(`<@${botUserId}>`, "g"), "")
          .trim();
      }
    }

    // Debounce rapid messages from the same user in the same conversation.
    // Batches text and dispatches once after a quiet period.
    const dKey = debounceKey(message.channel, message.user, threadTs);
    const existing = debounceMap.get(dKey);

    if (existing) {
      clearTimeout(existing.timer);
      existing.texts.push(messageText);
      existing.lastArgs = {
        client,
        channel: message.channel,
        user: message.user,
        ts: message.ts,
        channelMeta,
      };
      existing.timer = setTimeout(
        () => dispatchDebounced(dKey, logger),
        DEBOUNCE_MS,
      );
    } else {
      const entry: DebouncedMessage = {
        texts: [messageText],
        lastArgs: {
          client,
          channel: message.channel,
          user: message.user,
          ts: message.ts,
          channelMeta,
        },
        timer: setTimeout(() => dispatchDebounced(dKey, logger), DEBOUNCE_MS),
      };
      debounceMap.set(dKey, entry);
    }
  });

  app.error(async (error) => {
    logger.error(
      { error: error.message ?? "Unknown error" },
      "Slack app error",
    );
  });

  const readyPromise = (async () => {
    await app.start();
    // Get the bot user ID for mention filtering
    try {
      const authResult = await app.client.auth.test();
      botUserId = (authResult.user_id as string) ?? null;
      logger.info(
        {
          botUserId,
          channelId: initialChannel.channelId,
        },
        "Slack bot connected and ready",
      );
    } catch (authError) {
      logger.warn(
        {
          error:
            authError instanceof Error ? authError.message : "Unknown error",
        },
        "Failed to get Slack bot user ID",
      );
    }
  })();

  return { app, botUserId, managedChannels, readyPromise };
}

/**
 * Stops a specific Slack channel.
 * Stops the app only if no other channels use it.
 */
export async function stopBot(channelId: string): Promise<void> {
  const { logger } = getDeps();

  try {
    const botToken = channelTokenMap.get(channelId);
    if (!botToken) {
      logger.debug({ channelId }, "No active Slack app found to stop");
      return;
    }

    const instance = appPool.get(botToken);
    if (!instance) {
      channelTokenMap.delete(channelId);
      return;
    }

    // Remove this channel from the managed set
    const meta = instance.managedChannels.get(channelId);
    if (meta) {
      resetCircuitBreaker(meta.slackChannelId);
    }
    instance.managedChannels.delete(channelId);
    channelTokenMap.delete(channelId);

    logger.info({ channelId }, "Slack channel removed from app");

    // Stop the app if no more channels use it
    if (instance.managedChannels.size === 0) {
      try {
        await instance.app.stop();
        logger.info({ channelId }, "Slack app stopped (no remaining channels)");
      } catch (stopError) {
        logger.warn(
          {
            channelId,
            error:
              stopError instanceof Error ? stopError.message : "Unknown error",
          },
          "Error during Slack app stop",
        );
      } finally {
        appPool.delete(botToken);
      }
    }
  } catch (error) {
    logger.error(
      {
        channelId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error stopping Slack bot",
    );
  }
}

/**
 * Starts a Slack bot for a specific channel.
 */
export async function startBot(channelId: string): Promise<boolean> {
  const { findChannelById, logger } = getDeps();

  try {
    // Stop existing instance if any
    await stopBot(channelId);

    const channel = await findChannelById(channelId);

    if (!channel) {
      logger.error({ channelId }, "Slack channel not found or inactive");
      return false;
    }

    const config = decryptConfig(channel.config);
    if (!config) {
      logger.error({ channelId }, "Failed to decrypt Slack config");
      return false;
    }

    const meta: ChannelMeta = {
      channelId,
      userId: channel.userId,
      slackChannelId: config.channel_id,
      mentionMode: config.mention_mode,
    };

    // Check if there's already an app for this bot token
    const existingInstance = appPool.get(config.bot_token);
    if (existingInstance) {
      // Reuse the existing app
      existingInstance.managedChannels.set(channelId, meta);
      channelTokenMap.set(channelId, config.bot_token);
      logger.info(
        { channelId, existingChannels: existingInstance.managedChannels.size },
        "Slack channel added to existing app",
      );
      return true;
    }

    // Create a new app
    const instance = createApp(config.bot_token, config.app_token, meta);
    appPool.set(config.bot_token, instance);
    channelTokenMap.set(channelId, config.bot_token);

    // Wait for the app to be ready (with timeout)
    try {
      await Promise.race([
        instance.readyPromise,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Slack app ready timeout")),
            30_000,
          ),
        ),
      ]);
    } catch (readyError) {
      logger.error(
        {
          channelId,
          error:
            readyError instanceof Error ? readyError.message : "Unknown error",
        },
        "Slack app failed to become ready",
      );
      // Clean up on failure
      await stopBot(channelId);
      return false;
    }

    logger.info({ channelId }, "Slack bot started successfully");
    return true;
  } catch (error) {
    logger.error(
      {
        channelId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error starting Slack bot",
    );
    return false;
  }
}

/**
 * Sends a message to a Slack channel.
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
      logger.error({ channelId }, "No Slack app for this channel");
      return false;
    }

    const instance = appPool.get(botToken);
    if (!instance) {
      logger.error({ channelId }, "Slack app instance not found");
      return false;
    }

    const meta = instance.managedChannels.get(channelId);
    if (!meta) {
      logger.error({ channelId }, "Channel metadata not found");
      return false;
    }

    const mrkdwn = convertMarkdownToMrkdwn(message);
    const chunks = splitMessage(mrkdwn);
    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i] ?? "";
      await withRetry(
        () =>
          instance.app.client.chat.postMessage({
            channel: meta.slackChannelId,
            text: chunkText,
          }),
        {
          onRetry: (error, attempt) => {
            logger.warn(
              {
                channelId,
                attempt,
                error: error instanceof Error ? error.message : "Unknown error",
              },
              "Retrying Slack sendMessage",
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
      "Slack message sent successfully",
    );

    return true;
  } catch (error) {
    logger.error(
      {
        channelId,
        messageLength: message.length,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to send Slack message",
    );
    return false;
  }
}

/**
 * Starts all active Slack channels for all users.
 */
export async function startAllBots(): Promise<void> {
  const { findActiveChannels, logger } = getDeps();

  try {
    logger.info("Starting all Slack bots");

    const slackChannels = await findActiveChannels();

    logger.info({ count: slackChannels.length }, "Found active Slack channels");

    // Group by bot token to create one app per token
    const tokenGroups = new Map<
      string,
      { channel: (typeof slackChannels)[number]; config: SlackConfig }[]
    >();

    for (const channel of slackChannels) {
      const config = decryptConfig(channel.config);
      if (!config) {
        logger.error(
          { channelId: channel.id },
          "Failed to decrypt Slack config, skipping",
        );
        continue;
      }

      const group = tokenGroups.get(config.bot_token) ?? [];
      group.push({ channel, config });
      tokenGroups.set(config.bot_token, group);
    }

    for (const [botToken, group] of tokenGroups) {
      try {
        // Create app with the first channel
        const first = group[0];
        if (!first) continue;
        const firstMeta: ChannelMeta = {
          channelId: first.channel.id,
          userId: first.channel.userId,
          slackChannelId: first.config.channel_id,
          mentionMode: first.config.mention_mode,
        };

        const instance = createApp(botToken, first.config.app_token, firstMeta);
        appPool.set(botToken, instance);
        channelTokenMap.set(first.channel.id, botToken);

        // Register remaining channels on the same app
        for (let i = 1; i < group.length; i++) {
          const entry = group[i];
          if (!entry) continue;
          const meta: ChannelMeta = {
            channelId: entry.channel.id,
            userId: entry.channel.userId,
            slackChannelId: entry.config.channel_id,
            mentionMode: entry.config.mention_mode,
          };
          instance.managedChannels.set(entry.channel.id, meta);
          channelTokenMap.set(entry.channel.id, botToken);
        }

        // Wait for app to be ready
        try {
          await Promise.race([
            instance.readyPromise,
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("Slack app ready timeout")),
                30_000,
              ),
            ),
          ]);
        } catch (readyError) {
          logger.error(
            {
              error:
                readyError instanceof Error
                  ? readyError.message
                  : "Unknown error",
              channelCount: group.length,
            },
            "Slack app failed to become ready during startup",
          );
          continue;
        }

        for (const entry of group) {
          logger.info(
            {
              channelId: entry.channel.id,
              userId: entry.channel.userId,
              channelName: entry.channel.name,
            },
            "Slack bot started successfully",
          );
        }
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error.message : "Unknown error",
            channelCount: group.length,
          },
          "Failed to start Slack app for token group",
        );
      }
    }

    const totalChannels = Array.from(appPool.values()).reduce(
      (sum, inst) => sum + inst.managedChannels.size,
      0,
    );
    logger.info(
      { activeApps: appPool.size, activeChannels: totalChannels },
      "Slack bot startup completed",
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Error starting Slack bots",
    );
  }
}

/**
 * Stops all Slack bots (for graceful shutdown).
 */
export async function stopAllBots(): Promise<void> {
  const { logger } = getDeps();

  logger.info("Stopping all Slack bots");

  for (const [_botToken, instance] of appPool) {
    try {
      // Reset circuit breakers for all managed channels
      for (const meta of instance.managedChannels.values()) {
        resetCircuitBreaker(meta.slackChannelId);
        channelTokenMap.delete(meta.channelId);
      }
      await instance.app.stop();
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "Error stopping Slack app during shutdown",
      );
    }
  }

  appPool.clear();
  channelTokenMap.clear();
  seenMessages.clear();
  participatedThreads.clear();
  for (const entry of debounceMap.values()) clearTimeout(entry.timer);
  debounceMap.clear();

  logger.info("All Slack bots stopped");
}
