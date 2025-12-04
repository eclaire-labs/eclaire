
import { Calendar, Clock, RefreshCw, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export interface RecurrenceConfig {
  isRecurring: boolean;
  cronExpression: string | null;
  recurrenceEndDate: string | null;
  recurrenceLimit: number | null;
  runImmediately: boolean;
}

interface RecurrenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: RecurrenceConfig;
  onChange: (config: RecurrenceConfig) => void;
  dueDate?: string | null;
}

type RecurrencePattern =
  | "none"
  | "daily"
  | "weekly"
  | "monthly"
  | "weekdays"
  | "custom";

interface WeekdaySelection {
  [key: string]: boolean;
}

const WEEKDAYS = [
  { key: "1", label: "Monday", short: "Mon" },
  { key: "2", label: "Tuesday", short: "Tue" },
  { key: "3", label: "Wednesday", short: "Wed" },
  { key: "4", label: "Thursday", short: "Thu" },
  { key: "5", label: "Friday", short: "Fri" },
  { key: "6", label: "Saturday", short: "Sat" },
  { key: "0", label: "Sunday", short: "Sun" },
];

export function RecurrenceDialog({
  open,
  onOpenChange,
  value,
  onChange,
  dueDate,
}: RecurrenceDialogProps) {
  const [pattern, setPattern] = useState<RecurrencePattern>("none");
  const [customTime, setCustomTime] = useState("09:00");
  const [customInterval, setCustomInterval] = useState(1);
  const [customIntervalUnit, setCustomIntervalUnit] = useState<
    "days" | "weeks" | "months"
  >("days");
  const [selectedWeekdays, setSelectedWeekdays] = useState<WeekdaySelection>(
    {},
  );
  const [endDate, setEndDate] = useState("");
  const [limit, setLimit] = useState<number | null>(null);
  const [runImmediately, setRunImmediately] = useState(false);

  // Initialize form state from value
  useEffect(() => {
    if (value.isRecurring && value.cronExpression) {
      // Parse existing cron expression to determine pattern
      const pattern = parseCronToPattern(value.cronExpression);
      setPattern(pattern);

      // Parse time from cron expression
      const time = parseCronToTime(value.cronExpression);
      setCustomTime(time);

      // Parse weekdays from cron expression
      const weekdays = parseCronToWeekdays(value.cronExpression);
      setSelectedWeekdays(weekdays);
    } else {
      setPattern("none");
    }

    setEndDate(
      value.recurrenceEndDate
        ? formatDateForInput(value.recurrenceEndDate)
        : "",
    );
    setLimit(value.recurrenceLimit);
    setRunImmediately(value.runImmediately);
  }, [value]);

  const formatDateForInput = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch {
      return "";
    }
  };

  const parseCronToPattern = (cron: string): RecurrencePattern => {
    // Simple pattern detection - you can enhance this
    if (cron.includes("* * *")) return "daily";
    if (cron.includes("* * 1-5")) return "weekdays";
    if (
      cron.includes("* * 1") ||
      cron.includes("* * 2") ||
      cron.includes("* * 3") ||
      cron.includes("* * 4") ||
      cron.includes("* * 5") ||
      cron.includes("* * 6") ||
      cron.includes("* * 0")
    )
      return "weekly";
    if (cron.includes("1 * *")) return "monthly";
    return "custom";
  };

  const parseCronToTime = (cron: string): string => {
    const parts = cron.split(" ");
    if (parts.length >= 2) {
      const minutes = parts[0] === "*" ? "00" : parts[0].padStart(2, "0");
      const hours = parts[1] === "*" ? "09" : parts[1].padStart(2, "0");
      return `${hours}:${minutes}`;
    }
    return "09:00";
  };

  const parseCronToWeekdays = (cron: string): WeekdaySelection => {
    const parts = cron.split(" ");
    const weekdays: WeekdaySelection = {};

    if (parts.length >= 5) {
      const dayPart = parts[4];
      if (dayPart === "*") {
        // All days
        WEEKDAYS.forEach((day) => (weekdays[day.key] = true));
      } else if (dayPart === "1-5") {
        // Weekdays
        ["1", "2", "3", "4", "5"].forEach((day) => (weekdays[day] = true));
      } else if (dayPart.includes(",")) {
        // Specific days
        dayPart.split(",").forEach((day) => (weekdays[day.trim()] = true));
      } else {
        // Single day
        weekdays[dayPart] = true;
      }
    }

    return weekdays;
  };

  const generateCronExpression = (): string | null => {
    if (pattern === "none") return null;

    const [hours, minutes] = customTime.split(":");
    const h = parseInt(hours, 10);
    const m = parseInt(minutes, 10);

    switch (pattern) {
      case "daily":
        return `${m} ${h} * * *`;
      case "weekly": {
        // Use current day of week from due date or today
        const dayOfWeek = dueDate
          ? new Date(dueDate).getDay()
          : new Date().getDay();
        return `${m} ${h} * * ${dayOfWeek}`;
      }
      case "monthly": {
        // Use current day of month from due date or today
        const dayOfMonth = dueDate
          ? new Date(dueDate).getDate()
          : new Date().getDate();
        return `${m} ${h} ${dayOfMonth} * *`;
      }
      case "weekdays":
        return `${m} ${h} * * 1-5`;
      case "custom": {
        const selectedDays = Object.keys(selectedWeekdays)
          .filter((key) => selectedWeekdays[key])
          .join(",");

        if (customIntervalUnit === "days") {
          if (customInterval === 1) {
            return `${m} ${h} * * *`;
          } else {
            // For intervals > 1 day, we'd need more complex logic
            return `${m} ${h} */${customInterval} * *`;
          }
        } else if (customIntervalUnit === "weeks") {
          return `${m} ${h} * * ${selectedDays}`;
        } else if (customIntervalUnit === "months") {
          return `${m} ${h} * */${customInterval} *`;
        }
        return `${m} ${h} * * ${selectedDays}`;
      }
      default:
        return null;
    }
  };

  const getPreviewText = (): string => {
    if (pattern === "none") return "No recurrence";

    const time = customTime;
    const endDateText = endDate
      ? ` until ${new Date(endDate).toLocaleDateString()}`
      : "";
    const limitText = limit ? ` (max ${limit} times)` : "";

    switch (pattern) {
      case "daily":
        return `Every day at ${time}${endDateText}${limitText}`;
      case "weekly": {
        const dayName = dueDate
          ? new Date(dueDate).toLocaleDateString(undefined, { weekday: "long" })
          : "same day";
        return `Every week on ${dayName} at ${time}${endDateText}${limitText}`;
      }
      case "monthly": {
        const dayNum = dueDate
          ? new Date(dueDate).getDate()
          : new Date().getDate();
        const suffix = getDateSuffix(dayNum);
        return `Every month on the ${dayNum}${suffix} at ${time}${endDateText}${limitText}`;
      }
      case "weekdays":
        return `Every weekday at ${time}${endDateText}${limitText}`;
      case "custom": {
        const selectedDays = Object.keys(selectedWeekdays)
          .filter((key) => selectedWeekdays[key])
          .map((key) => WEEKDAYS.find((w) => w.key === key)?.short)
          .join(", ");

        if (customIntervalUnit === "days") {
          return `Every ${customInterval === 1 ? "" : `${customInterval} `}day${customInterval === 1 ? "" : "s"} at ${time}${endDateText}${limitText}`;
        } else if (customIntervalUnit === "weeks") {
          return `Every ${customInterval === 1 ? "" : `${customInterval} `}week${customInterval === 1 ? "" : "s"} on ${selectedDays} at ${time}${endDateText}${limitText}`;
        } else {
          return `Every ${customInterval === 1 ? "" : `${customInterval} `}month${customInterval === 1 ? "" : "s"} at ${time}${endDateText}${limitText}`;
        }
      }
      default:
        return "Custom schedule";
    }
  };

  const getDateSuffix = (day: number): string => {
    if (day >= 11 && day <= 13) return "th";
    switch (day % 10) {
      case 1:
        return "st";
      case 2:
        return "nd";
      case 3:
        return "rd";
      default:
        return "th";
    }
  };

  const handleWeekdayChange = (dayKey: string, checked: boolean) => {
    setSelectedWeekdays((prev) => ({
      ...prev,
      [dayKey]: checked,
    }));
  };

  const handleSave = () => {
    const cronExpression = generateCronExpression();
    const config: RecurrenceConfig = {
      isRecurring: pattern !== "none",
      cronExpression,
      recurrenceEndDate: endDate ? new Date(endDate).toISOString() : null,
      recurrenceLimit: limit,
      runImmediately,
    };

    onChange(config);
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Task Recurrence
          </DialogTitle>
          <DialogDescription>
            Configure when and how often this task should repeat
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Recurrence Pattern */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Recurrence Pattern</Label>
            <RadioGroup
              value={pattern}
              onValueChange={(value) => setPattern(value as RecurrencePattern)}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="none" id="none" />
                <Label htmlFor="none">None - Don't repeat this task</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="daily" id="daily" />
                <Label htmlFor="daily">
                  Daily - Every day at the same time
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="weekly" id="weekly" />
                <Label htmlFor="weekly">
                  Weekly - Every week on the same day
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="monthly" id="monthly" />
                <Label htmlFor="monthly">
                  Monthly - Every month on the same date
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="weekdays" id="weekdays" />
                <Label htmlFor="weekdays">
                  Weekdays - Monday through Friday
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="custom" id="custom" />
                <Label htmlFor="custom">Custom - Advanced options</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Custom Options */}
          {pattern === "custom" && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
              <Label className="text-sm font-medium">Custom Schedule</Label>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="interval">Repeat every</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      id="interval"
                      type="number"
                      min="1"
                      max="365"
                      value={customInterval}
                      onChange={(e) =>
                        setCustomInterval(
                          Math.max(1, parseInt(e.target.value) || 1),
                        )
                      }
                      className="w-20"
                    />
                    <Select
                      value={customIntervalUnit}
                      onValueChange={(value) =>
                        setCustomIntervalUnit(value as any)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="days">Days</SelectItem>
                        <SelectItem value="weeks">Weeks</SelectItem>
                        <SelectItem value="months">Months</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="time">At time</Label>
                  <Input
                    id="time"
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              {customIntervalUnit === "weeks" && (
                <div>
                  <Label>On days</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {WEEKDAYS.map((day) => (
                      <div
                        key={day.key}
                        className="flex items-center space-x-2"
                      >
                        <Checkbox
                          id={day.key}
                          checked={selectedWeekdays[day.key] || false}
                          onCheckedChange={(checked) =>
                            handleWeekdayChange(day.key, checked === true)
                          }
                        />
                        <Label htmlFor={day.key} className="text-sm">
                          {day.short}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Time setting for non-custom patterns */}
          {pattern !== "none" && pattern !== "custom" && (
            <div className="space-y-2">
              <Label
                htmlFor="schedule-time"
                className="flex items-center gap-2"
              >
                <Clock className="h-4 w-4" />
                Time
              </Label>
              <Input
                id="schedule-time"
                type="time"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                className="w-40"
              />
            </div>
          )}

          <Separator />

          {/* End Conditions */}
          {pattern !== "none" && (
            <div className="space-y-4">
              <Label className="text-base font-medium">
                End Conditions (Optional)
              </Label>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="end-date" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    End after date
                  </Label>
                  <Input
                    id="end-date"
                    type="datetime-local"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-60"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="limit">End after number of executions</Label>
                  <Input
                    id="limit"
                    type="number"
                    min="1"
                    max="1000"
                    value={limit || ""}
                    onChange={(e) =>
                      setLimit(e.target.value ? parseInt(e.target.value) : null)
                    }
                    placeholder="No limit"
                    className="w-40"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="run-immediately"
                    checked={runImmediately}
                    onCheckedChange={(checked) =>
                      setRunImmediately(checked === true)
                    }
                  />
                  <Label htmlFor="run-immediately">
                    Run the first execution immediately
                  </Label>
                </div>
              </div>
            </div>
          )}

          {/* Preview */}
          {pattern !== "none" && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <Label className="text-sm font-medium text-blue-800">
                Preview
              </Label>
              <p className="text-sm text-blue-700 mt-1">{getPreviewText()}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Recurrence</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
