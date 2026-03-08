import { afterEach, describe, expect, it, vi } from "vitest";
import { resetCircuitBreaker, safeSendTyping } from "../typing-indicator.js";

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

function makeChannel(id = "test-channel-123") {
  return {
    id,
    sendTyping: vi.fn(async () => {}),
  };
}

afterEach(() => {
  resetCircuitBreaker("test-channel-123");
  vi.clearAllMocks();
});

describe("safeSendTyping", () => {
  it("calls channel.sendTyping() on success", async () => {
    const channel = makeChannel();
    await safeSendTyping(channel as any, mockLogger);
    expect(channel.sendTyping).toHaveBeenCalledTimes(1);
  });

  it("does not throw on error", async () => {
    const channel = makeChannel();
    channel.sendTyping.mockRejectedValueOnce(new Error("Missing permissions"));
    await expect(
      safeSendTyping(channel as any, mockLogger),
    ).resolves.toBeUndefined();
  });

  it("suspends after 10 consecutive failures", async () => {
    const channel = makeChannel();
    channel.sendTyping.mockRejectedValue(new Error("fail"));

    for (let i = 0; i < 10; i++) {
      await safeSendTyping(channel as any, mockLogger);
    }

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: "test-channel-123" }),
      expect.stringContaining("suspended"),
    );

    // 11th call should be a no-op
    channel.sendTyping.mockClear();
    await safeSendTyping(channel as any, mockLogger);
    expect(channel.sendTyping).not.toHaveBeenCalled();
  });

  it("resets counter on success", async () => {
    const channel = makeChannel();
    channel.sendTyping.mockRejectedValue(new Error("fail"));

    // 5 failures
    for (let i = 0; i < 5; i++) {
      await safeSendTyping(channel as any, mockLogger);
    }

    // 1 success resets
    channel.sendTyping.mockResolvedValueOnce(undefined);
    await safeSendTyping(channel as any, mockLogger);

    // 9 more failures — should NOT be suspended (counter was reset)
    channel.sendTyping.mockRejectedValue(new Error("fail"));
    for (let i = 0; i < 9; i++) {
      await safeSendTyping(channel as any, mockLogger);
    }

    channel.sendTyping.mockClear();
    await safeSendTyping(channel as any, mockLogger);
    // Still not suspended after 9 (need 10 consecutive)
    expect(channel.sendTyping).toHaveBeenCalled();
  });
});

describe("resetCircuitBreaker", () => {
  it("un-suspends a previously suspended channel", async () => {
    const channel = makeChannel();
    channel.sendTyping.mockRejectedValue(new Error("fail"));

    // Suspend it
    for (let i = 0; i < 10; i++) {
      await safeSendTyping(channel as any, mockLogger);
    }

    // Reset
    resetCircuitBreaker("test-channel-123");

    // Should work again
    channel.sendTyping.mockResolvedValue(undefined);
    channel.sendTyping.mockClear();
    await safeSendTyping(channel as any, mockLogger);
    expect(channel.sendTyping).toHaveBeenCalledTimes(1);
  });
});
