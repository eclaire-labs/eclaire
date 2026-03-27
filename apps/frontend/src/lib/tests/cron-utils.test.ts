import { describe, expect, it } from "vitest";
import {
  COMMON_CRON_PATTERNS,
  createCronExpression,
  describeCronExpression,
  formatCronForDisplay,
  getNextExecutionTime,
  getPatternDisplayName,
  parseCronExpression,
  validateCronExpression,
} from "@/lib/cron-utils";

describe("parseCronExpression", () => {
  it("parses a standard 5-field cron expression", () => {
    const result = parseCronExpression("0 9 * * *");
    expect(result).toEqual({
      minutes: "0",
      hours: "9",
      dayOfMonth: "*",
      month: "*",
      dayOfWeek: "*",
    });
  });

  it("parses a 6-field cron expression by stripping the seconds field", () => {
    const result = parseCronExpression("30 0 9 * * *");
    expect(result).toEqual({
      minutes: "0",
      hours: "9",
      dayOfMonth: "*",
      month: "*",
      dayOfWeek: "*",
    });
  });

  it("throws for an invalid field count of 3", () => {
    expect(() => parseCronExpression("0 9 *")).toThrow(
      "Invalid cron expression format",
    );
  });

  it("throws for an invalid field count of 7", () => {
    expect(() => parseCronExpression("0 0 9 * * * 2025")).toThrow(
      "Invalid cron expression format",
    );
  });
});

describe("describeCronExpression", () => {
  it("describes daily pattern for '0 9 * * *'", () => {
    const result = describeCronExpression("0 9 * * *");
    expect(result).toEqual({ pattern: "daily", time: "09:00" });
  });

  it("describes weekdays pattern for '0 9 * * 1-5'", () => {
    const result = describeCronExpression("0 9 * * 1-5");
    expect(result).toEqual({ pattern: "weekdays", time: "09:00" });
  });

  it("describes weekly pattern for a single weekday '0 9 * * 3'", () => {
    const result = describeCronExpression("0 9 * * 3");
    expect(result).toEqual({ pattern: "weekly", time: "09:00" });
  });

  it("describes monthly pattern for '0 9 15 * *'", () => {
    const result = describeCronExpression("0 9 15 * *");
    expect(result).toEqual({ pattern: "monthly", time: "09:00" });
  });

  it("describes custom pattern with comma-separated weekdays '0 9 * * 1,3,5'", () => {
    const result = describeCronExpression("0 9 * * 1,3,5");
    expect(result).toEqual({
      pattern: "custom",
      time: "09:00",
      weekdays: ["1", "3", "5"],
    });
  });

  it("returns 'every minute' for fully-wildcard '* * * * *'", () => {
    const result = describeCronExpression("* * * * *");
    expect(result.time).toBe("every minute");
    expect(result.pattern).toBe("custom");
  });

  it("returns 'every hour' for wildcard hours with fixed minutes '0 * * * *'", () => {
    const result = describeCronExpression("0 * * * *");
    expect(result.time).toBe("every hour at :00");
    expect(result.pattern).toBe("custom");
  });
});

describe("createCronExpression", () => {
  it("creates a daily cron expression", () => {
    expect(createCronExpression("daily", "09:00")).toBe("0 9 * * *");
  });

  it("creates a weekly cron expression with specified weekday", () => {
    expect(createCronExpression("weekly", "09:00", { weekdays: ["3"] })).toBe(
      "0 9 * * 3",
    );
  });

  it("creates a monthly cron expression with specified day of month", () => {
    expect(createCronExpression("monthly", "09:00", { dayOfMonth: 15 })).toBe(
      "0 9 15 * *",
    );
  });

  it("creates a weekdays cron expression", () => {
    expect(createCronExpression("weekdays", "09:00")).toBe("0 9 * * 1-5");
  });

  it("creates a custom cron expression with comma-separated weekdays", () => {
    expect(
      createCronExpression("custom", "09:00", { weekdays: ["1", "3", "5"] }),
    ).toBe("0 9 * * 1,3,5");
  });

  it("falls back to daily-like expression for custom pattern without weekdays", () => {
    expect(createCronExpression("custom", "09:00")).toBe("0 9 * * *");
  });
});

