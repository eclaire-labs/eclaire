/**
 * Initialize channel adapters with minimal CLI deps.
 * Only provides encrypt/decrypt and stubs for the rest.
 */

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

export function getChannelRegistry(): ChannelRegistry {
  if (_registry) return _registry;

  const { db, schema } = getDb();
  const sharedDeps = {
    db,
    schema,
    encrypt,
    decrypt,
    processPromptRequest: notSupported as never,
    recordHistory: notSupported as never,
    logger: cliLogger,
  };

  _registry = new ChannelRegistry();
  _registry.register(initTelegramAdapter(sharedDeps));
  _registry.register(initDiscordAdapter(sharedDeps));
  _registry.register(initSlackAdapter(sharedDeps));
  return _registry;
}
