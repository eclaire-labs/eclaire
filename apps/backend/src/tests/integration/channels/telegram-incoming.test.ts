import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Module-level mocks — must be before imports from the channel package.
// vi.mock calls are hoisted so we must use literal strings, not variables.
vi.mock(
  "../../../../../../packages/channels/telegram/src/bot-manager.js",
  () => ({
    stopBot: vi.fn(),
  }),
);
vi.mock(
  "../../../../../../packages/channels/telegram/src/stream-sender.js",
  () => ({
    sendStreamingResponse: vi.fn(async () => "streamed response"),
  }),
);

// Must import after vi.mock calls
const { handleIncomingMessage, handleIncomingVoiceMessage } = await import(
  "../../../../../../packages/channels/telegram/src/incoming.js"
);
const { setDeps } = await import(
  "../../../../../../packages/channels/telegram/src/deps.js"
);
const { stopBot } = await import(
  "../../../../../../packages/channels/telegram/src/bot-manager.js"
);

import {
  DB_TEST_CONFIGS,
  type TestDatabase,
  initTestDatabase,
} from "../../db/setup.js";
import { createTestDeps } from "./helpers/create-test-deps.js";
import {
  createMockTelegramContext,
  createMockTelegramVoiceContext,
} from "./helpers/mock-telegram-context.js";
import { seedAgent, seedChannel } from "./helpers/seed-channel.js";

describe.each(DB_TEST_CONFIGS)("$label - Telegram Channel Integration", ({
  dbType,
}) => {
  let testDb: TestDatabase;
  let deps: ReturnType<typeof createTestDeps>;

  beforeEach(async () => {
    vi.clearAllMocks();
    testDb = await initTestDatabase(dbType);
    deps = createTestDeps(testDb, "telegram");
    setDeps(deps.deps);
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it("happy path: processes message through full pipeline", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "telegram",
    });
    const ctx = createMockTelegramContext({ text: "What is AI?" });

    await handleIncomingMessage(ctx, channelId, userId);

    // Streaming path is preferred
    expect(deps.mocks.processPromptRequestStream).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        prompt: "What is AI?",
      }),
    );

    // History row written to real DB
    const historyRows = await testDb.db.query.history.findMany();
    expect(historyRows.length).toBe(1);
    expect(historyRows[0].action).toBe("telegram_message_processed");
    expect(historyRows[0].userId).toBe(userId);
    expect(historyRows[0].metadata).toEqual(
      expect.objectContaining({ platform: "telegram", channelId }),
    );
  });

  it("uses non-streaming fallback and replies", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "telegram",
    });
    setDeps({ ...deps.deps, processPromptRequestStream: undefined });
    const ctx = createMockTelegramContext({ text: "hello" });

    await handleIncomingMessage(ctx, channelId, userId);

    expect(deps.mocks.processPromptRequest).toHaveBeenCalledWith(
      expect.objectContaining({ userId, prompt: "hello" }),
    );
    expect(ctx.reply).toHaveBeenCalledWith("Echo: hello");
  });

  it("channel not found: calls stopBot, no AI processing", async () => {
    const ctx = createMockTelegramContext({ text: "hello" });

    await handleIncomingMessage(ctx, "ch-nonexistent", "user-nobody");

    expect(stopBot).toHaveBeenCalledWith("ch-nonexistent");
    expect(deps.mocks.processPromptRequest).not.toHaveBeenCalled();
  });

  it("inactive channel: silently ignores message", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "telegram",
      isActive: false,
    });
    const ctx = createMockTelegramContext({ text: "hello" });

    await handleIncomingMessage(ctx, channelId, userId);

    expect(deps.mocks.processPromptRequest).not.toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("notification-only channel: sends rejection message", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "telegram",
      capability: "notification",
    });
    const ctx = createMockTelegramContext({ text: "hello" });

    await handleIncomingMessage(ctx, channelId, userId);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("notifications only"),
    );
    expect(deps.mocks.processPromptRequest).not.toHaveBeenCalled();
  });

  it("agent routing: @agent-name routes to correct agent", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "telegram",
    });
    const { agentId } = await seedAgent(testDb, userId, {
      name: "Research Bot",
    });
    setDeps({ ...deps.deps, processPromptRequestStream: undefined });
    const ctx = createMockTelegramContext({
      text: "@research-bot summarize this",
    });

    await handleIncomingMessage(ctx, channelId, userId);

    expect(deps.mocks.processPromptRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        prompt: "summarize this",
        context: expect.objectContaining({ agentActorId: agentId }),
      }),
    );
  });

  it("agent routing: unknown agent sends error", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "telegram",
    });
    const ctx = createMockTelegramContext({
      text: "@nonexistent hello",
    });

    await handleIncomingMessage(ctx, channelId, userId);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("couldn't find agent"),
    );
  });

  it("session creation: persists conversation and updates ctx.session", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "telegram",
    });
    const ctx = createMockTelegramContext({ text: "start a chat" });

    await handleIncomingMessage(ctx, channelId, userId);

    // Conversation row in DB
    const conversations = await testDb.db.query.conversations.findMany();
    expect(conversations.length).toBe(1);
    expect(conversations[0].userId).toBe(userId);

    // ctx.session was updated with the session ID
    expect(ctx.session.sessionId).toBe(conversations[0].id);
  });

  it("typing indicator: sends chat action", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "telegram",
    });
    const ctx = createMockTelegramContext({ text: "hello" });

    await handleIncomingMessage(ctx, channelId, userId);

    expect(ctx.telegram.sendChatAction).toHaveBeenCalledWith(
      ctx.chat.id,
      "typing",
    );
  });

  describe("handleIncomingVoiceMessage", () => {
    it("processes voice message through full pipeline", async () => {
      const { userId, channelId } = await seedChannel(testDb, {
        platform: "telegram",
      });

      // Mock global fetch for voice file download
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      }) as any;

      try {
        const ctx = createMockTelegramVoiceContext();

        await handleIncomingVoiceMessage(ctx, channelId, userId);

        expect(ctx.telegram.getFileLink).toHaveBeenCalledWith("voice-file-123");
        expect(deps.mocks.processAudioMessage).toHaveBeenCalledWith(
          userId,
          expect.any(Buffer),
          expect.objectContaining({ channelId, format: "ogg" }),
        );

        // Text reply sent
        expect(ctx.reply).toHaveBeenCalledWith("Transcribed audio response");

        // History row written
        const historyRows = await testDb.db.query.history.findMany();
        expect(historyRows.length).toBe(1);
        expect(historyRows[0].action).toBe("telegram_voice_message_processed");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("notification-only channel: rejects voice message", async () => {
      const { userId, channelId } = await seedChannel(testDb, {
        platform: "telegram",
        capability: "notification",
      });
      const ctx = createMockTelegramVoiceContext();

      await handleIncomingVoiceMessage(ctx, channelId, userId);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("notifications only"),
      );
      expect(deps.mocks.processAudioMessage).not.toHaveBeenCalled();
    });

    it("channel not found: calls stopBot", async () => {
      const ctx = createMockTelegramVoiceContext();

      await handleIncomingVoiceMessage(ctx, "ch-nonexistent", "user-nobody");

      expect(stopBot).toHaveBeenCalledWith("ch-nonexistent");
      expect(deps.mocks.processAudioMessage).not.toHaveBeenCalled();
    });
  });
});
