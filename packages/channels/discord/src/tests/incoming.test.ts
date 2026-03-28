import { beforeEach, describe, expect, it, vi } from "vitest";
import { setDeps } from "../deps.js";

vi.mock("../bot-manager.js", () => ({
  stopBot: vi.fn(),
  sendVoiceMessage: vi.fn(),
}));
vi.mock("../typing-indicator.js", () => ({ safeSendTyping: vi.fn() }));
vi.mock("../stream-sender.js", () => ({
  sendStreamingResponse: vi.fn(async () => "streamed response"),
}));
vi.mock("../message-utils.js", () => ({
  splitMessage: vi.fn((text: string) => [text]),
}));
vi.mock("../commands.js", () => ({
  getSession: vi.fn().mockReturnValue({
    enableThinking: true,
    sessionId: undefined,
    agentActorId: undefined,
  }),
}));
vi.mock("../voice-utils.js", () => ({
  downloadFile: vi.fn(),
  convertToOggOpus: vi.fn(),
  getAudioDuration: vi.fn(),
  generateWaveform: vi.fn(),
}));

// Must import after vi.mock calls
const { handleIncomingMessage } = await import("../incoming.js");
const { stopBot } = await import("../bot-manager.js");
const { sendStreamingResponse } = await import("../stream-sender.js");

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const mockFindChannel = vi.fn();
const mockProcessPromptRequest = vi.fn(async () => ({
  response: "bot reply",
}));
const mockProcessPromptRequestStream = vi.fn();
const mockRecordHistory = vi.fn(async () => {});
const mockRouteChannelPrompt = vi.fn(
  async (_uid: string, prompt: string) =>
    ({
      agentActorId: "eclaire",
      prompt,
    }) as {
      agentActorId: string;
      prompt: string;
      error?: string;
      addressedAgentName?: string;
    },
);
const mockCreateSession = vi.fn(async () => ({
  id: "session-1",
  title: "New session",
}));

/**
 * Creates a Map that mimics discord.js Collection (which adds .filter/.map).
 */
function createCollection<V>(entries: [string, V][] = []) {
  const map = new Map(entries);
  (map as any).filter = function (fn: (v: V, k: string) => boolean) {
    const filtered: [string, V][] = [];
    for (const [k, v] of this) {
      if (fn(v, k)) filtered.push([k, v]);
    }
    return createCollection(filtered);
  };
  (map as any).map = function (fn: (v: V, k: string) => any) {
    const result: any[] = [];
    for (const [k, v] of this) {
      result.push(fn(v, k));
    }
    return result;
  };
  return map;
}

function createMockMessage(content = "hello", overrides = {}) {
  return {
    content,
    author: { id: "discord-user-123", username: "testuser", bot: false },
    channel: { id: "discord-channel-456", sendTyping: vi.fn() },
    channelId: "discord-channel-456",
    attachments: createCollection(),
    flags: { has: vi.fn().mockReturnValue(false) },
    reply: vi.fn(),
    ...overrides,
  };
}

function createActiveChannel(overrides = {}) {
  return {
    id: "ch-1",
    userId: "user-1",
    name: "Test Channel",
    platform: "discord" as const,
    capability: "bidirectional" as const,
    config: {},
    isActive: true,
    agentActorId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindChannel.mockResolvedValue(createActiveChannel());
  mockRouteChannelPrompt.mockImplementation(
    async (_uid: string, prompt: string) => ({
      agentActorId: "eclaire",
      prompt,
    }),
  );
  mockProcessPromptRequest.mockResolvedValue({ response: "bot reply" });

  setDeps({
    findChannel: mockFindChannel,
    findChannelById: vi.fn(),
    findActiveChannels: vi.fn(),
    encrypt: vi.fn(),
    decrypt: vi.fn(),
    processPromptRequest: mockProcessPromptRequest,
    recordHistory: mockRecordHistory,
    logger: mockLogger,
    routeChannelPrompt: mockRouteChannelPrompt,
    createSession: mockCreateSession,
  });
});

