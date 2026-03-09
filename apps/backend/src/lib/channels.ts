import { getActiveModelForContext } from "@eclaire/ai";
import { ChannelRegistry } from "@eclaire/channels-core";
import { initDiscordAdapter } from "@eclaire/channels-discord";
import { initSlackAdapter } from "@eclaire/channels-slack";
import { initTelegramAdapter } from "@eclaire/channels-telegram";
import { db, schema } from "../db/index.js";
import {
  processPromptRequest,
  processPromptRequestStream,
} from "./agent/index.js";
import { decrypt, encrypt } from "./encryption.js";
import { createChildLogger } from "./logger.js";
import { recordHistory } from "./services/history.js";
import {
  createSession,
  deleteSession,
  listSessions,
} from "./services/sessions.js";
import { systemCaller } from "./services/types.js";

export const channelRegistry = new ChannelRegistry();

/** Shared session & model deps for all channel adapters. */
const sessionAndModelDeps = {
  createSession: (userId: string, title?: string) =>
    createSession(userId, systemCaller(userId), title),
  listSessions: async (userId: string, limit?: number, offset?: number) => {
    const result = await listSessions(userId, limit, offset);
    return result.items;
  },
  deleteSession: (sessionId: string, userId: string) =>
    deleteSession(sessionId, userId, systemCaller(userId)),
  getModelInfo: () => {
    const model = getActiveModelForContext("backend");
    if (!model) return null;
    return {
      name: model.name,
      provider: model.provider,
      model: model.providerModel,
    };
  },
} as const;

const telegramAdapter = initTelegramAdapter({
  db,
  schema,
  encrypt,
  decrypt,
  processPromptRequest,
  processPromptRequestStream,
  recordHistory,
  logger: createChildLogger("telegram"),
  ...sessionAndModelDeps,
});

channelRegistry.register(telegramAdapter);

const discordAdapter = initDiscordAdapter({
  db,
  schema,
  encrypt,
  decrypt,
  processPromptRequest,
  processPromptRequestStream,
  recordHistory,
  logger: createChildLogger("discord"),
  ...sessionAndModelDeps,
});

channelRegistry.register(discordAdapter);

const slackAdapter = initSlackAdapter({
  db,
  schema,
  encrypt,
  decrypt,
  processPromptRequest,
  processPromptRequestStream,
  recordHistory,
  logger: createChildLogger("slack"),
  ...sessionAndModelDeps,
});

channelRegistry.register(slackAdapter);
