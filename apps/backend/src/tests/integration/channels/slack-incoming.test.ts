import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Module-level mocks — must be before imports from the channel package.
// vi.mock calls are hoisted so we must use literal strings, not variables.
vi.mock("../../../../../../packages/channels/slack/src/bot-manager.js", () => ({
  stopBot: vi.fn(),
}));
vi.mock(
  "../../../../../../packages/channels/slack/src/stream-sender.js",
  () => ({
    sendStreamingResponse: vi.fn(async () => "streamed response"),
  }),
);
vi.mock("../../../../../../packages/channels/slack/src/commands.js", () => ({
  getSession: vi.fn().mockReturnValue({
    enableThinking: false,
    sessionId: undefined,
    agentActorId: undefined,
  }),
}));

// Must import after vi.mock calls
const { handleIncomingMessage, handleIncomingAudioFile } = await import(
  "../../../../../../packages/channels/slack/src/incoming.js"
);
const { setDeps } = await import(
  "../../../../../../packages/channels/slack/src/deps.js"
);
const { stopBot } = await import(
  "../../../../../../packages/channels/slack/src/bot-manager.js"
);
const { getSession } = await import(
  "../../../../../../packages/channels/slack/src/commands.js"
);

import {
  DB_TEST_CONFIGS,
  type TestDatabase,
  initTestDatabase,
} from "../../db/setup.js";
import { createTestDeps } from "./helpers/create-test-deps.js";
import { createMockSlackClient } from "./helpers/mock-slack-client.js";
import { seedAgent, seedChannel } from "./helpers/seed-channel.js";

