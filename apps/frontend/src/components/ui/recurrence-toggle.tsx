import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  type RecurrenceConfig,
  RecurrenceDialog,
} from "@/components/ui/recurrence-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RecurrenceToggleProps {
  value: RecurrenceConfig;
  onChange: (config: RecurrenceConfig) => void;
  dueDate?: string | null;
  disabled?: boolean;
  className?: string;
}

export function RecurrenceToggle({
  value,
  onChange,
  dueDate,
  disabled = false,
  className,
}: RecurrenceToggleProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const getRecurrenceText = (): string => {
    if (!value.isRecurring) return "No recurrence";

    // Simple text representation - you can enhance this
    if (value.cronExpression) {
      // Parse basic patterns
      const cron = value.cronExpression;
      if (cron.includes("* * *")) return "Daily";
      if (cron.includes("* * 1-5")) return "Weekdays";
      if (
        cron.includes("* * 1") ||
        cron.includes("* * 2") ||
        cron.includes("* * 3") ||
        cron.includes("* * 4") ||
        cron.includes("* * 5") ||
        cron.includes("* * 6") ||
        cron.includes("* * 0")
      )
        return "Weekly";
      if (
        cron.includes("1 * *") ||
        cron.includes("2 * *") ||
        cron.includes("3 * *")
      )
        return "Monthly";
      return "Custom";
    }

    return "Recurring";
  };

  const isRecurring = value.isRecurring;

  return (
    <TooltipProvider>
      <div className={`space-y-2 ${className}`}>
        <Label className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Recurrence
        </Label>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={isRecurring ? "default" : "outline"}
                size="sm"
                onClick={() => setDialogOpen(true)}
                disabled={disabled}
                className="flex items-center gap-2"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isRecurring ? "animate-spin" : ""}`}
                />
                {getRecurrenceText()}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Configure task recurrence</p>
            </TooltipContent>
          </Tooltip>

          {isRecurring && (
            <div className="text-xs text-muted-foreground">
              {value.recurrenceEndDate && (
                <span>
                  Until {new Date(value.recurrenceEndDate).toLocaleDateString()}
                </span>
              )}
              {value.recurrenceLimit && (
                <span>
                  {value.recurrenceEndDate ? " • " : ""}Max{" "}
                  {value.recurrenceLimit} times
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <RecurrenceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        value={value}
        onChange={onChange}
        dueDate={dueDate}
      />
    </TooltipProvider>
  );
}
