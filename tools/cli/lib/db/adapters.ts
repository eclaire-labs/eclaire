/**
 * Initialize channel adapters with minimal CLI deps.
 * Only provides encrypt/decrypt and stubs for the rest.
 */

import { and, eq } from "drizzle-orm";
import type { ChannelRecord } from "@eclaire/channels-core";
import { ChannelRegistry } from "@eclaire/channels-core";
import { initTelegramAdapter } from "@eclaire/channels-telegram";
import { initDiscordAdapter } from "@eclaire/channels-discord";
import { initSlackAdapter } from "@eclaire/channels-slack";
import { encrypt, decrypt } from "./encryption.js";
import { getDb } from "./index.js";

let _registry: ChannelRegistry | null = null;

const cliLogger = {
  info: (_obj: unknown, _msg?: string) => {},
  warn: (_obj: unknown, _msg?: string) => {},
  error: (obj: unknown, msg?: string) => {
    console.error(msg || "", obj);
  },
  debug: (_obj: unknown, _msg?: string) => {},
};

const notSupported = () => {
  throw new Error("Not supported in CLI context");
};

function channelQueryDeps(platform: string) {
  return {
    findChannel: async (
      channelId: string,
      userId: string,
    ): Promise<ChannelRecord | null> => {
      const { db, schema } = getDb();
      // biome-ignore lint/suspicious/noExplicitAny: CLI db types are loosely typed
      return (db as any).query.channels.findFirst({
        where: and(
          eq(schema.channels.id, channelId),
          eq(schema.channels.userId, userId),
        ),
      });
    },
    findChannelById: async (
      channelId: string,
    ): Promise<ChannelRecord | null> => {
      const { db, schema } = getDb();
      // biome-ignore lint/suspicious/noExplicitAny: CLI db types are loosely typed
      return (db as any).query.channels.findFirst({
        where: and(
          eq(schema.channels.id, channelId),
          eq(schema.channels.platform, platform as never),
          schema.channels.isActive,
        ),
      });
    },
    findActiveChannels: async (): Promise<ChannelRecord[]> => {
      const { db, schema } = getDb();
      // biome-ignore lint/suspicious/noExplicitAny: CLI db types are loosely typed
      return (db as any).query.channels.findMany({
        where: and(
          eq(schema.channels.platform, platform as never),
          schema.channels.isActive,
        ),
      });
    },
  };
}

export function getChannelRegistry(): ChannelRegistry {
  if (_registry) return _registry;

  const sharedDeps = {
    encrypt,
    decrypt,
    processPromptRequest: notSupported as never,
    recordHistory: notSupported as never,
    logger: cliLogger,
  };

  _registry = new ChannelRegistry();
  _registry.register(
    initTelegramAdapter({ ...channelQueryDeps("telegram"), ...sharedDeps }),
  );
  _registry.register(
    initDiscordAdapter({ ...channelQueryDeps("discord"), ...sharedDeps }),
  );
  _registry.register(
    initSlackAdapter({ ...channelQueryDeps("slack"), ...sharedDeps }),
  );
  return _registry;
}
