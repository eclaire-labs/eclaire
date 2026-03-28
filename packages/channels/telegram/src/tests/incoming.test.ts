import { describe, expect, it, beforeEach, vi } from "vitest";
import { setDeps } from "../deps.js";

vi.mock("../bot-manager.js", () => ({ stopBot: vi.fn() }));
vi.mock("../typing-indicator.js", () => ({ safeSendChatAction: vi.fn() }));
vi.mock("../stream-sender.js", () => ({ sendStreamingResponse: vi.fn() }));
vi.mock("../message-utils.js", () => ({
  splitMessage: vi.fn((text: string) => [text]),
}));
vi.mock("@eclaire/channels-core", () => {
  const allow = vi.fn(() => true);
  return {
    ChannelRateLimiter: class {
      allow = allow;
    },
    DEFAULT_CHANNEL_AGENT_ACTOR_ID: "eclaire",
    __mockAllow: allow,
  };
});

import {
  handleIncomingMessage,
  handleIncomingVoiceMessage,
} from "../incoming.js";
import { stopBot } from "../bot-manager.js";
import { safeSendChatAction } from "../typing-indicator.js";
import { sendStreamingResponse } from "../stream-sender.js";
import { splitMessage } from "../message-utils.js";

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const mockFindChannel = vi.fn();
const mockProcessPromptRequest = vi.fn();
const mockRecordHistory = vi.fn();
const mockRouteChannelPrompt = vi.fn();
const mockCreateSession = vi.fn();
const mockProcessPromptRequestStream = vi.fn();
const mockProcessAudioMessage = vi.fn();

function createMockContext(text = "hello", overrides = {}) {
  return {
    message: { text },
    from: { id: 123456, username: "testuser" },
    chat: { id: 789 },
    reply: vi.fn(),
    replyWithVoice: vi.fn(),
    telegram: {
      sendMessage: vi.fn(),
      editMessageText: vi.fn(),
      getFileLink: vi.fn(),
    },
    session: { enableThinking: false } as Record<string, unknown>,
    ...overrides,
  };
}

function activeChannel(overrides = {}) {
  return {
    id: "ch-1",
    isActive: true,
    capability: "bidirectional",
    agentActorId: "eclaire",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  (splitMessage as ReturnType<typeof vi.fn>).mockImplementation(
    (text: string) => [text],
  );
  mockFindChannel.mockResolvedValue(activeChannel());
  mockProcessPromptRequest.mockResolvedValue({ response: "AI reply" });
  mockRecordHistory.mockResolvedValue(undefined);
  mockRouteChannelPrompt.mockResolvedValue({
    agentActorId: "eclaire",
    prompt: "hello",
  });
  mockCreateSession.mockResolvedValue({ id: "sess-1", title: null });
  mockProcessPromptRequestStream.mockResolvedValue(new ReadableStream());
  (sendStreamingResponse as ReturnType<typeof vi.fn>).mockResolvedValue(
    "AI reply",
  );

  setDeps({
    findChannel: mockFindChannel,
    findChannelById: vi.fn(),
    findActiveChannels: vi.fn(),
    encrypt: vi.fn(),
    decrypt: vi.fn(),
    processPromptRequest: mockProcessPromptRequest,
    processPromptRequestStream: mockProcessPromptRequestStream,
    routeChannelPrompt: mockRouteChannelPrompt,
    recordHistory: mockRecordHistory,
    logger: mockLogger,
    createSession: mockCreateSession,
    processAudioMessage: mockProcessAudioMessage,
  });
});

