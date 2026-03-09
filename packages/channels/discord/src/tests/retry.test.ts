import { DiscordAPIError } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { getRetryAfterMs, isRecoverableError, withRetry } from "../retry.js";

function make429Error(retryAfter?: number): DiscordAPIError {
  const rawData = {
    message: "You are being rate limited.",
    retry_after: retryAfter ?? 0,
    code: 0,
  };
  const err = new DiscordAPIError(rawData, 429, 429, "GET", "/api/test", {
    body: {},
    files: [],
  });
  if (typeof retryAfter === "number") {
    (err as DiscordAPIError & { retryAfter: number }).retryAfter = retryAfter;
  }
  return err;
}

describe("isRecoverableError", () => {
  it("returns false for non-Error values", () => {
    expect(isRecoverableError("string error")).toBe(false);
    expect(isRecoverableError(null)).toBe(false);
    expect(isRecoverableError(42)).toBe(false);
  });

  it("returns true for network error codes", () => {
    for (const code of [
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "ENETUNREACH",
      "ENOTFOUND",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_SOCKET",
    ]) {
      const err = new Error("fail");
      (err as NodeJS.ErrnoException).code = code;
      expect(isRecoverableError(err)).toBe(true);
    }
  });

  it("returns true for recoverable error names", () => {
    for (const name of [
      "AbortError",
      "TimeoutError",
      "ConnectTimeoutError",
      "BodyTimeoutError",
    ]) {
      const err = new Error("fail");
      err.name = name;
      expect(isRecoverableError(err)).toBe(true);
    }
  });

  it("returns true for message patterns", () => {
    expect(isRecoverableError(new Error("Connection timeout occurred"))).toBe(
      true,
    );
    expect(isRecoverableError(new Error("network error"))).toBe(true);
    expect(isRecoverableError(new Error("socket hang up"))).toBe(true);
    expect(isRecoverableError(new Error("getaddrinfo ENOTFOUND"))).toBe(true);
    expect(isRecoverableError(new Error("network request failed"))).toBe(true);
  });

  it("returns true for Discord 429 rate limit errors", () => {
    expect(isRecoverableError(make429Error(5))).toBe(true);
  });

  it("returns false for non-recoverable errors", () => {
    expect(isRecoverableError(new Error("Invalid bot token"))).toBe(false);
    expect(isRecoverableError(new Error("Forbidden"))).toBe(false);
  });
});

describe("getRetryAfterMs", () => {
  it("returns retryAfter * 1000 for 429 with retryAfter set", () => {
    expect(getRetryAfterMs(make429Error(2))).toBe(2000);
  });

  it("returns 5000 fallback for 429 without retryAfter", () => {
    const err = new DiscordAPIError(
      { message: "rate limited", code: 0 },
      429,
      429,
      "GET",
      "/api/test",
      { body: {}, files: [] },
    );
    expect(getRetryAfterMs(err)).toBe(5000);
  });

  it("returns null for non-429 DiscordAPIError", () => {
    const err = new DiscordAPIError(
      { message: "forbidden", code: 50013 },
      50013,
      403,
      "GET",
      "/api/test",
      { body: {}, files: [] },
    );
    expect(getRetryAfterMs(err)).toBeNull();
  });

  it("returns null for non-DiscordAPIError", () => {
    expect(getRetryAfterMs(new Error("timeout"))).toBeNull();
    expect(getRetryAfterMs(null)).toBeNull();
  });
});

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on recoverable errors and succeeds", async () => {
    const err = new Error("fail");
    (err as NodeJS.ErrnoException).code = "ECONNRESET";

    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce("ok");

    const result = await withRetry(fn, { baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after maxAttempts exhausted", async () => {
    const err = new Error("fail");
    (err as NodeJS.ErrnoException).code = "ETIMEDOUT";

    const fn = vi.fn().mockRejectedValue(err);

    await expect(
      withRetry(fn, { maxAttempts: 2, baseDelayMs: 1 }),
    ).rejects.toThrow("fail");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws immediately on non-recoverable errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Forbidden"));

    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow(
      "Forbidden",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("calls onRetry callback", async () => {
    const err = new Error("fail");
    (err as NodeJS.ErrnoException).code = "ECONNRESET";

    const onRetry = vi.fn();
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce("ok");

    await withRetry(fn, { baseDelayMs: 1, onRetry });
    expect(onRetry).toHaveBeenCalledWith(err, 1);
  });

  it("respects retry_after from Discord 429 responses", async () => {
    const err = make429Error(0.01); // 10ms

    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce("ok");

    const start = Date.now();
    await withRetry(fn, { baseDelayMs: 5000 });
    const elapsed = Date.now() - start;

    // Should use retryAfter (10ms) not baseDelayMs (5000ms)
    expect(elapsed).toBeLessThan(1000);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
