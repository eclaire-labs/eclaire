// lib/cron-utils.ts
import { CronExpressionParser } from "cron-parser";
import { createChildLogger } from "../logger.js";

const logger = createChildLogger("cron-utils");

/**
 * Validates a cron expression format
 * Supports both 5-field and 6-field cron formats consistent with BullMQ:
 * - 5-field: minute hour day-of-month month day-of-week
 * - 6-field: second minute hour day-of-month month day-of-week
 * @param cronExpression - The cron expression to validate
 * @returns boolean - True if valid, false otherwise
 */
export function isValidCronExpression(cronExpression: string): boolean {
  if (!cronExpression || typeof cronExpression !== "string") {
    return false;
  }

  // Check field count - must be exactly 5 or 6 fields
  const fields = cronExpression.trim().split(/\s+/);
  if (fields.length !== 5 && fields.length !== 6) {
    logger.debug(
      {
        cronExpression,
        fieldCount: fields.length,
        error: `Invalid field count: expected 5 or 6 fields, got ${fields.length}`,
      },
      "Invalid cron expression - wrong field count",
    );
    return false;
  }

  try {
    // Use CronExpressionParser to validate the expression
    // It supports both 5-field and 6-field formats
    CronExpressionParser.parse(cronExpression);
    return true;
  } catch (error) {
    logger.debug(
      {
        cronExpression,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Invalid cron expression",
    );
    return false;
  }
}

/**
 * Calculate the next execution time for a cron expression
 * Uses CronExpressionParser for accurate calculation supporting both 5-field and 6-field formats
 * @param cronExpression - Valid cron expression
 * @param fromDate - Date to calculate from (defaults to now)
 * @returns Date - Next execution time, or null if invalid
 */
export function getNextExecutionTime(
  cronExpression: string,
  fromDate: Date = new Date(),
): Date | null {
  if (!isValidCronExpression(cronExpression)) {
    logger.warn({ cronExpression }, "Invalid cron expression provided");
    return null;
  }

  try {
    const interval = CronExpressionParser.parse(cronExpression, {
      currentDate: fromDate,
    });

    return interval.next().toDate();
  } catch (error) {
    logger.error(
      {
        cronExpression,
        fromDate,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error calculating next execution time",
    );
    return null;
  }
}

/**
 * Common cron expression patterns for convenience
 * Using 6-field format (second minute hour day-of-month month day-of-week) consistent with BullMQ
 */
export const CronPatterns = {
  // Fast patterns for testing
  EVERY_3_SECONDS: "*/3 * * * * *",
  EVERY_5_SECONDS: "*/5 * * * * *",
  EVERY_10_SECONDS: "*/10 * * * * *",
  EVERY_30_SECONDS: "*/30 * * * * *",

  // Standard patterns
  EVERY_MINUTE: "0 * * * * *",
  EVERY_HOUR: "0 0 * * * *",
  DAILY_AT_9AM: "0 0 9 * * *",
  DAILY_AT_6PM: "0 0 18 * * *",
  WEEKLY_MONDAY_9AM: "0 0 9 * * 1",
  WEEKLY_FRIDAY_5PM: "0 0 17 * * 5",
  MONTHLY_FIRST_DAY_9AM: "0 0 9 1 * *",
  MONTHLY_LAST_DAY: "0 0 9 28-31 * *", // Approximate, runs on 28-31 of each month
} as const;

/**
 * Get a human-readable description of a cron expression
 * @param cronExpression - Valid cron expression (supports both 5-field and 6-field)
 * @returns string - Human-readable description
 */
export function describeCronExpression(cronExpression: string): string {
  if (!isValidCronExpression(cronExpression)) {
    return "Invalid cron expression";
  }

  // Simple descriptions for common patterns
  const descriptions: Record<string, string> = {
    // 6-field patterns (with seconds)
    "*/3 * * * * *": "Every 3 seconds",
    "*/5 * * * * *": "Every 5 seconds",
    "*/10 * * * * *": "Every 10 seconds",
    "*/30 * * * * *": "Every 30 seconds",
    "0 * * * * *": "Every minute",
    "0 0 * * * *": "Every hour",
    "0 0 9 * * *": "Daily at 9:00 AM",
    "0 0 18 * * *": "Daily at 6:00 PM",
    "0 0 9 * * 1": "Every Monday at 9:00 AM",
    "0 0 17 * * 5": "Every Friday at 5:00 PM",
    "0 0 9 1 * *": "Monthly on the 1st at 9:00 AM",

    // 5-field patterns (legacy support)
    "* * * * *": "Every minute",
    "0 * * * *": "Every hour",
    "0 9 * * *": "Daily at 9:00 AM",
    "0 18 * * *": "Daily at 6:00 PM",
    "0 9 * * 1": "Every Monday at 9:00 AM",
    "0 17 * * 5": "Every Friday at 5:00 PM",
    "0 9 1 * *": "Monthly on the 1st at 9:00 AM",
  };

  return descriptions[cronExpression] || `Custom schedule: ${cronExpression}`;
}
