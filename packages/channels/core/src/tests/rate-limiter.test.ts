import { describe, expect, it, vi } from "vitest";
import { ChannelRateLimiter } from "../rate-limiter.js";

describe("ChannelRateLimiter", () => {
  it("allows messages under the limit", () => {
    const limiter = new ChannelRateLimiter({ maxMessages: 3, windowMs: 1000 });

    expect(limiter.allow("ch-1")).toBe(true);
    expect(limiter.allow("ch-1")).toBe(true);
    expect(limiter.allow("ch-1")).toBe(true);
  });

  it("blocks messages over the limit", () => {
    const limiter = new ChannelRateLimiter({ maxMessages: 2, windowMs: 1000 });

    expect(limiter.allow("ch-1")).toBe(true);
    expect(limiter.allow("ch-1")).toBe(true);
    expect(limiter.allow("ch-1")).toBe(false);
  });

  it("tracks channels independently", () => {
    const limiter = new ChannelRateLimiter({ maxMessages: 1, windowMs: 1000 });

    expect(limiter.allow("ch-1")).toBe(true);
    expect(limiter.allow("ch-2")).toBe(true);
    expect(limiter.allow("ch-1")).toBe(false);
    expect(limiter.allow("ch-2")).toBe(false);
  });

  it("allows messages after window expires", () => {
    vi.useFakeTimers();
    const limiter = new ChannelRateLimiter({ maxMessages: 1, windowMs: 1000 });

    expect(limiter.allow("ch-1")).toBe(true);
    expect(limiter.allow("ch-1")).toBe(false);

    vi.advanceTimersByTime(1001);

    expect(limiter.allow("ch-1")).toBe(true);
    vi.useRealTimers();
  });

  it("uses default values (20 messages, 60s window)", () => {
    const limiter = new ChannelRateLimiter();

    for (let i = 0; i < 20; i++) {
      expect(limiter.allow("ch-1")).toBe(true);
    }
    expect(limiter.allow("ch-1")).toBe(false);
  });

  it("reset() clears state for a specific channel", () => {
    const limiter = new ChannelRateLimiter({ maxMessages: 1, windowMs: 1000 });

    expect(limiter.allow("ch-1")).toBe(true);
    expect(limiter.allow("ch-1")).toBe(false);

    limiter.reset("ch-1");

    expect(limiter.allow("ch-1")).toBe(true);
  });

  it("clear() clears all state", () => {
    const limiter = new ChannelRateLimiter({ maxMessages: 1, windowMs: 1000 });

    limiter.allow("ch-1");
    limiter.allow("ch-2");

    limiter.clear();

    expect(limiter.allow("ch-1")).toBe(true);
    expect(limiter.allow("ch-2")).toBe(true);
  });
});
