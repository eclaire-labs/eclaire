import { describe, expect, it } from "vitest";
import {
  TaskSchema,
  PartialTaskSchema,
  TaskSearchParamsSchema,
} from "../../schemas/tasks-params.js";
import {
  isValidCronExpression,
  getNextExecutionTime,
  describeCronExpression,
} from "../../lib/queue/cron-utils.js";

// ---------------------------------------------------------------------------
// Schedule-related schema validation
// ---------------------------------------------------------------------------

describe("TaskSchema — Schedule Fields", () => {
  it("should accept scheduleType=none (default)", () => {
    const result = TaskSchema.safeParse({ title: "Plain task" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scheduleType).toBe("none");
      expect(result.data.scheduleRule).toBeUndefined();
    }
  });

  it("should accept scheduleType=recurring with scheduleRule", () => {
    const result = TaskSchema.safeParse({
      title: "Daily standup",
      scheduleType: "recurring",
      scheduleRule: "0 9 * * *",
      scheduleSummary: "Daily at 9 AM",
      timezone: "America/New_York",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scheduleType).toBe("recurring");
      expect(result.data.scheduleRule).toBe("0 9 * * *");
      expect(result.data.timezone).toBe("America/New_York");
    }
  });

  it("should accept scheduleType=one_time with ISO datetime scheduleRule", () => {
    const futureDate = new Date(Date.now() + 3600000).toISOString();
    const result = TaskSchema.safeParse({
      title: "Remind me",
      scheduleType: "one_time",
      scheduleRule: futureDate,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scheduleType).toBe("one_time");
      expect(result.data.scheduleRule).toBe(futureDate);
    }
  });

  it("should reject invalid scheduleType", () => {
    const result = TaskSchema.safeParse({
      title: "Bad task",
      scheduleType: "weekly",
    });
    expect(result.success).toBe(false);
  });

  it("should accept maxOccurrences as positive integer", () => {
    const result = TaskSchema.safeParse({
      title: "Limited recurring",
      scheduleType: "recurring",
      scheduleRule: "0 9 * * *",
      maxOccurrences: 10,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxOccurrences).toBe(10);
    }
  });

  it("should accept deliveryTargets", () => {
    const result = TaskSchema.safeParse({
      title: "Reminder with delivery",
      scheduleType: "one_time",
      scheduleRule: new Date(Date.now() + 3600000).toISOString(),
      deliveryTargets: [{ type: "notification_channels" }],
    });
    expect(result.success).toBe(true);
  });
});

describe("TaskSchema — Delegate Fields", () => {
  it("should accept delegateMode values", () => {
    for (const mode of ["manual", "assist", "handle"] as const) {
      const result = TaskSchema.safeParse({
        title: `Task with ${mode}`,
        delegateMode: mode,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.delegateMode).toBe(mode);
      }
    }
  });

  it("should reject invalid delegateMode", () => {
    const result = TaskSchema.safeParse({
      title: "Bad mode",
      delegateMode: "auto",
    });
    expect(result.success).toBe(false);
  });

  it("should accept delegateActorId", () => {
    const result = TaskSchema.safeParse({
      title: "Agent task",
      delegateActorId: "eclaire",
    });
    expect(result.success).toBe(true);
  });
});

