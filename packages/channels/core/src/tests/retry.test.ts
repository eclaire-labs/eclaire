import { describe, expect, it, vi } from "vitest";

import { createRetry, isNetworkError } from "../retry.js";

function networkError(code: string): Error {
  const err = new Error("connection failed") as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

describe("isNetworkError", () => {
  it("returns false for non-Error values", () => {
    expect(isNetworkError("nope")).toBe(false);
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });

  it("classifies Node.js network error codes", () => {
    for (const code of ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT"]) {
      expect(isNetworkError(networkError(code))).toBe(true);
    }
  });

  it("classifies recoverable error names", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    expect(isNetworkError(err)).toBe(true);
  });

  it("classifies recoverable message patterns", () => {
    expect(isNetworkError(new Error("socket hang up"))).toBe(true);
    expect(isNetworkError(new Error("Request Timeout"))).toBe(true);
  });

  it("rejects unrelated errors", () => {
    expect(isNetworkError(new Error("validation failed"))).toBe(false);
  });
});

describe("createRetry", () => {
  it("returns the result on first success", async () => {
    const { withRetry } = createRetry();
    const fn = vi.fn(async () => "ok");
    await expect(withRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries recoverable errors with exponential backoff", async () => {
    vi.useFakeTimers();
    try {
      const { withRetry } = createRetry();
      const fn = vi
        .fn()
        .mockRejectedValueOnce(networkError("ECONNRESET"))
        .mockRejectedValueOnce(networkError("ECONNRESET"))
        .mockResolvedValue("ok");

      const promise = withRetry(fn, { baseDelayMs: 100 });
      await vi.advanceTimersByTimeAsync(1000);
      await expect(promise).resolves.toBe("ok");
      expect(fn).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws immediately for non-recoverable errors", async () => {
    const { withRetry } = createRetry();
    const fn = vi.fn().mockRejectedValue(new Error("validation failed"));
    await expect(withRetry(fn)).rejects.toThrow("validation failed");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxAttempts", async () => {
    vi.useFakeTimers();
    try {
      const { withRetry } = createRetry();
      const fn = vi.fn().mockRejectedValue(networkError("ETIMEDOUT"));
      const promise = withRetry(fn, { maxAttempts: 2, baseDelayMs: 10 });
      promise.catch(() => {}); // avoid unhandled rejection while timers advance
      await vi.advanceTimersByTimeAsync(1000);
      await expect(promise).rejects.toMatchObject({ code: "ETIMEDOUT" });
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("invokes onRetry with the error and attempt number", async () => {
    vi.useFakeTimers();
    try {
      const { withRetry } = createRetry();
      const onRetry = vi.fn();
      const fn = vi
        .fn()
        .mockRejectedValueOnce(networkError("ECONNRESET"))
        .mockResolvedValue("ok");
      const promise = withRetry(fn, { baseDelayMs: 10, onRetry });
      await vi.advanceTimersByTimeAsync(100);
      await promise;
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("isNonRecoverable veto wins over isRecoverable", async () => {
    const { withRetry, isRecoverableError } = createRetry({
      isRecoverable: () => true,
      isNonRecoverable: (err) =>
        err instanceof Error && err.message.includes("auth"),
    });
    expect(isRecoverableError(new Error("invalid_auth"))).toBe(false);
    const fn = vi.fn().mockRejectedValue(new Error("invalid_auth"));
    await expect(withRetry(fn)).rejects.toThrow("invalid_auth");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("respects a server-provided retry_after exactly (no jitter)", async () => {
    vi.useFakeTimers();
    try {
      const { withRetry } = createRetry({
        isRecoverable: () => true,
        getRetryAfterMs: () => 5000,
      });
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("rate limited"))
        .mockResolvedValue("ok");
      const promise = withRetry(fn, { baseDelayMs: 10 });
      await vi.advanceTimersByTimeAsync(4999);
      expect(fn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(promise).resolves.toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
