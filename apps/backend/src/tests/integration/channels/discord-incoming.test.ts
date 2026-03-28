import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Module-level mocks — must be before imports from the channel package.
// vi.mock calls are hoisted so we must use literal strings, not variables.
vi.mock(
  "../../../../../../packages/channels/discord/src/bot-manager.js",
  () => ({
    stopBot: vi.fn(),
    sendVoiceMessage: vi.fn(),
  }),
);
vi.mock(
  "../../../../../../packages/channels/discord/src/stream-sender.js",
  () => ({
    sendStreamingResponse: vi.fn(async () => "streamed response"),
  }),
);
vi.mock("../../../../../../packages/channels/discord/src/commands.js", () => ({
  getSession: vi.fn().mockReturnValue({
    enableThinking: false,
    sessionId: undefined,
    agentActorId: undefined,
  }),
}));
vi.mock(
  "../../../../../../packages/channels/discord/src/voice-utils.js",
  () => ({
    downloadFile: vi.fn(),
    convertToOggOpus: vi.fn(),
    getAudioDuration: vi.fn(),
    generateWaveform: vi.fn(),
  }),
);

// Must import after vi.mock calls
const { handleIncomingMessage } = await import(
  "../../../../../../packages/channels/discord/src/incoming.js"
);
const { setDeps } = await import(
  "../../../../../../packages/channels/discord/src/deps.js"
);
const { stopBot } = await import(
  "../../../../../../packages/channels/discord/src/bot-manager.js"
);
const { getSession } = await import(
  "../../../../../../packages/channels/discord/src/commands.js"
);
const { downloadFile } = await import(
  "../../../../../../packages/channels/discord/src/voice-utils.js"
);

import {
  DB_TEST_CONFIGS,
  type TestDatabase,
  initTestDatabase,
} from "../../db/setup.js";
import { createTestDeps } from "./helpers/create-test-deps.js";
import { createMockDiscordMessage } from "./helpers/mock-discord-message.js";
import { seedAgent, seedChannel } from "./helpers/seed-channel.js";

