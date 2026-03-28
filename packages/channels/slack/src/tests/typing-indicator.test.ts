import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  addThinkingReaction,
  removeThinkingReaction,
  resetCircuitBreaker,
} from "../typing-indicator.js";

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

function makeClient(behavior: "success" | "error") {
  return {
    reactions: {
      add: vi.fn(async () => {
        if (behavior === "error") {
          throw new Error("no_permission");
        }
        return { ok: true };
      }),
      remove: vi.fn(async () => {
        if (behavior === "error") {
          throw new Error("no_reaction");
        }
        return { ok: true };
      }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetCircuitBreaker("C123");
});

describe("addThinkingReaction", () => {
  it("adds a thinking_face reaction", async () => {
    const client = makeClient("success");
    await addThinkingReaction(client as any, "C123", "1234.5678", mockLogger);
    expect(client.reactions.add).toHaveBeenCalledWith({
      channel: "C123",
      timestamp: "1234.5678",
      name: "thinking_face",
    });
  });

  it("does not throw on error", async () => {
    const client = makeClient("error");
    await expect(
      addThinkingReaction(client as any, "C123", "1234.5678", mockLogger),
    ).resolves.toBeUndefined();
  });

  it("suspends after 10 consecutive failures", async () => {
    const client = makeClient("error");

    for (let i = 0; i < 10; i++) {
      await addThinkingReaction(client as any, "C123", "1234.5678", mockLogger);
    }

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ consecutiveFailures: 10 }),
      expect.stringContaining("suspended"),
    );

    // After suspension, reactions.add should not be called
    client.reactions.add.mockClear();
    await addThinkingReaction(client as any, "C123", "1234.5678", mockLogger);
    expect(client.reactions.add).not.toHaveBeenCalled();
  });

  it("resets counter on success", async () => {
    const failClient = makeClient("error");
    const successClient = makeClient("success");

    // 5 failures
    for (let i = 0; i < 5; i++) {
      await addThinkingReaction(
        failClient as any,
        "C123",
        "1234.5678",
        mockLogger,
      );
    }

    // 1 success resets
    await addThinkingReaction(
      successClient as any,
      "C123",
      "1234.5678",
      mockLogger,
    );

    // 9 more failures should NOT trigger suspension
    for (let i = 0; i < 9; i++) {
      await addThinkingReaction(
        failClient as any,
        "C123",
        "1234.5678",
        mockLogger,
      );
    }

    failClient.reactions.add.mockClear();
    await addThinkingReaction(
      failClient as any,
      "C123",
      "1234.5678",
      mockLogger,
    );
    expect(failClient.reactions.add).toHaveBeenCalled();
  });
});

describe("removeThinkingReaction", () => {
  it("removes the thinking_face reaction", async () => {
    const client = makeClient("success");
    await removeThinkingReaction(
      client as any,
      "C123",
      "1234.5678",
      mockLogger,
    );
    expect(client.reactions.remove).toHaveBeenCalledWith({
      channel: "C123",
      timestamp: "1234.5678",
      name: "thinking_face",
    });
  });

  it("does not throw on error (best effort)", async () => {
    const client = makeClient("error");
    await expect(
      removeThinkingReaction(client as any, "C123", "1234.5678", mockLogger),
    ).resolves.toBeUndefined();
  });
});

describe("resetCircuitBreaker", () => {
  it("allows reactions again after reset", async () => {
    const client = makeClient("error");

    // Trigger suspension
    for (let i = 0; i < 10; i++) {
      await addThinkingReaction(client as any, "C123", "1234.5678", mockLogger);
    }

    client.reactions.add.mockClear();
    await addThinkingReaction(client as any, "C123", "1234.5678", mockLogger);
    expect(client.reactions.add).not.toHaveBeenCalled();

    // Reset
    resetCircuitBreaker("C123");

    const successClient = makeClient("success");
    await addThinkingReaction(
      successClient as any,
      "C123",
      "1234.5678",
      mockLogger,
    );
    expect(successClient.reactions.add).toHaveBeenCalled();
  });
});