describe("handleIncomingMessage", () => {
  it("happy path non-streaming: message processed, history recorded", async () => {
    // No streaming dep → falls back to non-streaming
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

    const ctx = createMockContext("hello");
    await handleIncomingMessage(ctx as any, "ch-1", "user-1");

    expect(mockFindChannel).toHaveBeenCalledWith("ch-1", "user-1");
    expect(mockProcessPromptRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        prompt: "hello",
      }),
    );
    expect(ctx.reply).toHaveBeenCalledWith("AI reply");
    expect(mockRecordHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "telegram_message_processed",
        userId: "user-1",
      }),
    );
  });

  it("returns early when message has no text", async () => {
    const ctx = createMockContext("hello", { message: {} });
    await handleIncomingMessage(ctx as any, "ch-1", "user-1");

    expect(mockFindChannel).not.toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("calls stopBot when channel not found", async () => {
    mockFindChannel.mockResolvedValue(null);
    const ctx = createMockContext("hello");
    await handleIncomingMessage(ctx as any, "ch-1", "user-1");

    expect(stopBot).toHaveBeenCalledWith("ch-1");
    expect(mockProcessPromptRequest).not.toHaveBeenCalled();
  });

  it("returns silently when channel is inactive", async () => {
    mockFindChannel.mockResolvedValue(activeChannel({ isActive: false }));
    const ctx = createMockContext("hello");
    await handleIncomingMessage(ctx as any, "ch-1", "user-1");

    expect(ctx.reply).not.toHaveBeenCalled();
    expect(mockProcessPromptRequest).not.toHaveBeenCalled();
  });

  it("replies with rejection for notification-only channel", async () => {
    mockFindChannel.mockResolvedValue(
      activeChannel({ capability: "notification" }),
    );
    const ctx = createMockContext("hello");
    await handleIncomingMessage(ctx as any, "ch-1", "user-1");

    expect(ctx.reply).toHaveBeenCalledWith(
      "This channel is configured for notifications only. I cannot respond to messages.",
    );
    expect(mockProcessPromptRequest).not.toHaveBeenCalled();
  });

  it("replies with error when routing fails", async () => {
    mockRouteChannelPrompt.mockResolvedValue({
      agentActorId: "eclaire",
      prompt: "hello",
      error: "No matching agent found",
    });
    const ctx = createMockContext("hello");
    await handleIncomingMessage(ctx as any, "ch-1", "user-1");

    expect(ctx.reply).toHaveBeenCalledWith("No matching agent found");
    expect(mockProcessPromptRequest).not.toHaveBeenCalled();
  });

  it("continues processing when session creation fails", async () => {
    mockCreateSession.mockRejectedValue(new Error("DB down"));

    // No streaming dep → non-streaming path
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

    const ctx = createMockContext("hello");
    await handleIncomingMessage(ctx as any, "ch-1", "user-1");

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: "DB down" }),
      expect.stringContaining("Failed to create session"),
    );
    // Should still process the message
    expect(mockProcessPromptRequest).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith("AI reply");
  });

  it("sends error message to user on processing error", async () => {
    // No streaming dep → non-streaming path
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

    mockProcessPromptRequest.mockRejectedValue(new Error("AI exploded"));
    const ctx = createMockContext("hello");
    await handleIncomingMessage(ctx as any, "ch-1", "user-1");

    expect(ctx.reply).toHaveBeenCalledWith(
      "I encountered an error processing your message. Please try again later.",
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: "AI exploded" }),
      expect.any(String),
    );
  });

  it("uses processPromptRequestStream when available", async () => {
    const ctx = createMockContext("hello");
    await handleIncomingMessage(ctx as any, "ch-1", "user-1");

    expect(mockProcessPromptRequestStream).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        prompt: "hello",
      }),
    );
    expect(sendStreamingResponse).toHaveBeenCalledWith(
      ctx.telegram,
      789,
      expect.anything(),
      expect.objectContaining({ logger: mockLogger }),
    );
    expect(mockRecordHistory).toHaveBeenCalled();
  });

  it("splits long response into multiple messages", async () => {
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

    const longResponse = "Part one of the response";
    mockProcessPromptRequest.mockResolvedValue({
      response: longResponse,
    });
    (splitMessage as ReturnType<typeof vi.fn>).mockReturnValue([
      "Part one",
      "of the response",
    ]);

    const ctx = createMockContext("hello");
    await handleIncomingMessage(ctx as any, "ch-1", "user-1");

    expect(splitMessage).toHaveBeenCalledWith(longResponse);
    expect(ctx.reply).toHaveBeenCalledTimes(2);
    expect(ctx.reply).toHaveBeenNthCalledWith(1, "Part one");
    expect(ctx.reply).toHaveBeenNthCalledWith(2, "of the response");
  });
});

describe("handleIncomingVoiceMessage", () => {
  it("returns early when processAudioMessage dep is not available", async () => {
    setDeps({
      findChannel: mockFindChannel,
      findChannelById: vi.fn(),
      findActiveChannels: vi.fn(),
      encrypt: vi.fn(),
      decrypt: vi.fn(),
      processPromptRequest: mockProcessPromptRequest,
      recordHistory: mockRecordHistory,
      logger: mockLogger,
    });

    const ctx = createMockContext("hello", {
      message: { voice: { file_id: "file-1", duration: 5 } },
    });
    await handleIncomingVoiceMessage(ctx as any, "ch-1", "user-1");

    expect(mockFindChannel).not.toHaveBeenCalled();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: "ch-1" }),
      expect.stringContaining("not available"),
    );
  });

  it("downloads audio, processes, and replies with text and voice", async () => {
    const audioBuffer = Buffer.from("fake-audio");
    const responseAudio = Buffer.from("response-audio");

    // Mock fetch for downloading voice file
    const mockFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(audioBuffer, { status: 200 }));

    mockProcessAudioMessage.mockResolvedValue({
      response: "Transcribed reply",
      audioResponse: responseAudio,
    });

    const ctx = createMockContext("hello", {
      message: { voice: { file_id: "file-1", duration: 5 } },
    });
    ctx.telegram.getFileLink = vi.fn().mockResolvedValue({
      href: "https://api.telegram.org/file/bot123/voice.ogg",
    });

    await handleIncomingVoiceMessage(ctx as any, "ch-1", "user-1");

    expect(ctx.telegram.getFileLink).toHaveBeenCalledWith("file-1");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.telegram.org/file/bot123/voice.ogg",
    );
    expect(mockProcessAudioMessage).toHaveBeenCalledWith(
      "user-1",
      expect.any(Buffer),
      expect.objectContaining({
        channelId: "ch-1",
        format: "ogg",
        ttsEnabled: true,
      }),
    );
    expect(ctx.reply).toHaveBeenCalledWith("Transcribed reply");
    expect(ctx.replyWithVoice).toHaveBeenCalled();
    expect(mockRecordHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "telegram_voice_message_processed",
      }),
    );

    mockFetch.mockRestore();
  });

  it("calls stopBot when channel not found for voice message", async () => {
    mockFindChannel.mockResolvedValue(null);

    const ctx = createMockContext("hello", {
      message: { voice: { file_id: "file-1", duration: 5 } },
    });
    await handleIncomingVoiceMessage(ctx as any, "ch-1", "user-1");

    expect(stopBot).toHaveBeenCalledWith("ch-1");
    expect(mockProcessAudioMessage).not.toHaveBeenCalled();
  });
});
