import { describe, expect, it, vi } from "vitest";
import { isRecoverableError, withRetry } from "../retry.js";

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
    ]) {
      const err = new Error("fail");
      (err as NodeJS.ErrnoException).code = code;
      expect(isRecoverableError(err)).toBe(true);
    }
  });

  it("returns true for recoverable error names", () => {
    for (const name of ["AbortError", "TimeoutError"]) {
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
  });

  it("returns true for 429 Telegram errors", () => {
    const err = Object.assign(new Error("Too Many Requests"), {
      response: { error_code: 429, parameters: { retry_after: 5 } },
    });
    expect(isRecoverableError(err)).toBe(true);
  });

  it("returns false for non-recoverable errors", () => {
    expect(isRecoverableError(new Error("Invalid bot token"))).toBe(false);
    expect(isRecoverableError(new Error("Forbidden"))).toBe(false);
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

  it("respects retry_after from 429 responses", async () => {
    const err = Object.assign(new Error("Too Many Requests"), {
      response: {
        error_code: 429,
        parameters: { retry_after: 0.01 },
      },
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
