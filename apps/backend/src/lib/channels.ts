import { ChannelRegistry } from "@eclaire/channels-core";
import { initTelegramAdapter } from "@eclaire/channels-telegram";
import { initDiscordAdapter } from "@eclaire/channels-discord";
import { initSlackAdapter } from "@eclaire/channels-slack";
import { db, schema } from "../db/index.js";
import { encrypt, decrypt } from "./encryption.js";
import { processPromptRequest, processPromptRequestStream } from "./agent/index.js";
import { recordHistory } from "./services/history.js";
import { createChildLogger } from "./logger.js";

export const channelRegistry = new ChannelRegistry();

const telegramAdapter = initTelegramAdapter({
  db,
  schema,
  encrypt,
  decrypt,
  processPromptRequest,
  processPromptRequestStream,
  recordHistory,
  logger: createChildLogger("telegram"),
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
});

channelRegistry.register(slackAdapter);
