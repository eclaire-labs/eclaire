import { describe, it, expect, vi, beforeEach } from "vitest";
import { setDeps } from "../deps.js";

vi.mock("../bot-manager.js", () => ({ stopBot: vi.fn() }));
vi.mock("../typing-indicator.js", () => ({
  addThinkingReaction: vi.fn(),
  removeThinkingReaction: vi.fn(),
}));
vi.mock("../stream-sender.js", () => ({
  sendStreamingResponse: vi.fn().mockResolvedValue("streamed response"),
}));
vi.mock("../message-utils.js", () => ({
  splitMessage: vi.fn((text: string) => [text]),
  convertMarkdownToMrkdwn: vi.fn((text: string) => text),
}));
vi.mock("../commands.js", () => ({
  getSession: vi.fn().mockReturnValue({}),
}));
// Shared flag to control rate limiter behavior from tests
let rateLimitAllowed = true;

vi.mock("@eclaire/channels-core", () => ({
  ChannelRateLimiter: class {
    allow() {
      return rateLimitAllowed;
    }
  },
  DEFAULT_CHANNEL_AGENT_ACTOR_ID: "eclaire",
}));

// Must import after mocks are declared
const { stopBot } = await import("../bot-manager.js");
const { addThinkingReaction, removeThinkingReaction } = await import(
  "../typing-indicator.js"
);
const { sendStreamingResponse } = await import("../stream-sender.js");
const { getSession } = await import("../commands.js");
const { handleIncomingMessage, handleIncomingAudioFile } = await import(
  "../incoming.js"
);

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

function createMockClient() {
  return {
    chat: { postMessage: vi.fn().mockResolvedValue({ ok: true }) },
    reactions: {
      add: vi.fn().mockResolvedValue({ ok: true }),
      remove: vi.fn().mockResolvedValue({ ok: true }),
    },
  } as any;
}

const mockProcessPromptRequest = vi
  .fn()
  .mockResolvedValue({ response: "AI reply" });
const mockRecordHistory = vi.fn().mockResolvedValue(undefined);
const mockFindChannel = vi.fn();
const mockRouteChannelPrompt = vi.fn();
const mockCreateSession = vi.fn();
const mockProcessPromptRequestStream = vi.fn();
const mockProcessAudioMessage = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();

  // Reset rate limiter to allow by default
  rateLimitAllowed = true;

  mockFindChannel.mockResolvedValue({
    id: "ch-1",
    userId: "user-1",
    name: "test-channel",
    platform: "slack",
    capability: "bidirectional",
    isActive: true,
    config: {},
    agentActorId: null,
  });

  mockRouteChannelPrompt.mockResolvedValue({
    agentActorId: "eclaire",
    prompt: "hello",
  });

  mockCreateSession.mockResolvedValue({ id: "sess-1", title: "Session" });

  (getSession as any).mockReturnValue({});

  mockProcessPromptRequest.mockResolvedValue({ response: "AI reply" });
  mockRecordHistory.mockResolvedValue(undefined);

  setDeps({
    findChannel: mockFindChannel,
    findChannelById: vi.fn(),
    findActiveChannels: vi.fn(),
    encrypt: (v: string) => v,
    decrypt: (v: string) => v,
    routeChannelPrompt: mockRouteChannelPrompt,
    processPromptRequest: mockProcessPromptRequest,
    recordHistory: mockRecordHistory,
    logger: mockLogger as any,
    createSession: mockCreateSession,
  });
});

