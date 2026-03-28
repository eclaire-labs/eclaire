import { and, eq } from "drizzle-orm";
import { getActiveModelForContext } from "@eclaire/ai";
import { type ChannelPlatform, ChannelRegistry } from "@eclaire/channels-core";
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
import { listAgents } from "./services/agents.js";
import { createProcessAudioMessage } from "./services/audio.js";
import { recordHistory } from "./services/history.js";
import {
  createSession,
  deleteSession,
  listSessions,
} from "./services/sessions.js";
import { systemCaller } from "./services/types.js";

export const channelRegistry = new ChannelRegistry();

export function buildAgentHandleCandidates(name: string): string[] {
  const normalized = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!normalized) {
    return [];
  }

  return Array.from(
    new Set([
      normalized,
      normalized.replace(/-/g, "_"),
      normalized.replace(/-/g, ""),
    ]),
  );
}

export function parseAddressedPrompt(prompt: string): {
  handle: string;
  cleanedPrompt: string;
} | null {
  const match = prompt.match(/^\s*@([a-z0-9_-]+)\s*[:,-]?\s*(.*)$/is);
  if (!match) {
    return null;
  }

  const [, rawHandle, rawPrompt] = match;
  if (!rawHandle) {
    return null;
  }

  return {
    handle: rawHandle.toLowerCase(),
    cleanedPrompt: rawPrompt?.trim() ?? "",
  };
}

async function routeChannelPrompt(
  userId: string,
  prompt: string,
  defaultAgentActorId: string,
): Promise<{
  agentActorId: string;
  prompt: string;
  addressedAgentName?: string;
  error?: string;
}> {
  const addressedPrompt = parseAddressedPrompt(prompt);
  if (!addressedPrompt) {
    return { agentActorId: defaultAgentActorId, prompt };
  }

  const availableAgents = await listAgents(userId);
  const matchedAgent = availableAgents.find((agent) =>
    buildAgentHandleCandidates(agent.name).includes(addressedPrompt.handle),
  );

  if (!matchedAgent) {
    const knownHandles = availableAgents
      .flatMap((agent) => buildAgentHandleCandidates(agent.name).slice(0, 1))
      .slice(0, 6)
      .map((handle) => `@${handle}`)
      .join(", ");

    return {
      agentActorId: defaultAgentActorId,
      prompt,
      error: knownHandles
        ? `I couldn't find agent @${addressedPrompt.handle}. Try one of: ${knownHandles}.`
        : `I couldn't find agent @${addressedPrompt.handle}.`,
    };
  }

  if (!addressedPrompt.cleanedPrompt) {
    return {
      agentActorId: matchedAgent.id,
      prompt,
      error: `Tell me what you want ${matchedAgent.name} to do after @${addressedPrompt.handle}.`,
    };
  }

  return {
    agentActorId: matchedAgent.id,
    prompt: addressedPrompt.cleanedPrompt,
    addressedAgentName: matchedAgent.name,
  };
}

/** Shared session & model deps for all channel adapters. */
const sessionAndModelDeps = {
  createSession: (userId: string, title?: string, agentActorId?: string) =>
    createSession(userId, systemCaller(userId), title, agentActorId),
  listSessions: async (
    userId: string,
    limit?: number,
    offset?: number,
    agentActorId?: string,
  ) => {
    const result = await listSessions(userId, agentActorId, limit, offset);
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
  routeChannelPrompt,
} as const;

/** Audio message handler for channel adapters (STT → AI → optional TTS). */
const processAudioMessage = createProcessAudioMessage({
  processPromptRequest,
  recordHistory,
});

/** Build platform-specific channel query helpers. */
function channelQueryDeps(platform: ChannelPlatform) {
  return {
    findChannel: async (channelId: string, userId: string) => {
      return (
        (await db.query.channels.findFirst({
          where: and(
            eq(schema.channels.id, channelId),
            eq(schema.channels.userId, userId),
          ),
        })) ?? null
      );
    },
    findChannelById: async (channelId: string) => {
      return (
        (await db.query.channels.findFirst({
          where: and(
            eq(schema.channels.id, channelId),
            eq(schema.channels.platform, platform),
            schema.channels.isActive,
          ),
        })) ?? null
      );
    },
    findActiveChannels: async () => {
      return db.query.channels.findMany({
        where: and(
          eq(schema.channels.platform, platform),
          schema.channels.isActive,
        ),
      });
    },
  };
}

const telegramAdapter = initTelegramAdapter({
  ...channelQueryDeps("telegram"),
  encrypt,
  decrypt,
  processPromptRequest,
  processPromptRequestStream,
  processAudioMessage,
  recordHistory,
  logger: createChildLogger("telegram"),
  ...sessionAndModelDeps,
});

channelRegistry.register(telegramAdapter);

const discordAdapter = initDiscordAdapter({
  ...channelQueryDeps("discord"),
  encrypt,
  decrypt,
  processPromptRequest,
  processPromptRequestStream,
  processAudioMessage,
  recordHistory,
  logger: createChildLogger("discord"),
  ...sessionAndModelDeps,
});

channelRegistry.register(discordAdapter);

const slackAdapter = initSlackAdapter({
  ...channelQueryDeps("slack"),
  encrypt,
  decrypt,
  processPromptRequest,
  processPromptRequestStream,
  processAudioMessage,
  recordHistory,
  logger: createChildLogger("slack"),
  ...sessionAndModelDeps,
});

channelRegistry.register(slackAdapter);
