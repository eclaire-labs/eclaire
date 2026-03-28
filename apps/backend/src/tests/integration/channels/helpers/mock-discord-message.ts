/**
 * Factory for creating realistic discord.js Message fakes for integration tests.
 */
import { vi } from "vitest";

/**
 * Creates a Map that mimics discord.js Collection.
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

export interface MockDiscordMessageOptions {
  content?: string;
  authorId?: string;
  authorUsername?: string;
  channelId?: string;
  isVoiceMessage?: boolean;
  attachments?: Array<{
    url: string;
    name: string;
    contentType: string | null;
    size: number;
  }>;
}

export function createMockDiscordMessage(opts: MockDiscordMessageOptions = {}) {
  const content = opts.content ?? "hello";
  const attachmentEntries = (opts.attachments ?? []).map(
    (a, i) => [`att-${i}`, a] as [string, typeof a],
  );

  return {
    content,
    author: {
      id: opts.authorId ?? "discord-user-123",
      username: opts.authorUsername ?? "testuser",
      bot: false,
    },
    channel: {
      id: opts.channelId ?? "discord-ch-456",
      send: vi.fn(),
      sendTyping: vi.fn(),
    },
    channelId: opts.channelId ?? "discord-ch-456",
    attachments: createCollection(attachmentEntries),
    flags: {
      has: vi.fn().mockReturnValue(opts.isVoiceMessage ?? false),
    },
    reply: vi.fn(),
  } as any;
}