describe("handleIncomingMessage", () => {
  const client = createMockClient();
  const slackChannelId = "C123";
  const slackUserId = "U456";
  const messageTs = "1234567890.123456";
  const channelId = "ch-1";
  const userId = "user-1";

  beforeEach(() => {
    // Recreate client per test to clear call counts
    Object.assign(client, createMockClient());
  });

  it("processes a message end-to-end (non-streaming)", async () => {
    await handleIncomingMessage(
      client,
      "hello",
      slackChannelId,
      slackUserId,
      messageTs,
      channelId,
      userId,
    );

    expect(mockFindChannel).toHaveBeenCalledWith(channelId, userId);
    expect(addThinkingReaction).toHaveBeenCalledWith(
      client,
      slackChannelId,
      messageTs,
      expect.objectContaining({ info: expect.any(Function) }),
    );
    expect(mockProcessPromptRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        prompt: "hello",
        context: expect.objectContaining({ agentActorId: "eclaire" }),
      }),
    );
    expect(client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: slackChannelId,
        text: "AI reply",
      }),
    );
    expect(removeThinkingReaction).toHaveBeenCalled();
    expect(mockRecordHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "slack_message_processed",
        itemType: "slack_chat",
        userId,
        afterData: expect.objectContaining({
          response: "AI reply",
        }),
      }),
    );
  });

  it("returns early for empty text", async () => {
    await handleIncomingMessage(
      client,
      "",
      slackChannelId,
      slackUserId,
      messageTs,
      channelId,
      userId,
    );

    expect(mockFindChannel).not.toHaveBeenCalled();
    expect(client.chat.postMessage).not.toHaveBeenCalled();
  });

  it("posts rate-limit message when rate limited", async () => {
    rateLimitAllowed = false;

    await handleIncomingMessage(
      client,
      "hello",
      slackChannelId,
      slackUserId,
      messageTs,
      channelId,
      userId,
    );

    expect(client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: slackChannelId,
        thread_ts: messageTs,
        text: expect.stringContaining("too quickly"),
      }),
    );
    expect(mockFindChannel).not.toHaveBeenCalled();
  });

  it("calls stopBot when channel is not found", async () => {
    mockFindChannel.mockResolvedValue(null);

    await handleIncomingMessage(
      client,
      "hello",
      slackChannelId,
      slackUserId,
      messageTs,
      channelId,
      userId,
    );

    expect(stopBot).toHaveBeenCalledWith(channelId);
    expect(client.chat.postMessage).not.toHaveBeenCalled();
  });

  it("returns silently when channel is inactive", async () => {
    mockFindChannel.mockResolvedValue({
      id: "ch-1",
      userId: "user-1",
      name: "test-channel",
      platform: "slack",
      capability: "bidirectional",
      isActive: false,
      config: {},
    });

    await handleIncomingMessage(
      client,
      "hello",
      slackChannelId,
      slackUserId,
      messageTs,
      channelId,
      userId,
    );

    expect(stopBot).not.toHaveBeenCalled();
    expect(client.chat.postMessage).not.toHaveBeenCalled();
    expect(mockProcessPromptRequest).not.toHaveBeenCalled();
  });

  it("posts rejection when channel is notification-only", async () => {
    mockFindChannel.mockResolvedValue({
      id: "ch-1",
      userId: "user-1",
      name: "test-channel",
      platform: "slack",
      capability: "notification",
      isActive: true,
      config: {},
    });

    await handleIncomingMessage(
      client,
      "hello",
      slackChannelId,
      slackUserId,
      messageTs,
      channelId,
      userId,
    );

    expect(client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: slackChannelId,
        thread_ts: messageTs,
        text: expect.stringContaining("notifications only"),
      }),
    );
    expect(mockProcessPromptRequest).not.toHaveBeenCalled();
  });

  it("posts error when routing returns an error", async () => {
    mockRouteChannelPrompt.mockResolvedValue({
      agentActorId: "eclaire",
      prompt: "hello",
      error: "Unknown agent",
    });

    await handleIncomingMessage(
      client,
      "hello",
      slackChannelId,
      slackUserId,
      messageTs,
      channelId,
      userId,
    );

    expect(client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: slackChannelId,
        thread_ts: messageTs,
        text: "Unknown agent",
      }),
    );
    expect(mockProcessPromptRequest).not.toHaveBeenCalled();
  });

  it("continues processing when session creation fails", async () => {
    mockCreateSession.mockRejectedValue(new Error("DB error"));
    (getSession as any).mockReturnValue({});

    await handleIncomingMessage(
      client,
      "hello",
      slackChannelId,
      slackUserId,
      messageTs,
      channelId,
      userId,
    );

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ channelId }),
      expect.stringContaining("Failed to create session"),
    );
    expect(mockProcessPromptRequest).toHaveBeenCalled();
    expect(mockRecordHistory).toHaveBeenCalled();
  });

  it("posts error and removes thinking reaction on processing error", async () => {
    mockProcessPromptRequest.mockRejectedValue(new Error("AI service down"));

    await handleIncomingMessage(
      client,
      "hello",
      slackChannelId,
      slackUserId,
      messageTs,
      channelId,
      userId,
    );

    expect(removeThinkingReaction).toHaveBeenCalled();
    expect(client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: slackChannelId,
        thread_ts: messageTs,
        text: expect.stringContaining("error processing your message"),
      }),
    );
  });

  it("uses streaming when processPromptRequestStream is available", async () => {
    const mockStream = new ReadableStream();
    mockProcessPromptRequestStream.mockResolvedValue(mockStream);

    setDeps({
      findChannel: mockFindChannel,
      findChannelById: vi.fn(),
      findActiveChannels: vi.fn(),
      encrypt: (v: string) => v,
      decrypt: (v: string) => v,
      routeChannelPrompt: mockRouteChannelPrompt,
      processPromptRequest: mockProcessPromptRequest,
      processPromptRequestStream: mockProcessPromptRequestStream,
      recordHistory: mockRecordHistory,
      logger: mockLogger as any,
      createSession: mockCreateSession,
    });

    await handleIncomingMessage(
      client,
      "hello",
      slackChannelId,
      slackUserId,
      messageTs,
      channelId,
      userId,
    );

    expect(mockProcessPromptRequestStream).toHaveBeenCalled();
    expect(sendStreamingResponse).toHaveBeenCalledWith(
      client,
      slackChannelId,
      mockStream,
      expect.objectContaining({ logger: expect.anything() }),
    );
    expect(mockProcessPromptRequest).not.toHaveBeenCalled();
    expect(mockRecordHistory).toHaveBeenCalled();
  });
});

