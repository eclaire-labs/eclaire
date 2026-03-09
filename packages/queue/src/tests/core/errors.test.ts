/**
 * Unit tests for core/errors.ts error classes and type guards
 *
 * Verifies error construction, property assignment, instanceof chains,
 * type guards, and helper functions.
 */

import { describe, expect, it } from "vitest";
import {
  ConnectionError,
  createRateLimitError,
  getRateLimitDelay,
  isJobAlreadyActiveError,
  isPermanentError,
  isQueueError,
  isRateLimitError,
  isRetryableError,
  JobAlreadyActiveError,
  JobNotFoundError,
  JobTimeoutError,
  PermanentError,
  QueueError,
  RateLimitError,
  RetryableError,
} from "../../core/errors.js";

// ============================================================================
// Error Construction & Properties
// ============================================================================

describe("QueueError", () => {
  it("has correct name and code", () => {
    const error = new QueueError("test message", "TEST_CODE");
    expect(error.name).toBe("QueueError");
    expect(error.code).toBe("TEST_CODE");
    expect(error.message).toBe("test message");
  });

  it("is instanceof Error", () => {
    const error = new QueueError("test", "TEST");
    expect(error).toBeInstanceOf(Error);
  });
});

describe("RateLimitError", () => {
  it("stores retryAfter", () => {
    const error = new RateLimitError(5000);
    expect(error.retryAfter).toBe(5000);
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.name).toBe("RateLimitError");
  });

  it("uses default message when not provided", () => {
    const error = new RateLimitError(3000);
    expect(error.message).toContain("3000ms");
  });

  it("uses custom message when provided", () => {
    const error = new RateLimitError(3000, "Custom rate limit");
    expect(error.message).toBe("Custom rate limit");
  });

  it("is instanceof QueueError and Error", () => {
    const error = new RateLimitError(1000);
    expect(error).toBeInstanceOf(QueueError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe("RetryableError", () => {
  it("has correct properties", () => {
    const error = new RetryableError("network timeout");
    expect(error.name).toBe("RetryableError");
    expect(error.code).toBe("RETRYABLE");
    expect(error.message).toBe("network timeout");
  });

  it("is instanceof QueueError", () => {
    expect(new RetryableError("test")).toBeInstanceOf(QueueError);
  });
});

describe("PermanentError", () => {
  it("has correct properties", () => {
    const error = new PermanentError("invalid data");
    expect(error.name).toBe("PermanentError");
    expect(error.code).toBe("PERMANENT");
    expect(error.message).toBe("invalid data");
  });

  it("is instanceof QueueError", () => {
    expect(new PermanentError("test")).toBeInstanceOf(QueueError);
  });
});

describe("JobTimeoutError", () => {
  it("stores jobId and timeout", () => {
    const error = new JobTimeoutError("job-123", 30000);
    expect(error.jobId).toBe("job-123");
    expect(error.timeout).toBe(30000);
    expect(error.code).toBe("JOB_TIMEOUT");
    expect(error.name).toBe("JobTimeoutError");
    expect(error.message).toContain("job-123");
    expect(error.message).toContain("30000ms");
  });
});

describe("JobNotFoundError", () => {
  it("stores jobIdOrKey", () => {
    const error = new JobNotFoundError("missing-key");
    expect(error.jobIdOrKey).toBe("missing-key");
    expect(error.code).toBe("JOB_NOT_FOUND");
    expect(error.name).toBe("JobNotFoundError");
    expect(error.message).toContain("missing-key");
  });
});

describe("JobAlreadyActiveError", () => {
  it("stores queueName, key, and jobId", () => {
    const error = new JobAlreadyActiveError("my-queue", "my-key", "job-456");
    expect(error.queueName).toBe("my-queue");
    expect(error.key).toBe("my-key");
    expect(error.jobId).toBe("job-456");
    expect(error.code).toBe("JOB_ALREADY_ACTIVE");
    expect(error.name).toBe("JobAlreadyActiveError");
    expect(error.message).toContain("my-key");
    expect(error.message).toContain("my-queue");
    expect(error.message).toContain("job-456");
  });
});

describe("ConnectionError", () => {
  it("stores cause", () => {
    const cause = new Error("connection refused");
    const error = new ConnectionError("Failed to connect", cause);
    expect(error.cause).toBe(cause);
    expect(error.code).toBe("CONNECTION_ERROR");
    expect(error.name).toBe("ConnectionError");
  });

  it("works without cause", () => {
    const error = new ConnectionError("timeout");
    expect(error.cause).toBeUndefined();
  });
});

// ============================================================================
// Type Guards
// ============================================================================

describe("isRateLimitError", () => {
  it("returns true for RateLimitError", () => {
    expect(isRateLimitError(new RateLimitError(1000))).toBe(true);
  });

  it("returns false for other QueueErrors", () => {
    expect(isRateLimitError(new RetryableError("test"))).toBe(false);
    expect(isRateLimitError(new PermanentError("test"))).toBe(false);
  });

  it("returns false for plain Error", () => {
    expect(isRateLimitError(new Error("test"))).toBe(false);
  });

  it("returns false for non-errors", () => {
    expect(isRateLimitError("string")).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
  });
});

describe("isRetryableError", () => {
  it("returns true for RetryableError", () => {
    expect(isRetryableError(new RetryableError("test"))).toBe(true);
  });

  it("returns false for other QueueErrors", () => {
    expect(isRetryableError(new PermanentError("test"))).toBe(false);
    expect(isRetryableError(new RateLimitError(1000))).toBe(false);
  });

  it("returns false for plain Error", () => {
    expect(isRetryableError(new Error("test"))).toBe(false);
  });
});

describe("isPermanentError", () => {
  it("returns true for PermanentError", () => {
    expect(isPermanentError(new PermanentError("test"))).toBe(true);
  });

  it("returns false for other QueueErrors", () => {
    expect(isPermanentError(new RetryableError("test"))).toBe(false);
    expect(isPermanentError(new RateLimitError(1000))).toBe(false);
  });

  it("returns false for plain Error", () => {
    expect(isPermanentError(new Error("test"))).toBe(false);
  });
});

describe("isQueueError", () => {
  it("returns true for all QueueError subclasses", () => {
    expect(isQueueError(new QueueError("test", "TEST"))).toBe(true);
    expect(isQueueError(new RateLimitError(1000))).toBe(true);
    expect(isQueueError(new RetryableError("test"))).toBe(true);
    expect(isQueueError(new PermanentError("test"))).toBe(true);
    expect(isQueueError(new JobTimeoutError("id", 1000))).toBe(true);
    expect(isQueueError(new JobNotFoundError("key"))).toBe(true);
    expect(isQueueError(new JobAlreadyActiveError("q", "k", "id"))).toBe(true);
    expect(isQueueError(new ConnectionError("fail"))).toBe(true);
  });

  it("returns false for plain Error", () => {
    expect(isQueueError(new Error("test"))).toBe(false);
  });

  it("returns false for non-errors", () => {
    expect(isQueueError("string")).toBe(false);
    expect(isQueueError(42)).toBe(false);
    expect(isQueueError(null)).toBe(false);
  });
});

describe("isJobAlreadyActiveError", () => {
  it("returns true for JobAlreadyActiveError", () => {
    expect(
      isJobAlreadyActiveError(new JobAlreadyActiveError("q", "k", "id")),
    ).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(isJobAlreadyActiveError(new QueueError("test", "TEST"))).toBe(false);
    expect(isJobAlreadyActiveError(new Error("test"))).toBe(false);
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

describe("getRateLimitDelay", () => {
  it("returns retryAfter for RateLimitError", () => {
    expect(getRateLimitDelay(new RateLimitError(5000))).toBe(5000);
  });

  it("returns null for other errors", () => {
    expect(getRateLimitDelay(new RetryableError("test"))).toBeNull();
    expect(getRateLimitDelay(new Error("test"))).toBeNull();
  });

  it("returns null for non-errors", () => {
    expect(getRateLimitDelay("string")).toBeNull();
    expect(getRateLimitDelay(null)).toBeNull();
  });
});

describe("createRateLimitError", () => {
  it("creates RateLimitError with specified delay", () => {
    const error = createRateLimitError(3000);
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.retryAfter).toBe(3000);
  });

  it("accepts custom message", () => {
    const error = createRateLimitError(3000, "API rate limited");
    expect(error.message).toBe("API rate limited");
  });
});
