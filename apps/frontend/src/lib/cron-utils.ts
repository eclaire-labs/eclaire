/**
 * Utility functions for working with cron expressions in the frontend
 */

export interface CronParts {
  minutes: string;
  hours: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
  year?: string;
}

export interface RecurrenceDescription {
  pattern: "daily" | "weekly" | "monthly" | "weekdays" | "custom";
  time: string; // HH:MM format
  weekdays?: string[]; // Array of weekday keys (0-6)
  interval?: number;
  intervalUnit?: "days" | "weeks" | "months";
}

/**
 * Parse a cron expression into its component parts
 */
export function parseCronExpression(cron: string): CronParts {
  const parts = cron.trim().split(/\s+/);

  if (parts.length === 5) {
    // Standard 5-field cron (minute hour day month weekday)
    return {
      minutes: parts[0],
      hours: parts[1],
      dayOfMonth: parts[2],
      month: parts[3],
      dayOfWeek: parts[4],
    };
  } else if (parts.length === 6) {
    // 6-field cron with seconds (second minute hour day month weekday)
    return {
      minutes: parts[1],
      hours: parts[2],
      dayOfMonth: parts[3],
      month: parts[4],
      dayOfWeek: parts[5],
    };
  } else {
    throw new Error("Invalid cron expression format");
  }
}

/**
 * Convert cron expression to human-readable description
 */
export function describeCronExpression(cron: string): RecurrenceDescription {
  const parts = parseCronExpression(cron);

  // Extract time
  const hours = parts.hours === "*" ? 9 : parseInt(parts.hours, 10);
  const minutes = parts.minutes === "*" ? 0 : parseInt(parts.minutes, 10);
  const time = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;

  // Determine pattern
  if (
    parts.dayOfMonth === "*" &&
    parts.month === "*" &&
    parts.dayOfWeek === "*"
  ) {
    return { pattern: "daily", time };
  }

  if (
    parts.dayOfMonth === "*" &&
    parts.month === "*" &&
    parts.dayOfWeek === "1-5"
  ) {
    return { pattern: "weekdays", time };
  }

  if (
    parts.dayOfMonth === "*" &&
    parts.month === "*" &&
    /^[0-6]$/.test(parts.dayOfWeek)
  ) {
    return { pattern: "weekly", time };
  }

  if (
    parts.month === "*" &&
    parts.dayOfWeek === "*" &&
    /^\d{1,2}$/.test(parts.dayOfMonth)
  ) {
    return { pattern: "monthly", time };
  }

  // Handle comma-separated weekdays
  if (
    parts.dayOfMonth === "*" &&
    parts.month === "*" &&
    parts.dayOfWeek.includes(",")
  ) {
    const weekdays = parts.dayOfWeek.split(",");
    return { pattern: "custom", time, weekdays };
  }

  return { pattern: "custom", time };
}

/**
 * Create a cron expression from pattern and time
 */
export function createCronExpression(
  pattern: "daily" | "weekly" | "monthly" | "weekdays" | "custom",
  time: string,
  options: {
    weekdays?: string[];
    dayOfMonth?: number;
    interval?: number;
    intervalUnit?: "days" | "weeks" | "months";
  } = {},
): string {
  const [hours, minutes] = time.split(":").map(Number);

  switch (pattern) {
    case "daily":
      return `${minutes} ${hours} * * *`;

    case "weekly": {
      // Default to current day if no day specified
      const dayOfWeek = options.weekdays?.[0] || "0";
      return `${minutes} ${hours} * * ${dayOfWeek}`;
    }

    case "monthly": {
      const dayOfMonth = options.dayOfMonth || 1;
      return `${minutes} ${hours} ${dayOfMonth} * *`;
    }

    case "weekdays":
      return `${minutes} ${hours} * * 1-5`;

    case "custom":
      if (options.weekdays && options.weekdays.length > 0) {
        const weekdaysList = options.weekdays.join(",");
        return `${minutes} ${hours} * * ${weekdaysList}`;
      }
      return `${minutes} ${hours} * * *`;

    default:
      throw new Error(`Unknown pattern: ${pattern}`);
  }
}

/**
 * Validate if a cron expression is valid (basic validation)
 */
