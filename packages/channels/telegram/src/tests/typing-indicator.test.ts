import { describe, expect, it, vi, beforeEach } from "vitest";
import { safeSendChatAction, resetCircuitBreaker } from "../typing-indicator.js";

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

function makeTelegram(behavior: "success" | "401" | "other-error") {
  const token = "test-token-123";
  return {
    token,
    sendChatAction: vi.fn(async () => {
      if (behavior === "401") {
        throw Object.assign(new Error("Unauthorized"), {
          response: { error_code: 401 },
        });
      }
      if (behavior === "other-error") {
        throw Object.assign(new Error("Bad Request"), {
          response: { error_code: 400 },
        });
      }
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetCircuitBreaker("test-token-123");
});

describe("safeSendChatAction", () => {
  it("calls sendChatAction on success", async () => {
    const tg = makeTelegram("success");
await safeSendChatAction(tg as any, 123, "typing", mockLogger);
    expect(tg.sendChatAction).toHaveBeenCalledWith(123, "typing");
  });

  it("does not throw on error", async () => {
    const tg = makeTelegram("other-error");
    await expect(
    safeSendChatAction(tg as any, 123, "typing", mockLogger),
    ).resolves.toBeUndefined();
  });

  it("suspends after 10 consecutive 401 errors", async () => {
    const tg = makeTelegram("401");

    for (let i = 0; i < 10; i++) {
    await safeSendChatAction(tg as any, 123, "typing", mockLogger);
    }

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ consecutiveFailures: 10 }),
      expect.stringContaining("suspended"),
    );

    // After suspension, sendChatAction should not be called
    tg.sendChatAction.mockClear();
await safeSendChatAction(tg as any, 123, "typing", mockLogger);
    expect(tg.sendChatAction).not.toHaveBeenCalled();
  });

  it("resets counter on success", async () => {
    const failTg = makeTelegram("401");
    const successTg = makeTelegram("success");
    // Same token for both
    successTg.token = "test-token-123";

    // 5 failures
    for (let i = 0; i < 5; i++) {
    await safeSendChatAction(failTg as any, 123, "typing", mockLogger);
    }

    // 1 success resets
await safeSendChatAction(successTg as any, 123, "typing", mockLogger);

    // 9 more failures should NOT trigger suspension (counter was reset)
    for (let i = 0; i < 9; i++) {
    await safeSendChatAction(failTg as any, 123, "typing", mockLogger);
    }

    // Should not have been suspended (only 9 consecutive after reset)
    failTg.sendChatAction.mockClear();
await safeSendChatAction(failTg as any, 123, "typing", mockLogger);
    expect(failTg.sendChatAction).toHaveBeenCalled();
  });

  it("does not suspend for non-401 errors", async () => {
    const tg = makeTelegram("other-error");

    for (let i = 0; i < 20; i++) {
    await safeSendChatAction(tg as any, 123, "typing", mockLogger);
    }

    // Should still be calling sendChatAction (not suspended)
    tg.sendChatAction.mockClear();
await safeSendChatAction(tg as any, 123, "typing", mockLogger);
    expect(tg.sendChatAction).toHaveBeenCalled();
  });
});
