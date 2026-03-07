import type { ChannelAdapter, ChannelRecord, SendResult } from "@eclaire/channels-core";
import {
  validateAndEncryptConfig,
  decryptConfig,
} from "./config.js";
import {
  startAllBots,
  startBot,
  stopAllBots,
  stopBot,
  sendMessage,
} from "./bot-manager.js";
import { setDeps, type SlackDeps } from "./deps.js";

const slackAdapter: ChannelAdapter = {
  platform: "slack",
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
 * Initialize the Slack adapter with backend dependencies.
 * Must be called before the adapter is used.
 */
export function initSlackAdapter(deps: SlackDeps): ChannelAdapter {
  setDeps(deps);
  return slackAdapter;
}
