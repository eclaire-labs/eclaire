import { describe, expect, it } from "vitest";
import { formatDate, formatFileSize, isJobStuck } from "@/lib/date-utils";

describe("formatDate", () => {
  it("returns 'N/A' for null", () => {
    expect(formatDate(null)).toBe("N/A");
  });

  it("returns 'N/A' for undefined", () => {
    expect(formatDate(undefined)).toBe("N/A");
  });

  it("returns 'N/A' for empty string", () => {
    expect(formatDate("")).toBe("N/A");
  });

  it("returns 'Invalid Date' for garbage input", () => {
    expect(formatDate("not-a-date")).toBe("Invalid Date");
  });

  it("formats a valid ISO string", () => {
    const result = formatDate("2025-01-15T14:30:00Z");
    expect(result).toContain("2025");
    expect(result).toContain("15");
  });

  it("handles numeric timestamp (Unix seconds)", () => {
    // 1735689600 = 2025-01-01T00:00:00Z (may render as Dec 31 2024 in western timezones)
    const result = formatDate(1735689600);
    // Should produce a valid date, not "N/A" or "Invalid Date"
    expect(result).not.toBe("N/A");
    expect(result).not.toBe("Invalid Date");
    // Should contain either 2024 or 2025 depending on timezone
    expect(result).toMatch(/202[45]/);
  });

  it("returns 'N/A' for 0 as number", () => {
    // 0 is falsy → returns N/A
    expect(formatDate(0)).toBe("N/A");
  });
});

describe("formatFileSize", () => {
  it("returns 'Unknown size' for null", () => {
    expect(formatFileSize(null)).toBe("Unknown size");
  });

  it("returns 'Unknown size' for 0", () => {
    expect(formatFileSize(0)).toBe("Unknown size");
  });

  it("formats bytes correctly", () => {
    expect(formatFileSize(500)).toBe("500.0 B");
  });

  it("formats kilobytes correctly", () => {
    expect(formatFileSize(2048)).toBe("2.0 KB");
  });

  it("formats exactly 1 KB", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
  });

  it("formats megabytes correctly", () => {
    expect(formatFileSize(1048576)).toBe("1.0 MB");
  });

  it("formats gigabytes correctly", () => {
    expect(formatFileSize(1073741824)).toBe("1.0 GB");
  });

  it("formats fractional sizes", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });
});

describe("isJobStuck", () => {
  const now = Date.now();

  it("returns false when processingStatus is null", () => {
    expect(
      isJobStuck({
        processingStatus: null,
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
      }),
    ).toBe(false);
  });

  it("returns false for 'pending' created less than 15 min ago", () => {
    const fiveMinAgo = new Date(now - 5 * 60 * 1000).toISOString();
    expect(
      isJobStuck({
        processingStatus: "pending",
        createdAt: fiveMinAgo,
        updatedAt: fiveMinAgo,
      }),
    ).toBe(false);
  });

  it("returns true for 'pending' created more than 15 min ago", () => {
    const twentyMinAgo = new Date(now - 20 * 60 * 1000).toISOString();
    expect(
      isJobStuck({
        processingStatus: "pending",
        createdAt: twentyMinAgo,
        updatedAt: twentyMinAgo,
      }),
    ).toBe(true);
  });

  it("returns false for 'processing' updated less than 15 min ago", () => {
    const fiveMinAgo = new Date(now - 5 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
    expect(
      isJobStuck({
        processingStatus: "processing",
        createdAt: oneHourAgo,
        updatedAt: fiveMinAgo,
      }),
    ).toBe(false);
  });

  it("returns true for 'processing' updated more than 15 min ago", () => {
    const twentyMinAgo = new Date(now - 20 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
    expect(
      isJobStuck({
        processingStatus: "processing",
        createdAt: oneHourAgo,
        updatedAt: twentyMinAgo,
      }),
    ).toBe(true);
  });

  it("returns false for 'completed' regardless of time", () => {
    const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
    expect(
      isJobStuck({
        processingStatus: "completed",
        createdAt: oneHourAgo,
        updatedAt: oneHourAgo,
      }),
    ).toBe(false);
  });

  it("returns false for unknown status", () => {
    const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
    expect(
      isJobStuck({
        processingStatus: "done",
        createdAt: oneHourAgo,
        updatedAt: oneHourAgo,
      }),
    ).toBe(false);
  });
});
