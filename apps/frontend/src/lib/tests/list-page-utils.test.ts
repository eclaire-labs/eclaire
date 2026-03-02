import { describe, expect, it } from "vitest";
import {
  formatDate,
  getGroupDateLabel,
  getTimestamp,
} from "@/lib/list-page-utils";

describe("formatDate", () => {
  it("returns 'N/A' for null", () => {
    expect(formatDate(null)).toBe("N/A");
  });

  it("returns 'N/A' for undefined", () => {
    expect(formatDate(undefined)).toBe("N/A");
  });

  it("returns 'Invalid Date' for garbage input", () => {
    expect(formatDate("not-a-date")).toBe("Invalid Date");
  });

  it("formats a valid ISO string with year and month", () => {
    const result = formatDate("2024-06-15T12:00:00Z");
    // Locale-independent: must contain the year and the day
    expect(result).toContain("2024");
    expect(result).toMatch(/June|Jun|6/);
  });

  it("formats a Date object", () => {
    const result = formatDate(new Date(2024, 0, 20)); // Jan 20 2024 local
    expect(result).toContain("2024");
    expect(result).toMatch(/January|Jan|1/);
  });

  it("converts Unix seconds correctly", () => {
    // 1704067200 = 2024-01-01T00:00:00Z
    const result = formatDate(1704067200);
    expect(result).not.toBe("N/A");
    expect(result).not.toBe("Invalid Date");
    // Depending on locale timezone it could show Dec 31 2023 or Jan 1 2024
    expect(result).toMatch(/202[34]/);
  });

  it("treats Unix milliseconds the same as seconds for the same instant", () => {
    const fromSeconds = formatDate(1704067200);
    const fromMs = formatDate(1704067200000);
    // Both should produce valid formatted dates (not N/A or Invalid Date)
    expect(fromSeconds).not.toBe("N/A");
    expect(fromMs).not.toBe("N/A");
    expect(fromSeconds).not.toBe("Invalid Date");
    expect(fromMs).not.toBe("Invalid Date");
    // They represent the same instant, so they should match
    expect(fromSeconds).toBe(fromMs);
  });
});

describe("getGroupDateLabel", () => {
  it("returns 'Today' for today's date", () => {
    const now = new Date();
    expect(getGroupDateLabel(now)).toBe("Today");
  });

  it("returns 'Yesterday' for yesterday's date", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(getGroupDateLabel(yesterday)).toBe("Yesterday");
  });

  it("returns month and year for an older date", () => {
    // Jan 15 2024 is safely in the past
    const result = getGroupDateLabel("2024-01-15T12:00:00Z");
    expect(result).toMatch(/January|Jan/);
    expect(result).toContain("2024");
  });

  it("returns 'Unknown Date' for null", () => {
    expect(getGroupDateLabel(null)).toBe("Unknown Date");
  });

  it("returns 'Unknown Date' for invalid date string", () => {
    expect(getGroupDateLabel("garbage")).toBe("Unknown Date");
  });
});

describe("getTimestamp", () => {
  it("returns 0 for null", () => {
    expect(getTimestamp(null)).toBe(0);
  });

  it("returns correct timestamp in ms for a valid ISO string", () => {
    const result = getTimestamp("2024-01-01T00:00:00Z");
    expect(result).toBe(1704067200000);
  });

  it("returns 0 for an invalid date string", () => {
    expect(getTimestamp("totally-invalid")).toBe(0);
  });

  it("converts Unix seconds to milliseconds", () => {
    // 1704067200 is < 1e12 so it's treated as seconds
    const result = getTimestamp(1704067200);
    expect(result).toBe(1704067200 * 1000);
  });
});