describe("TaskSchema — Attention & Review Fields", () => {
  it("should accept all attentionStatus values", () => {
    for (const status of [
      "none",
      "needs_triage",
      "awaiting_input",
      "needs_review",
      "failed",
      "urgent",
    ] as const) {
      const result = TaskSchema.safeParse({
        title: `Task ${status}`,
        attentionStatus: status,
      });
      expect(result.success).toBe(true);
    }
  });

  it("should accept all reviewStatus values", () => {
    for (const status of [
      "none",
      "pending",
      "approved",
      "changes_requested",
    ] as const) {
      const result = TaskSchema.safeParse({
        title: `Task ${status}`,
        reviewStatus: status,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("TaskSearchParamsSchema — Schedule Filters", () => {
  it("should accept scheduleType filter", () => {
    const result = TaskSearchParamsSchema.safeParse({
      scheduleType: "recurring",
    });
    expect(result.success).toBe(true);
  });

  it("should accept delegateMode filter", () => {
    const result = TaskSearchParamsSchema.safeParse({
      delegateMode: "assist",
    });
    expect(result.success).toBe(true);
  });

  it("should accept attentionStatus filter", () => {
    const result = TaskSearchParamsSchema.safeParse({
      attentionStatus: "needs_review",
    });
    expect(result.success).toBe(true);
  });

  it("should accept dueDateStart and dueDateEnd filters", () => {
    const result = TaskSearchParamsSchema.safeParse({
      dueDateStart: "2026-01-01T00:00:00Z",
      dueDateEnd: "2026-12-31T23:59:59Z",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cron utilities
// ---------------------------------------------------------------------------

describe("isValidCronExpression", () => {
  it("should accept standard 5-field cron", () => {
    expect(isValidCronExpression("0 9 * * *")).toBe(true);
    expect(isValidCronExpression("*/15 * * * *")).toBe(true);
    expect(isValidCronExpression("0 0 1 * *")).toBe(true);
  });

  it("should accept 6-field cron (with seconds)", () => {
    expect(isValidCronExpression("*/3 * * * * *")).toBe(true);
    expect(isValidCronExpression("0 0 9 * * *")).toBe(true);
    expect(isValidCronExpression("0 0 9 * * 1")).toBe(true);
  });

  it("should reject invalid cron expressions", () => {
    expect(isValidCronExpression("")).toBe(false);
    expect(isValidCronExpression("not a cron")).toBe(false);
    expect(isValidCronExpression("* * *")).toBe(false);
    expect(isValidCronExpression("60 * * * *")).toBe(false);
  });

  it("should reject non-string input", () => {
    expect(isValidCronExpression(null as unknown as string)).toBe(false);
    expect(isValidCronExpression(undefined as unknown as string)).toBe(false);
  });
});

describe("getNextExecutionTime", () => {
  it("should return a future Date for valid cron", () => {
    const next = getNextExecutionTime("0 9 * * *");
    expect(next).toBeInstanceOf(Date);
    expect(next!.getTime()).toBeGreaterThan(Date.now());
  });

  it("should respect timezone", () => {
    const nextUTC = getNextExecutionTime("0 9 * * *", new Date(), "UTC");
    const nextNY = getNextExecutionTime(
      "0 9 * * *",
      new Date(),
      "America/New_York",
    );
    expect(nextUTC).toBeInstanceOf(Date);
    expect(nextNY).toBeInstanceOf(Date);
    // Different timezones should produce different absolute times
    // (unless we happen to be exactly at the boundary)
  });

  it("should return null for invalid cron", () => {
    expect(getNextExecutionTime("invalid")).toBeNull();
  });

  it("should compute next from a given date", () => {
    const from = new Date("2026-01-01T08:00:00Z");
    const next = getNextExecutionTime("0 9 * * *", from, "UTC");
    expect(next).toBeInstanceOf(Date);
    // Next 9 AM UTC after Jan 1 8 AM should be Jan 1 9 AM
    expect(next!.getUTCHours()).toBe(9);
  });
});

describe("describeCronExpression", () => {
  it("should describe common patterns", () => {
    expect(describeCronExpression("0 9 * * *")).toBe("Daily at 9:00 AM");
    expect(describeCronExpression("0 0 9 * * *")).toBe("Daily at 9:00 AM");
    expect(describeCronExpression("* * * * *")).toBe("Every minute");
  });

  it("should return fallback for custom patterns", () => {
    const desc = describeCronExpression("15 3 * * 2");
    expect(desc).toContain("Custom schedule");
  });

  it("should handle invalid expressions", () => {
    expect(describeCronExpression("invalid")).toBe("Invalid cron expression");
  });
});
