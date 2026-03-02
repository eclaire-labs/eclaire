/**
 * Unit tests for core/utils.ts utility functions
 *
 * These are pure functions with no external dependencies,
 * testing backoff calculations, ID generation, time utilities,
 * async helpers, and cron validation.
 */

import { describe, expect, it } from "vitest";
import {
  addJitter,
  calculateBackoff,
  calculateBackoffWithJitter,
  cancellableSleep,
  createDeferred,
  createWorkerId,
  DEFAULT_BACKOFF,
  generateJobId,
  generateScheduleId,
  getFutureDate,
  getMillisecondsUntil,
  isInFuture,
  isInPast,
  isValidCronExpression,
  retry,
  sleep,
  timeout,
  withTimeout,
} from "../../core/utils.js";

// ============================================================================
// calculateBackoff
// ============================================================================

describe("calculateBackoff", () => {
  describe("exponential strategy", () => {
    const strategy = { type: "exponential" as const, delay: 1000 };

    it("returns base delay for attempt 1", () => {
      expect(calculateBackoff(1, strategy)).toBe(1000);
    });

    it("doubles each attempt", () => {
      expect(calculateBackoff(2, strategy)).toBe(2000);
      expect(calculateBackoff(3, strategy)).toBe(4000);
      expect(calculateBackoff(4, strategy)).toBe(8000);
    });

    it("caps at maxDelay", () => {
      const capped = { type: "exponential" as const, delay: 1000, maxDelay: 5000 };
      expect(calculateBackoff(10, capped)).toBe(5000);
    });
  });

  describe("linear strategy", () => {
    const strategy = { type: "linear" as const, delay: 1000 };

    it("returns base delay for attempt 1", () => {
      expect(calculateBackoff(1, strategy)).toBe(1000);
    });

    it("increases linearly", () => {
      expect(calculateBackoff(2, strategy)).toBe(2000);
      expect(calculateBackoff(3, strategy)).toBe(3000);
      expect(calculateBackoff(5, strategy)).toBe(5000);
    });

    it("caps at maxDelay", () => {
      const capped = { type: "linear" as const, delay: 1000, maxDelay: 3000 };
      expect(calculateBackoff(10, capped)).toBe(3000);
    });
  });

  describe("fixed strategy", () => {
    const strategy = { type: "fixed" as const, delay: 5000 };

    it("always returns same delay regardless of attempt", () => {
      expect(calculateBackoff(1, strategy)).toBe(5000);
      expect(calculateBackoff(5, strategy)).toBe(5000);
      expect(calculateBackoff(100, strategy)).toBe(5000);
    });
  });

  it("uses default backoff when no strategy provided", () => {
    // Default is exponential, 1s base, 5min max
    expect(calculateBackoff(1)).toBe(DEFAULT_BACKOFF.delay);
  });

  it("treats attempt < 1 as attempt 1", () => {
    const strategy = { type: "exponential" as const, delay: 1000 };
    expect(calculateBackoff(0, strategy)).toBe(1000);
    expect(calculateBackoff(-1, strategy)).toBe(1000);
  });

  it("uses default maxDelay of 5 minutes", () => {
    const strategy = { type: "exponential" as const, delay: 100000 };
    // At attempt 5: 100000 * 2^4 = 1,600,000 which exceeds 300,000
    expect(calculateBackoff(5, strategy)).toBe(DEFAULT_BACKOFF.maxDelay);
  });
});

// ============================================================================
// addJitter
// ============================================================================

describe("addJitter", () => {
  it("returns a value >= base delay", () => {
    for (let i = 0; i < 50; i++) {
      expect(addJitter(1000, 0.1)).toBeGreaterThanOrEqual(1000);
    }
  });

  it("returns a value <= base delay * (1 + jitterFactor)", () => {
    for (let i = 0; i < 50; i++) {
      expect(addJitter(1000, 0.1)).toBeLessThanOrEqual(1100);
    }
  });

  it("returns exact delay when jitterFactor is 0", () => {
    expect(addJitter(1000, 0)).toBe(1000);
  });

  it("uses default jitterFactor of 0.1", () => {
    for (let i = 0; i < 50; i++) {
      const result = addJitter(1000);
      expect(result).toBeGreaterThanOrEqual(1000);
      expect(result).toBeLessThanOrEqual(1100);
    }
  });
});