describe.each(DB_TEST_CONFIGS)("$label - Discord Channel Integration", ({
  dbType,
}) => {
  let testDb: TestDatabase;
  let deps: ReturnType<typeof createTestDeps>;

  beforeEach(async () => {
    vi.clearAllMocks();
    testDb = await initTestDatabase(dbType);
    deps = createTestDeps(testDb, "discord");
    setDeps(deps.deps);
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it("happy path: processes message through full pipeline", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "discord",
    });
    const message = createMockDiscordMessage({ content: "What is AI?" });

    await handleIncomingMessage(message, channelId, userId);

    // Streaming path is preferred when processPromptRequestStream is available
    expect(deps.mocks.processPromptRequestStream).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        prompt: "What is AI?",
      }),
    );

    // History row was written to the real DB
    const historyRows = await testDb.db.query.history.findMany();
    expect(historyRows.length).toBe(1);
    expect(historyRows[0].action).toBe("discord_message_processed");
    expect(historyRows[0].userId).toBe(userId);
    expect(historyRows[0].metadata).toEqual(
      expect.objectContaining({ platform: "discord", channelId }),
    );
  });

  it("uses non-streaming fallback when stream dep is absent", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "discord",
    });
    // Remove the streaming dep
    setDeps({ ...deps.deps, processPromptRequestStream: undefined });
    const message = createMockDiscordMessage({ content: "hello" });

    await handleIncomingMessage(message, channelId, userId);

    expect(deps.mocks.processPromptRequest).toHaveBeenCalledWith(
      expect.objectContaining({ userId, prompt: "hello" }),
    );
    expect(message.reply).toHaveBeenCalledWith("Echo: hello");

    const historyRows = await testDb.db.query.history.findMany();
    expect(historyRows.length).toBe(1);
  });

  it("channel not found: calls stopBot, no AI processing", async () => {
    const message = createMockDiscordMessage({ content: "hello" });

    await handleIncomingMessage(message, "ch-nonexistent", "user-nobody");

    expect(stopBot).toHaveBeenCalledWith("ch-nonexistent");
    expect(deps.mocks.processPromptRequest).not.toHaveBeenCalled();
    expect(deps.mocks.processPromptRequestStream).not.toHaveBeenCalled();
  });

  it("inactive channel: silently ignores message", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "discord",
      isActive: false,
    });
    const message = createMockDiscordMessage({ content: "hello" });

    await handleIncomingMessage(message, channelId, userId);

    expect(deps.mocks.processPromptRequest).not.toHaveBeenCalled();
    expect(deps.mocks.processPromptRequestStream).not.toHaveBeenCalled();
    expect(message.reply).not.toHaveBeenCalled();
  });

  it("notification-only channel: sends rejection message", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "discord",
      capability: "notification",
    });
    const message = createMockDiscordMessage({ content: "hello" });

    await handleIncomingMessage(message, channelId, userId);

    expect(message.reply).toHaveBeenCalledWith(
      expect.stringContaining("notifications only"),
    );
    expect(deps.mocks.processPromptRequest).not.toHaveBeenCalled();
  });

  it("agent routing: @agent-name routes to correct agent", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "discord",
    });
    const { agentId } = await seedAgent(testDb, userId, {
      name: "Research Bot",
    });

    // Remove streaming so we can inspect processPromptRequest args directly
    setDeps({ ...deps.deps, processPromptRequestStream: undefined });
    const message = createMockDiscordMessage({
      content: "@research-bot summarize this",
    });

    await handleIncomingMessage(message, channelId, userId);

    expect(deps.mocks.processPromptRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        prompt: "summarize this",
        context: expect.objectContaining({ agentActorId: agentId }),
      }),
    );
  });

  it("agent routing: unknown agent sends error message", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "discord",
    });
    const message = createMockDiscordMessage({
      content: "@nonexistent hello",
    });

    await handleIncomingMessage(message, channelId, userId);

    expect(message.reply).toHaveBeenCalledWith(
      expect.stringContaining("couldn't find agent"),
    );
    expect(deps.mocks.processPromptRequest).not.toHaveBeenCalled();
    expect(deps.mocks.processPromptRequestStream).not.toHaveBeenCalled();
  });

  it("session creation: persists conversation row in DB", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "discord",
    });
    const sessionState = {
      enableThinking: false,
      sessionId: undefined as string | undefined,
      agentActorId: undefined as string | undefined,
    };
    (getSession as ReturnType<typeof vi.fn>).mockReturnValue(sessionState);

    const message = createMockDiscordMessage({ content: "start a chat" });
    await handleIncomingMessage(message, channelId, userId);

    // A conversation row should exist in the DB
    const conversations = await testDb.db.query.conversations.findMany();
    expect(conversations.length).toBe(1);
    expect(conversations[0].userId).toBe(userId);

    // Session state should be updated with the new session ID
    expect(sessionState.sessionId).toBe(conversations[0].id);
  });

  it("voice message: calls processAudioMessage", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "discord",
    });
    const mockBuffer = Buffer.from("fake-audio");
    (downloadFile as ReturnType<typeof vi.fn>).mockResolvedValue(mockBuffer);

    const message = createMockDiscordMessage({
      content: "",
      isVoiceMessage: true,
      attachments: [
        {
          url: "https://cdn.discordapp.com/attachments/voice.ogg",
          name: "voice-message.ogg",
          contentType: "audio/ogg",
          size: 1024,
        },
      ],
    });

    await handleIncomingMessage(message, channelId, userId);

    expect(deps.mocks.processAudioMessage).toHaveBeenCalledWith(
      userId,
      mockBuffer,
      expect.objectContaining({ channelId, format: "ogg" }),
    );

    // History should record a voice message action
    const historyRows = await testDb.db.query.history.findMany();
    expect(historyRows.length).toBe(1);
    expect(historyRows[0].action).toBe("discord_voice_message_processed");
  });

  it("empty message with no attachments: drops silently", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "discord",
    });
    const message = createMockDiscordMessage({ content: "" });

    await handleIncomingMessage(message, channelId, userId);

    expect(deps.mocks.processPromptRequest).not.toHaveBeenCalled();
    expect(deps.mocks.processPromptRequestStream).not.toHaveBeenCalled();
    expect(message.reply).not.toHaveBeenCalled();
  });
});
