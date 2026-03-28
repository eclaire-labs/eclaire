import { describe, expect, it, vi } from "vitest";
import { isRecoverableError, getRetryAfterMs, withRetry } from "../retry.js";

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
    expect(isRecoverableError(new Error("rate_limited"))).toBe(true);
  });

  it("returns true for Slack rate limit errors", () => {
    const err = Object.assign(new Error("Rate limited"), {
      code: "slack_webapi_rate_limited_error",
      data: { retry_after: 5 },
    });
    expect(isRecoverableError(err)).toBe(true);
  });

  it("returns false for non-recoverable auth errors", () => {
    expect(isRecoverableError(new Error("invalid_auth"))).toBe(false);
    expect(isRecoverableError(new Error("token_revoked"))).toBe(false);
    expect(isRecoverableError(new Error("account_inactive"))).toBe(false);
    expect(isRecoverableError(new Error("missing_scope"))).toBe(false);
    expect(isRecoverableError(new Error("not_authed"))).toBe(false);
  });

  it("returns false for auth errors via code property", () => {
    const err = Object.assign(new Error("fail"), { code: "invalid_auth" });
    expect(isRecoverableError(err)).toBe(false);
  });

  it("returns false for generic errors", () => {
    expect(isRecoverableError(new Error("something else"))).toBe(false);
  });
});

describe("getRetryAfterMs", () => {
  it("returns null for non-Error values", () => {
    expect(getRetryAfterMs("string")).toBeNull();
    expect(getRetryAfterMs(null)).toBeNull();
  });

  it("extracts retry_after from Slack rate limit error", () => {
    const err = Object.assign(new Error("Rate limited"), {
      code: "slack_webapi_rate_limited_error",
      data: { retry_after: 3 },
    });
    expect(getRetryAfterMs(err)).toBe(3000);
  });

  it("returns default 5000ms when retry_after not present in rate limit error", () => {
    const err = Object.assign(new Error("Rate limited"), {
      code: "slack_webapi_rate_limited_error",
    });
    expect(getRetryAfterMs(err)).toBe(5000);
  });

  it("extracts from rate_limited code", () => {
    const err = Object.assign(new Error("fail"), {
      code: "rate_limited",
      data: { retry_after: 2 },
    });
    expect(getRetryAfterMs(err)).toBe(2000);
  });

  it("returns 5000ms for rate_limited in message", () => {
    expect(getRetryAfterMs(new Error("rate_limited"))).toBe(5000);
    expect(getRetryAfterMs(new Error("Ratelimited"))).toBe(5000);
  });

  it("returns null for non-rate-limit errors", () => {
    expect(getRetryAfterMs(new Error("something else"))).toBeNull();
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
    const fn = vi.fn().mockRejectedValue(new Error("invalid_auth"));

    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow(
      "invalid_auth",
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

  it("uses retry_after delay from Slack rate limit", async () => {
    const err = Object.assign(new Error("Rate limited"), {
      code: "slack_webapi_rate_limited_error",
      data: { retry_after: 0.01 },
    });

    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce("ok");

    const start = Date.now();
    await withRetry(fn, { baseDelayMs: 5000 });
    const elapsed = Date.now() - start;

    // Should use retry_after (10ms) not baseDelayMs (5000ms)
    expect(elapsed).toBeLessThan(1000);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
