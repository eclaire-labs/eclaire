/**
 * Builds a complete channel adapter deps object wired to an in-memory test database.
 *
 * Real: DB queries, encryption, history recording, session management, prompt routing.
 * Mocked: AI processing (processPromptRequest, processPromptRequestStream, processAudioMessage), logger.
 */
import { createEncryption, parseEncryptionKey } from "@eclaire/core";
import type { ChannelPlatform } from "@eclaire/channels-core";
import { and, desc, eq } from "drizzle-orm";
import { vi } from "vitest";
import {
  buildAgentHandleCandidates,
  parseAddressedPrompt,
} from "../../../../lib/channels.js";
import type { TestDatabase } from "../../../db/setup.js";

// 64 hex chars = 32-byte AES-256 key (test-only)
const TEST_ENCRYPTION_HEX =
  "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

export function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

export function createTestDeps(
  testDb: TestDatabase,
  platform: ChannelPlatform,
) {
  const { db, schema } = testDb;
  const encService = createEncryption(parseEncryptionKey(TEST_ENCRYPTION_HEX));

  const logger = createMockLogger();

  const processPromptRequest = vi.fn(async (opts: { prompt: string }) => ({
    response: `Echo: ${opts.prompt}`,
  }));

  const processPromptRequestStream = vi.fn(
    async () =>
      new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: "text-chunk",
            content: "streamed response",
          });
          controller.enqueue({ type: "done" });
          controller.close();
        },
      }),
  );

  const processAudioMessage = vi.fn(async () => ({
    response: "Transcribed audio response",
  }));

  // --- Real deps built from test DB ---

  const findChannel = async (channelId: string, userId: string) => {
    return (
      (await db.query.channels.findFirst({
        where: and(
          eq(schema.channels.id, channelId),
          eq(schema.channels.userId, userId),
        ),
      })) ?? null
    );
  };

  const findChannelById = async (channelId: string) => {
    return (
      (await db.query.channels.findFirst({
        where: and(
          eq(schema.channels.id, channelId),
          eq(schema.channels.platform, platform),
          schema.channels.isActive,
        ),
      })) ?? null
    );
  };

  const findActiveChannels = async () => {
    return db.query.channels.findMany({
      where: and(
        eq(schema.channels.platform, platform),
        schema.channels.isActive,
      ),
    });
  };

  const encrypt = (value: string): string => encService.encrypt(value);

  const decrypt = (value: string): string => {
    const result = encService.decrypt(value);
    if (result === null) {
      throw new Error("Decryption failed");
    }
    return result;
  };

  const recordHistory = async (entry: {
    action: string;
    itemType: string;
    itemId: string;
    itemName?: string;
    beforeData?: Record<string, unknown> | null;
    afterData?: Record<string, unknown> | null;
    actor: string;
    actorId?: string;
    userId?: string;
    metadata?: Record<string, unknown> | null;
  }) => {
    await db.insert(schema.history).values({
      action: entry.action,
      itemType: entry.itemType,
      itemId: entry.itemId,
      itemName: entry.itemName,
      beforeData: entry.beforeData,
      afterData: entry.afterData,
      actor: entry.actor,
      actorId: entry.actorId,
      userId: entry.userId,
      metadata: entry.metadata,
    });
  };

  const createSession = async (
    userId: string,
    title?: string,
    agentActorId?: string,
  ) => {
    const [row] = await db
      .insert(schema.conversations)
      .values({
        userId,
        title: title ?? null,
        agentActorId: agentActorId ?? "eclaire",
      })
      .returning({ id: schema.conversations.id });
    return { id: row!.id, title: title ?? null };
  };

  const listSessions = async (
    userId: string,
    limit = 10,
    offset = 0,
    agentActorId?: string,
  ) => {
    const conditions = [eq(schema.conversations.userId, userId)];
    if (agentActorId) {
      conditions.push(eq(schema.conversations.agentActorId, agentActorId));
    }
    const rows = await db.query.conversations.findMany({
      where: and(...conditions),
      orderBy: [desc(schema.conversations.updatedAt)],
      limit,
      offset,
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      messageCount: r.messageCount,
      updatedAt: r.updatedAt,
    }));
  };

  const deleteSession = async (sessionId: string, userId: string) => {
    const result = await db
      .delete(schema.conversations)
      .where(
        and(
          eq(schema.conversations.id, sessionId),
          eq(schema.conversations.userId, userId),
        ),
      );
    // drizzle returns different result shapes per driver; just return true
    return true;
  };

  const routeChannelPrompt = async (
    userId: string,
    prompt: string,
    defaultAgentActorId: string,
  ): Promise<{
    agentActorId: string;
    prompt: string;
    addressedAgentName?: string;
    error?: string;
  }> => {
    const addressedPrompt = parseAddressedPrompt(prompt);
    if (!addressedPrompt) {
      return { agentActorId: defaultAgentActorId, prompt };
    }

    const availableAgents = await db.query.agents.findMany({
      where: eq(schema.agents.userId, userId),
    });

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
  };

  const getModelInfo = () => ({
    name: "test-model",
    provider: "test",
    model: "test-v1",
  });

  const deps = {
    findChannel,
    findChannelById,
    findActiveChannels,
    encrypt,
    decrypt,
    processPromptRequest,
    processPromptRequestStream,
    processAudioMessage,
    recordHistory,
    logger,
    createSession,
    listSessions,
    deleteSession,
    getModelInfo,
    routeChannelPrompt,
  };

  return {
    deps,
    mocks: {
      processPromptRequest,
      processPromptRequestStream,
      processAudioMessage,
      logger,
    },
  };
}