// ============================================================================
// calculateBackoffWithJitter
// ============================================================================

describe("calculateBackoffWithJitter", () => {
  it("returns at least the base backoff", () => {
    const strategy = { type: "fixed" as const, delay: 1000 };
    for (let i = 0; i < 20; i++) {
      expect(calculateBackoffWithJitter(1, strategy, 0.1)).toBeGreaterThanOrEqual(1000);
    }
  });

  it("returns within expected jitter range", () => {
    const strategy = { type: "fixed" as const, delay: 1000 };
    for (let i = 0; i < 20; i++) {
      expect(calculateBackoffWithJitter(1, strategy, 0.5)).toBeLessThanOrEqual(1500);
    }
  });

  it("returns exact backoff when jitterFactor is 0", () => {
    const strategy = { type: "fixed" as const, delay: 1000 };
    expect(calculateBackoffWithJitter(1, strategy, 0)).toBe(1000);
  });
});

// ============================================================================
// ID Generation
// ============================================================================

describe("generateJobId", () => {
  it("starts with qj_ prefix", () => {
    expect(generateJobId()).toMatch(/^qj_/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateJobId()));
    expect(ids.size).toBe(100);
  });
});

describe("generateScheduleId", () => {
  it("starts with qs_ prefix", () => {
    expect(generateScheduleId()).toMatch(/^qs_/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateScheduleId()));
    expect(ids.size).toBe(100);
  });
});

describe("createWorkerId", () => {
  it("starts with wk_ prefix", () => {
    expect(createWorkerId()).toMatch(/^wk_/);
  });

  it("contains process pid segment", () => {
    const id = createWorkerId();
    // Format: wk_<pid>_<timestamp>
    const parts = id.split("_");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("wk");
  });
});

// ============================================================================
// Time Utilities
// ============================================================================

describe("getFutureDate", () => {
  it("returns a date in the future", () => {
    const before = Date.now();
    const result = getFutureDate(1000);
    const after = Date.now();

    expect(result.getTime()).toBeGreaterThanOrEqual(before + 1000);
    expect(result.getTime()).toBeLessThanOrEqual(after + 1000);
  });

  it("handles zero delay", () => {
    const before = Date.now();
    const result = getFutureDate(0);
    expect(result.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.getTime()).toBeLessThanOrEqual(before + 50);
  });
});