describe.each(DB_TEST_CONFIGS)("$label - Slack Channel Integration", ({
  dbType,
}) => {
  let testDb: TestDatabase;
  let deps: ReturnType<typeof createTestDeps>;

  beforeEach(async () => {
    vi.clearAllMocks();
    testDb = await initTestDatabase(dbType);
    deps = createTestDeps(testDb, "slack");
    setDeps(deps.deps);
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it("happy path: processes message through full pipeline", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "slack",
    });
    const client = createMockSlackClient();

    await handleIncomingMessage(
      client,
      "What is AI?",
      "C12345",
      "U67890",
      "1234567890.000001",
      channelId,
      userId,
    );

    // Streaming path is preferred
    expect(deps.mocks.processPromptRequestStream).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        prompt: "What is AI?",
      }),
    );

    // History row was written to the real DB
    const historyRows = await testDb.db.query.history.findMany();
    expect(historyRows.length).toBe(1);
    expect(historyRows[0].action).toBe("slack_message_processed");
    expect(historyRows[0].userId).toBe(userId);
    expect(historyRows[0].metadata).toEqual(
      expect.objectContaining({ platform: "slack", channelId }),
    );
  });

  it("uses non-streaming fallback and posts message", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "slack",
    });
    setDeps({ ...deps.deps, processPromptRequestStream: undefined });
    const client = createMockSlackClient();

    await handleIncomingMessage(
      client,
      "hello",
      "C12345",
      "U67890",
      "ts-1",
      channelId,
      userId,
    );

    expect(deps.mocks.processPromptRequest).toHaveBeenCalledWith(
      expect.objectContaining({ userId, prompt: "hello" }),
    );
    expect(client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C12345",
        text: expect.stringContaining("Echo: hello"),
      }),
    );
  });

  it("channel not found: calls stopBot, no AI processing", async () => {
    const client = createMockSlackClient();

    await handleIncomingMessage(
      client,
      "hello",
      "C12345",
      "U67890",
      "ts-1",
      "ch-nonexistent",
      "user-nobody",
    );

    expect(stopBot).toHaveBeenCalledWith("ch-nonexistent");
    expect(deps.mocks.processPromptRequest).not.toHaveBeenCalled();
  });

  it("inactive channel: silently ignores message", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "slack",
      isActive: false,
    });
    const client = createMockSlackClient();

    await handleIncomingMessage(
      client,
      "hello",
      "C12345",
      "U67890",
      "ts-1",
      channelId,
      userId,
    );

    expect(deps.mocks.processPromptRequest).not.toHaveBeenCalled();
    expect(client.chat.postMessage).not.toHaveBeenCalled();
  });

  it("notification-only channel: sends rejection message", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "slack",
      capability: "notification",
    });
    const client = createMockSlackClient();

    await handleIncomingMessage(
      client,
      "hello",
      "C12345",
      "U67890",
      "ts-1",
      channelId,
      userId,
    );

    expect(client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("notifications only"),
      }),
    );
    expect(deps.mocks.processPromptRequest).not.toHaveBeenCalled();
  });

  it("agent routing: @agent-name routes to correct agent", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "slack",
    });
    const { agentId } = await seedAgent(testDb, userId, {
      name: "Research Bot",
    });
    setDeps({ ...deps.deps, processPromptRequestStream: undefined });
    const client = createMockSlackClient();

    await handleIncomingMessage(
      client,
      "@research-bot summarize this",
      "C12345",
      "U67890",
      "ts-1",
      channelId,
      userId,
    );

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
      platform: "slack",
    });
    const client = createMockSlackClient();

    await handleIncomingMessage(
      client,
      "@nonexistent hello",
      "C12345",
      "U67890",
      "ts-1",
      channelId,
      userId,
    );

    expect(client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("couldn't find agent"),
      }),
    );
  });

  it("session creation: persists conversation in DB", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "slack",
    });
    const sessionState = {
      enableThinking: false,
      sessionId: undefined as string | undefined,
      agentActorId: undefined as string | undefined,
    };
    (getSession as ReturnType<typeof vi.fn>).mockReturnValue(sessionState);
    const client = createMockSlackClient();

    await handleIncomingMessage(
      client,
      "start a chat",
      "C12345",
      "U67890",
      "ts-1",
      channelId,
      userId,
    );

    const conversations = await testDb.db.query.conversations.findMany();
    expect(conversations.length).toBe(1);
    expect(conversations[0].userId).toBe(userId);
    expect(sessionState.sessionId).toBe(conversations[0].id);
  });

  it("thinking reactions: adds and removes on success", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "slack",
    });
    const client = createMockSlackClient();

    await handleIncomingMessage(
      client,
      "hello",
      "C12345",
      "U67890",
      "ts-1",
      channelId,
      userId,
    );

    // Thinking reaction should be added then removed
    expect(client.reactions.add).toHaveBeenCalled();
    expect(client.reactions.remove).toHaveBeenCalled();
  });

  it("empty text: drops silently", async () => {
    const { userId, channelId } = await seedChannel(testDb, {
      platform: "slack",
    });
    const client = createMockSlackClient();

    await handleIncomingMessage(
      client,
      "",
      "C12345",
      "U67890",
      "ts-1",
      channelId,
      userId,
    );

    expect(deps.mocks.processPromptRequest).not.toHaveBeenCalled();
    expect(client.chat.postMessage).not.toHaveBeenCalled();
  });

  describe("handleIncomingAudioFile", () => {
    it("processes audio file through full pipeline", async () => {
      const { userId, channelId } = await seedChannel(testDb, {
        platform: "slack",
      });
      const client = createMockSlackClient();

      // Mock global fetch for audio file download
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      }) as any;

      try {
        await handleIncomingAudioFile(
          client,
          "xoxb-fake-token",
          {
            id: "F12345",
            name: "audio.webm",
            mimetype: "audio/webm",
            url_private_download:
              "https://files.slack.com/files-pri/T12345/audio.webm",
          },
          "C12345",
          "U67890",
          "ts-1",
          channelId,
          userId,
        );

        expect(deps.mocks.processAudioMessage).toHaveBeenCalledWith(
          userId,
          expect.any(Buffer),
          expect.objectContaining({ channelId, format: "webm" }),
        );

        // History row written
        const historyRows = await testDb.db.query.history.findMany();
        expect(historyRows.length).toBe(1);
        expect(historyRows[0].action).toBe("slack_audio_processed");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("notification-only channel: rejects audio", async () => {
      const { userId, channelId } = await seedChannel(testDb, {
        platform: "slack",
        capability: "notification",
      });
      const client = createMockSlackClient();

      await handleIncomingAudioFile(
        client,
        "xoxb-fake-token",
        {
          id: "F12345",
          name: "audio.webm",
          url_private_download: "https://files.slack.com/files-pri/audio.webm",
        },
        "C12345",
        "U67890",
        "ts-1",
        channelId,
        userId,
      );

      expect(client.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("notifications only"),
        }),
      );
      expect(deps.mocks.processAudioMessage).not.toHaveBeenCalled();
    });
  });
});