export function validateCronExpression(cron: string): boolean {
  try {
    const parts = parseCronExpression(cron);

    // Basic validation
    if (
      parts.minutes !== "*" &&
      (parseInt(parts.minutes, 10) < 0 || parseInt(parts.minutes, 10) > 59)
    ) {
      return false;
    }

    if (
      parts.hours !== "*" &&
      (parseInt(parts.hours, 10) < 0 || parseInt(parts.hours, 10) > 23)
    ) {
      return false;
    }

    if (
      parts.dayOfMonth !== "*" &&
      (parseInt(parts.dayOfMonth, 10) < 1 ||
        parseInt(parts.dayOfMonth, 10) > 31)
    ) {
      return false;
    }

    if (
      parts.month !== "*" &&
      (parseInt(parts.month, 10) < 1 || parseInt(parts.month, 10) > 12)
    ) {
      return false;
    }

    if (parts.dayOfWeek !== "*" && parts.dayOfWeek !== "1-5") {
      const weekdays = parts.dayOfWeek.split(",");
      for (const day of weekdays) {
        const dayNum = parseInt(day, 10);
        if (dayNum < 0 || dayNum > 6) {
          return false;
        }
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Get next execution time for a cron expression (simplified calculation)
 */
export function getNextExecutionTime(
  cron: string,
  from: Date = new Date(),
): Date {
  const parts = parseCronExpression(cron);
  const next = new Date(from);

  // Set time
  if (parts.hours !== "*") {
    next.setHours(parseInt(parts.hours, 10));
  }
  if (parts.minutes !== "*") {
    next.setMinutes(parseInt(parts.minutes, 10));
  }
  next.setSeconds(0);
  next.setMilliseconds(0);

  // If the time has passed today, move to tomorrow
  if (next <= from) {
    next.setDate(next.getDate() + 1);
  }

  // Handle different patterns
  if (parts.dayOfWeek === "1-5") {
    // Weekdays only
    while (next.getDay() === 0 || next.getDay() === 6) {
      next.setDate(next.getDate() + 1);
    }
  } else if (parts.dayOfWeek !== "*") {
    // Specific day(s) of week
    const targetDays = new Set(parts.dayOfWeek.split(",").map(Number));
    while (!targetDays.has(next.getDay())) {
      next.setDate(next.getDate() + 1);
    }
  }

  return next;
}

/**
 * Format a cron expression for display
 */
export function formatCronForDisplay(cron: string): string {
  try {
    const description = describeCronExpression(cron);

    switch (description.pattern) {
      case "daily":
        return `Daily at ${description.time}`;
      case "weekly":
        return `Weekly at ${description.time}`;
      case "monthly":
        return `Monthly at ${description.time}`;
      case "weekdays":
        return `Weekdays at ${description.time}`;
      case "custom":
        if (description.weekdays) {
          const dayNames = description.weekdays.map((day) => {
            const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            return days[parseInt(day, 10)];
          });
          return `${dayNames.join(", ")} at ${description.time}`;
        }
        return `Custom schedule at ${description.time}`;
      default:
        return "Custom schedule";
    }
  } catch {
    return "Invalid schedule";
  }
}

/**
 * Common cron patterns for quick selection
 */
export const COMMON_CRON_PATTERNS = {
  daily9am: "0 9 * * *",
  daily6pm: "0 18 * * *",
  weekdays9am: "0 9 * * 1-5",
  weekdays6pm: "0 18 * * 1-5",
  weekly: "0 9 * * 1",
  monthly: "0 9 1 * *",
} as const;

/**
 * Get display name for common patterns
 */
export function getPatternDisplayName(
  pattern: keyof typeof COMMON_CRON_PATTERNS,
): string {
  const names = {
    daily9am: "Daily at 9:00 AM",
    daily6pm: "Daily at 6:00 PM",
    weekdays9am: "Weekdays at 9:00 AM",
    weekdays6pm: "Weekdays at 6:00 PM",
    weekly: "Weekly (Mondays at 9:00 AM)",
    monthly: "Monthly (1st day at 9:00 AM)",
  };

  return names[pattern] || "Custom pattern";
}
