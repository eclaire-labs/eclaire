import { Calendar, CalendarDays, Clock, } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DueDatePickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}

const formatDateForInput = (isoString: string | null | undefined): string => {
  if (!isoString) return "";
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

const formatDateDisplay = (dateString: string | null | undefined) => {
  if (!dateString) return "No due date set";
  try {
    const date = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const dateOnly = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );

    if (dateOnly.getTime() === today.getTime()) {
      return `Today at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    } else if (dateOnly.getTime() === tomorrow.getTime()) {
      return `Tomorrow at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    } else {
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  } catch (error) {
    console.error("Error formatting date:", dateString, error);
    return "Invalid Date";
  }
};

export function DueDatePicker({
  value,
  onChange,
  disabled,
}: DueDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");

  const handleQuickSelect = (option: "today" | "tomorrow" | "nextWeek") => {
    const _now = new Date();
    const date = new Date();

    switch (option) {
      case "today":
        date.setHours(17, 0, 0, 0); // 5 PM today
        break;
      case "tomorrow":
        date.setDate(date.getDate() + 1);
        date.setHours(17, 0, 0, 0); // 5 PM tomorrow
        break;
      case "nextWeek":
        date.setDate(date.getDate() + 7);
        date.setHours(17, 0, 0, 0); // 5 PM next week
        break;
    }

    onChange(date.toISOString());
    setIsOpen(false);
    setShowCustom(false);
  };

  const handleCustomSubmit = () => {
    if (customValue) {
      onChange(new Date(customValue).toISOString());
    }
    setIsOpen(false);
    setShowCustom(false);
    setCustomValue("");
  };

  const handleCustomCancel = () => {
    setShowCustom(false);
    setCustomValue("");
  };

  const handleClear = () => {
    onChange(null);
    setIsOpen(false);
    setShowCustom(false);
  };

  return (
    <div>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-start text-left font-normal"
            disabled={disabled}
          >
            <Calendar className="mr-2 h-4 w-4" />
            {formatDateDisplay(value)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          {!showCustom ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">Quick Select</div>
              <div className="grid gap-2">
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => handleQuickSelect("today")}
                >
                  <CalendarDays className="mr-2 h-4 w-4" />
                  Today (5:00 PM)
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => handleQuickSelect("tomorrow")}
                >
                  <CalendarDays className="mr-2 h-4 w-4" />
                  Tomorrow (5:00 PM)
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => handleQuickSelect("nextWeek")}
                >
                  <CalendarDays className="mr-2 h-4 w-4" />
                  Next Week (5:00 PM)
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => {
                    setShowCustom(true);
                    setCustomValue(formatDateForInput(value));
                  }}
                >
                  <Clock className="mr-2 h-4 w-4" />
                  Custom...
                </Button>
              </div>
              {value && (
                <div className="pt-2 border-t">
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-red-600 hover:text-red-700"
                    onClick={handleClear}
                  >
                    Clear due date
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm font-medium">Custom Date & Time</div>
              <Input
                type="datetime-local"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                className="w-full"
              />
              <div className="flex gap-2">
                <Button onClick={handleCustomSubmit} className="flex-1">
                  Set Date
                </Button>
                <Button variant="outline" onClick={handleCustomCancel}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