describe("validateCronExpression", () => {
  it("returns true for a valid cron expression", () => {
    expect(validateCronExpression("0 9 * * *")).toBe(true);
  });

  it("returns false for invalid minutes (60)", () => {
    expect(validateCronExpression("60 9 * * *")).toBe(false);
  });

  it("returns false for invalid hours (24)", () => {
    expect(validateCronExpression("0 24 * * *")).toBe(false);
  });

  it("returns false for invalid day of month (0)", () => {
    expect(validateCronExpression("0 9 0 * *")).toBe(false);
  });

  it("returns false for invalid day of month (32)", () => {
    expect(validateCronExpression("0 9 32 * *")).toBe(false);
  });

  it("returns false for a malformed string", () => {
    expect(validateCronExpression("not a cron")).toBe(false);
  });
});

describe("getNextExecutionTime", () => {
  it("returns same day when scheduled time is in the future", () => {
    // 8:00 AM on a Wednesday
    const from = new Date(2025, 0, 15, 8, 0, 0, 0); // Wed Jan 15 2025 08:00
    const next = getNextExecutionTime("0 9 * * *", from);

    expect(next.getDate()).toBe(15);
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(0);
  });

  it("advances to the next day when scheduled time has already passed", () => {
    // 10:00 AM on a Wednesday (after the 9 AM schedule)
    const from = new Date(2025, 0, 15, 10, 0, 0, 0); // Wed Jan 15 2025 10:00
    const next = getNextExecutionTime("0 9 * * *", from);

    expect(next.getDate()).toBe(16);
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(0);
  });

  it("advances from Saturday to Monday for a weekday cron", () => {
    // Saturday Jan 18 2025 at 10:00 AM
    const from = new Date(2025, 0, 18, 10, 0, 0, 0);
    expect(from.getDay()).toBe(6); // Confirm it is Saturday

    const next = getNextExecutionTime("0 9 * * 1-5", from);

    expect(next.getDay()).toBe(1); // Monday
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(0);
  });
});

describe("formatCronForDisplay", () => {
  it("formats daily pattern", () => {
    expect(formatCronForDisplay("0 9 * * *")).toBe("Daily at 09:00");
  });

  it("formats weekly pattern", () => {
    expect(formatCronForDisplay("0 9 * * 1")).toBe("Weekly at 09:00");
  });

  it("formats weekdays pattern", () => {
    expect(formatCronForDisplay("0 9 * * 1-5")).toBe("Weekdays at 09:00");
  });

  it("formats monthly pattern", () => {
    expect(formatCronForDisplay("0 9 1 * *")).toBe("Monthly at 09:00");
  });

  it("formats custom pattern with weekday names", () => {
    expect(formatCronForDisplay("0 9 * * 1,3,5")).toBe(
      "Mon, Wed, Fri at 09:00",
    );
  });

  it("formats wildcard cron '* * * * *' as 'every minute'", () => {
    expect(formatCronForDisplay("* * * * *")).toBe("Runs every minute");
  });

  it("formats hourly cron '0 * * * *'", () => {
    expect(formatCronForDisplay("0 * * * *")).toBe("Runs every hour at :00");
  });

  it("returns 'Invalid schedule' for an invalid cron expression", () => {
    expect(formatCronForDisplay("bad")).toBe("Invalid schedule");
  });
});

describe("COMMON_CRON_PATTERNS", () => {
  it("contains the expected pattern values", () => {
    expect(COMMON_CRON_PATTERNS.daily9am).toBe("0 9 * * *");
    expect(COMMON_CRON_PATTERNS.daily6pm).toBe("0 18 * * *");
    expect(COMMON_CRON_PATTERNS.weekdays9am).toBe("0 9 * * 1-5");
    expect(COMMON_CRON_PATTERNS.weekdays6pm).toBe("0 18 * * 1-5");
    expect(COMMON_CRON_PATTERNS.weekly).toBe("0 9 * * 1");
    expect(COMMON_CRON_PATTERNS.monthly).toBe("0 9 1 * *");
  });
});

describe("getPatternDisplayName", () => {
  it("returns correct display name for each common pattern key", () => {
    expect(getPatternDisplayName("daily9am")).toBe("Daily at 9:00 AM");
    expect(getPatternDisplayName("daily6pm")).toBe("Daily at 6:00 PM");
    expect(getPatternDisplayName("weekdays9am")).toBe("Weekdays at 9:00 AM");
    expect(getPatternDisplayName("weekdays6pm")).toBe("Weekdays at 6:00 PM");
    expect(getPatternDisplayName("weekly")).toBe("Weekly (Mondays at 9:00 AM)");
    expect(getPatternDisplayName("monthly")).toBe(
      "Monthly (1st day at 9:00 AM)",
    );
  });
});
