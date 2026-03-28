/**
 * Factory for creating realistic Slack WebClient fakes for integration tests.
 */
import { vi } from "vitest";

export function createMockSlackClient() {
  return {
    chat: {
      postMessage: vi
        .fn()
        .mockResolvedValue({ ok: true, ts: "1234567890.000001" }),
      update: vi.fn().mockResolvedValue({ ok: true }),
    },
    reactions: {
      add: vi.fn().mockResolvedValue({ ok: true }),
      remove: vi.fn().mockResolvedValue({ ok: true }),
    },
  } as any;
}
