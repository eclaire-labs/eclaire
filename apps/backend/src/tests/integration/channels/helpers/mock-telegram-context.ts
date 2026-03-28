/**
 * Factory for creating realistic Telegraf BotContext fakes for integration tests.
 */
import { vi } from "vitest";

export interface MockTelegramContextOptions {
  text?: string;
  fromId?: number;
  fromUsername?: string;
  chatId?: number;
  sessionData?: Record<string, unknown>;
}

export function createMockTelegramContext(
  opts: MockTelegramContextOptions = {},
) {
  const session: Record<string, unknown> = {
    enableThinking: false,
    sessionId: undefined,
    agentActorId: undefined,
    ...opts.sessionData,
  };

  return {
    message: { text: opts.text ?? "hello" },
    from: {
      id: opts.fromId ?? 123456,
      username: opts.fromUsername ?? "testuser",
    },
    chat: { id: opts.chatId ?? 789 },
    reply: vi.fn(),
    replyWithVoice: vi.fn(),
    telegram: {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
      editMessageText: vi.fn().mockResolvedValue(true),
      sendChatAction: vi.fn(),
      getFileLink: vi
        .fn()
        .mockResolvedValue({ href: "https://example.com/voice.ogg" }),
    },
    session,
  } as any;
}

export function createMockTelegramVoiceContext(
  opts: MockTelegramContextOptions & {
    fileId?: string;
    duration?: number;
  } = {},
) {
  const base = createMockTelegramContext(opts);
  base.message = {
    voice: {
      file_id: opts.fileId ?? "voice-file-123",
      duration: opts.duration ?? 5,
    },
  };
  return base;
}