describe("handleIncomingAudioFile", () => {
  const client = createMockClient();
  const botToken = "xoxb-test-token";
  const file = {
    id: "F123",
    name: "audio.webm",
    mimetype: "audio/webm",
    url_private_download: "https://files.slack.com/audio.webm",
  };
  const slackChannelId = "C123";
  const slackUserId = "U456";
  const messageTs = "1234567890.123456";
  const channelId = "ch-1";
  const userId = "user-1";

  beforeEach(() => {
    Object.assign(client, createMockClient());
  });

  it("returns early when processAudioMessage dep is not provided", async () => {
    // Default deps don't include processAudioMessage
    setDeps({
      findChannel: mockFindChannel,
      findChannelById: vi.fn(),
      findActiveChannels: vi.fn(),
      encrypt: (v: string) => v,
      decrypt: (v: string) => v,
      processPromptRequest: mockProcessPromptRequest,
      recordHistory: mockRecordHistory,
      logger: mockLogger as any,
    });

    await handleIncomingAudioFile(
      client,
      botToken,
      file,
      slackChannelId,
      slackUserId,
      messageTs,
      channelId,
      userId,
    );

    expect(mockFindChannel).not.toHaveBeenCalled();
    expect(client.chat.postMessage).not.toHaveBeenCalled();
  });

  it("posts rate-limit message when rate limited", async () => {
    mockProcessAudioMessage.mockResolvedValue({ response: "transcribed" });
    setDeps({
      findChannel: mockFindChannel,
      findChannelById: vi.fn(),
      findActiveChannels: vi.fn(),
      encrypt: (v: string) => v,
      decrypt: (v: string) => v,
      processPromptRequest: mockProcessPromptRequest,
      processAudioMessage: mockProcessAudioMessage,
      recordHistory: mockRecordHistory,
      logger: mockLogger as any,
    });

    rateLimitAllowed = false;

    await handleIncomingAudioFile(
      client,
      botToken,
      file,
      slackChannelId,
      slackUserId,
      messageTs,
      channelId,
      userId,
    );

    expect(client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: slackChannelId,
        thread_ts: messageTs,
        text: expect.stringContaining("too quickly"),
      }),
    );
    expect(mockFindChannel).not.toHaveBeenCalled();
  });

  it("downloads audio, processes, and replies with text", async () => {
    const audioBuffer = Buffer.from("fake-audio-data");
    const mockFetchResponse = {
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(audioBuffer.buffer),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse));

    mockProcessAudioMessage.mockResolvedValue({
      response: "Audio transcription reply",
    });

    setDeps({
      findChannel: mockFindChannel,
      findChannelById: vi.fn(),
      findActiveChannels: vi.fn(),
      encrypt: (v: string) => v,
      decrypt: (v: string) => v,
      processPromptRequest: mockProcessPromptRequest,
      processAudioMessage: mockProcessAudioMessage,
      recordHistory: mockRecordHistory,
      logger: mockLogger as any,
    });

    await handleIncomingAudioFile(
      client,
      botToken,
      file,
      slackChannelId,
      slackUserId,
      messageTs,
      channelId,
      userId,
    );

    expect(addThinkingReaction).toHaveBeenCalled();
    expect(mockProcessAudioMessage).toHaveBeenCalledWith(
      userId,
      expect.any(Buffer),
      expect.objectContaining({
        channelId,
        agentActorId: "eclaire",
        format: "webm",
        ttsEnabled: false,
      }),
    );
    expect(removeThinkingReaction).toHaveBeenCalled();
    expect(client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: slackChannelId,
        thread_ts: messageTs,
        text: "Audio transcription reply",
      }),
    );
    expect(mockRecordHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "slack_audio_processed",
        itemType: "slack_audio",
      }),
    );

    vi.unstubAllGlobals();
  });

  it("calls stopBot when channel is not found", async () => {
    mockFindChannel.mockResolvedValue(null);
    mockProcessAudioMessage.mockResolvedValue({ response: "reply" });

    setDeps({
      findChannel: mockFindChannel,
      findChannelById: vi.fn(),
      findActiveChannels: vi.fn(),
      encrypt: (v: string) => v,
      decrypt: (v: string) => v,
      processPromptRequest: mockProcessPromptRequest,
      processAudioMessage: mockProcessAudioMessage,
      recordHistory: mockRecordHistory,
      logger: mockLogger as any,
    });

    await handleIncomingAudioFile(
      client,
      botToken,
      file,
      slackChannelId,
      slackUserId,
      messageTs,
      channelId,
      userId,
    );

    expect(stopBot).toHaveBeenCalledWith(channelId);
    expect(client.chat.postMessage).not.toHaveBeenCalled();
  });
});
