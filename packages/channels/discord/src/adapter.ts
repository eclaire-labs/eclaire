import type {
  ChannelAdapter,
  ChannelRecord,
  SendResult,
} from "@eclaire/channels-core";

import {
  sendMessage,
  startAllBots,
  startBot,
  stopAllBots,
  stopBot,
} from "./bot-manager.js";
import { decryptConfig, validateAndEncryptConfig } from "./config.js";
import { type DiscordDeps, setDeps } from "./deps.js";

const discordAdapter: ChannelAdapter = {
  platform: "discord",
  capabilities: ["notification", "chat", "bidirectional"],

  async validateAndEncryptConfig(rawConfig: unknown) {
    return validateAndEncryptConfig(rawConfig);
  },

  decryptConfig(storedConfig: unknown) {
    return decryptConfig(storedConfig);
  },

  async send(
    channel: ChannelRecord,
    message: string,
    options?: Record<string, unknown>,
  ): Promise<SendResult> {
    const success = await sendMessage(channel.id, message, options);
    return { success, error: success ? undefined : "Failed to send message" };
  },

  async start(channel: ChannelRecord) {
    await startBot(channel.id);
  },

  async stop(channelId: string) {
    await stopBot(channelId);
  },

  async startAll() {
    await startAllBots();
  },

  async stopAll() {
    await stopAllBots();
  },
};

/**
 * Initialize the Discord adapter with backend dependencies.
 * Must be called before the adapter is used.
 */
export function initDiscordAdapter(deps: DiscordDeps): ChannelAdapter {
  setDeps(deps);
  return discordAdapter;
}