describe("handleIncomingMessage", () => {
  it("happy path non-streaming: message processed, history recorded", async () => {
    const message = createMockMessage("hello world");

    await handleIncomingMessage(message as any, "ch-1", "user-1");

    expect(mockFindChannel).toHaveBeenCalledWith("ch-1", "user-1");
    expect(mockRouteChannelPrompt).toHaveBeenCalled();
    expect(mockProcessPromptRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        prompt: "hello world",
      }),
    );
    expect(message.reply).toHaveBeenCalledWith("bot reply");
    expect(mockRecordHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "discord_message_processed",
        itemType: "discord_chat",
        userId: "user-1",
      }),
    );
  });

  it("empty message with no attachments returns early", async () => {
    const message = createMockMessage("");

    await handleIncomingMessage(message as any, "ch-1", "user-1");

    expect(mockFindChannel).not.toHaveBeenCalled();
    expect(mockProcessPromptRequest).not.toHaveBeenCalled();
    expect(message.reply).not.toHaveBeenCalled();
  });

  it("rate limited: reply sent, processing skipped", async () => {
    const messages = [];
    for (let i = 0; i < 25; i++) {
      messages.push(createMockMessage(`msg ${i}`));
    }

    // Send enough messages to hit the rate limit (default 20/min)
    for (const msg of messages) {
      await handleIncomingMessage(msg as any, "ch-rate", "user-1");
    }

    // The last few messages should have been rate limited
    const rateLimitedMsg = messages[messages.length - 1]!;
    expect(rateLimitedMsg.reply).toHaveBeenCalledWith(
      expect.stringContaining("too quickly"),
    );
  });

  it("channel not found: stopBot called", async () => {
    mockFindChannel.mockResolvedValue(null);
    const message = createMockMessage("hello");

    await handleIncomingMessage(message as any, "ch-1", "user-1");

    expect(stopBot).toHaveBeenCalledWith("ch-1");
    expect(mockProcessPromptRequest).not.toHaveBeenCalled();
  });

  it("channel inactive: returns silently", async () => {
    mockFindChannel.mockResolvedValue(createActiveChannel({ isActive: false }));
    const message = createMockMessage("hello");

    await handleIncomingMessage(message as any, "ch-1", "user-1");

    expect(mockProcessPromptRequest).not.toHaveBeenCalled();
    expect(message.reply).not.toHaveBeenCalled();
  });

  it("notification-only channel: rejection reply", async () => {
    mockFindChannel.mockResolvedValue(
      createActiveChannel({ capability: "notification" }),
    );
    const message = createMockMessage("hello");

    await handleIncomingMessage(message as any, "ch-1", "user-1");

    expect(message.reply).toHaveBeenCalledWith(
      expect.stringContaining("notifications only"),
    );
    expect(mockProcessPromptRequest).not.toHaveBeenCalled();
  });

  it("route error: error reply", async () => {
    mockRouteChannelPrompt.mockResolvedValue({
      agentActorId: "eclaire",
      prompt: "hello",
      error: "No agent found for that request",
    });
    const message = createMockMessage("hello");

    await handleIncomingMessage(message as any, "ch-1", "user-1");

    expect(message.reply).toHaveBeenCalledWith(
      "No agent found for that request",
    );
    expect(mockProcessPromptRequest).not.toHaveBeenCalled();
  });

  it("processing error: error message sent", async () => {
    mockProcessPromptRequest.mockRejectedValue(new Error("AI service down"));
    const message = createMockMessage("hello");

    await handleIncomingMessage(message as any, "ch-1", "user-1");

    expect(message.reply).toHaveBeenCalledWith(
      expect.stringContaining("error processing your message"),
    );
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it("attachment URLs filtered to Discord CDN only", async () => {
    const attachments = createCollection([
      [
        "1",
        {
          url: "https://cdn.discordapp.com/attachments/123/file.png",
          name: "file.png",
          contentType: "image/png",
          size: 1024,
        },
      ],
      [
        "2",
        {
          url: "https://evil.com/malware.exe",
          name: "malware.exe",
          contentType: "application/octet-stream",
          size: 9999,
        },
      ],
      [
        "3",
        {
          url: "https://media.discordapp.net/attachments/456/image.jpg",
          name: "image.jpg",
          contentType: "image/jpeg",
          size: 2048,
        },
      ],
    ]);

    const message = createMockMessage("check these files", { attachments });

    await handleIncomingMessage(message as any, "ch-1", "user-1");

    expect(mockProcessPromptRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("file.png"),
      }),
    );
    expect(mockProcessPromptRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("image.jpg"),
      }),
    );
    expect(mockProcessPromptRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.not.stringContaining("malware.exe"),
      }),
    );
  });

  it("with streaming: uses processPromptRequestStream", async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "text-chunk", content: "streamed" });
        controller.enqueue({ type: "done" });
        controller.close();
      },
    });
    mockProcessPromptRequestStream.mockResolvedValue(mockStream);
    vi.mocked(sendStreamingResponse).mockResolvedValue("streamed response");

    setDeps({
      findChannel: mockFindChannel,
      findChannelById: vi.fn(),
      findActiveChannels: vi.fn(),
      encrypt: vi.fn(),
      decrypt: vi.fn(),
      processPromptRequest: mockProcessPromptRequest,
      processPromptRequestStream: mockProcessPromptRequestStream,
      recordHistory: mockRecordHistory,
      logger: mockLogger,
      routeChannelPrompt: mockRouteChannelPrompt,
      createSession: mockCreateSession,
    });

    const message = createMockMessage("stream this");

    await handleIncomingMessage(message as any, "ch-1", "user-1");

    expect(mockProcessPromptRequestStream).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        prompt: "stream this",
      }),
    );
    expect(sendStreamingResponse).toHaveBeenCalled();
    // Non-streaming processPromptRequest should NOT be called
    expect(mockProcessPromptRequest).not.toHaveBeenCalled();
    expect(mockRecordHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "discord_message_processed",
        afterData: expect.objectContaining({
          response: "streamed response",
        }),
      }),
    );
  });
});