describe("isInPast", () => {
  it("returns true for past dates", () => {
    expect(isInPast(new Date(Date.now() - 1000))).toBe(true);
  });

  it("returns false for future dates", () => {
    expect(isInPast(new Date(Date.now() + 10000))).toBe(false);
  });

  it("returns false for null", () => {
    expect(isInPast(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isInPast(undefined)).toBe(false);
  });
});

describe("isInFuture", () => {
  it("returns true for future dates", () => {
    expect(isInFuture(new Date(Date.now() + 10000))).toBe(true);
  });

  it("returns false for past dates", () => {
    expect(isInFuture(new Date(Date.now() - 1000))).toBe(false);
  });

  it("returns false for null", () => {
    expect(isInFuture(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isInFuture(undefined)).toBe(false);
  });
});

describe("getMillisecondsUntil", () => {
  it("returns positive ms for future date", () => {
    const future = new Date(Date.now() + 5000);
    const result = getMillisecondsUntil(future);
    expect(result).toBeGreaterThan(4000);
    expect(result).toBeLessThanOrEqual(5000);
  });

  it("returns 0 for past date", () => {
    const past = new Date(Date.now() - 5000);
    expect(getMillisecondsUntil(past)).toBe(0);
  });
});

// ============================================================================
// Cron Validation
// ============================================================================

describe("isValidCronExpression", () => {
  it("accepts 5-part cron expression", () => {
    expect(isValidCronExpression("0 * * * *")).toBe(true);
  });

  it("accepts 6-part cron expression", () => {
    expect(isValidCronExpression("0 0 * * * *")).toBe(true);
  });

  it("rejects expressions with fewer than 5 parts", () => {
    expect(isValidCronExpression("0 *")).toBe(false);
    expect(isValidCronExpression("* * *")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidCronExpression("")).toBe(false);
  });

  it("handles extra whitespace", () => {
    expect(isValidCronExpression("  0  *  *  *  *  ")).toBe(true);
  });
});

// ============================================================================
// Async Utilities
// ============================================================================

describe("sleep", () => {
  it("resolves after specified delay", async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  it("handles 0 delay", async () => {
    await expect(sleep(0)).resolves.toBeUndefined();
  });
});

describe("cancellableSleep", () => {
  it("resolves after specified delay", async () => {
    const start = Date.now();
    await cancellableSleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  it("resolves immediately when aborted", async () => {
    const controller = new AbortController();
    const start = Date.now();

    // Abort after 10ms
    setTimeout(() => controller.abort(), 10);
    await cancellableSleep(5000, controller.signal);

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it("resolves immediately for pre-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();

    const start = Date.now();
    await cancellableSleep(5000, controller.signal);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it("works without signal", async () => {
    await expect(cancellableSleep(10)).resolves.toBeUndefined();
  });
});

describe("createDeferred", () => {
  it("creates a resolvable deferred", async () => {
    const { promise, resolve } = createDeferred<number>();
    resolve(42);
    await expect(promise).resolves.toBe(42);
  });

  it("creates a rejectable deferred", async () => {
    const { promise, reject } = createDeferred<number>();
    reject(new Error("test error"));
    await expect(promise).rejects.toThrow("test error");
  });
});

describe("timeout", () => {
  it("rejects after specified ms", async () => {
    await expect(timeout(10)).rejects.toThrow("Operation timed out after 10ms");
  });

  it("uses custom error message", async () => {
    await expect(timeout(10, "Custom timeout")).rejects.toThrow("Custom timeout");
  });
});

describe("withTimeout", () => {
  it("returns result if promise resolves in time", async () => {
    const fast = new Promise<number>((resolve) => setTimeout(() => resolve(42), 10));
    await expect(withTimeout(fast, 1000)).resolves.toBe(42);
  });

  it("rejects if promise exceeds timeout", async () => {
    const slow = new Promise<number>((resolve) => setTimeout(() => resolve(42), 5000));
    await expect(withTimeout(slow, 10, "Too slow")).rejects.toThrow("Too slow");
  });
});

// ============================================================================
// retry
// ============================================================================

describe("retry", () => {
  it("returns result on first successful attempt", async () => {
    const result = await retry(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it("retries on failure and succeeds on later attempt", async () => {
    let attempts = 0;
    const result = await retry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error("fail");
        return "success";
      },
      { attempts: 5, backoff: { type: "fixed", delay: 10 } },
    );
    expect(result).toBe("success");
    expect(attempts).toBe(3);
  });

  it("throws last error when all attempts exhausted", async () => {
    let attempts = 0;
    await expect(
      retry(
        async () => {
          attempts++;
          throw new Error(`fail ${attempts}`);
        },
        { attempts: 3, backoff: { type: "fixed", delay: 10 } },
      ),
    ).rejects.toThrow("fail 3");
    expect(attempts).toBe(3);
  });

  it("stops retrying when shouldRetry returns false", async () => {
    let attempts = 0;
    await expect(
      retry(
        async () => {
          attempts++;
          throw new Error("permanent");
        },
        {
          attempts: 5,
          backoff: { type: "fixed", delay: 10 },
          shouldRetry: () => false,
        },
      ),
    ).rejects.toThrow("permanent");
    expect(attempts).toBe(1);
  });

  it("uses default of 3 attempts", async () => {
    let attempts = 0;
    await expect(
      retry(
        async () => {
          attempts++;
          throw new Error("fail");
        },
        { backoff: { type: "fixed", delay: 10 } },
      ),
    ).rejects.toThrow("fail");
    expect(attempts).toBe(3);
  });
});
