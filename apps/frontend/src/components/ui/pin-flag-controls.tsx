
import { Flag, Pin } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface PinFlagControlsProps {
  isPinned: boolean;
  flagColor: "red" | "yellow" | "orange" | "green" | "blue" | null;
  onPinToggle: () => void;
  onFlagToggle: () => void;
  onFlagColorChange: (
    color: "red" | "yellow" | "orange" | "green" | "blue",
  ) => void;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const flagColors = {
  red: "text-red-500 hover:text-red-600",
  yellow: "text-yellow-500 hover:text-yellow-600",
  orange: "text-orange-500 hover:text-orange-600",
  green: "text-green-500 hover:text-green-600",
  blue: "text-blue-500 hover:text-blue-600",
};

const flagColorLabels = {
  red: "Red Flag",
  yellow: "Yellow Flag",
  orange: "Orange Flag",
  green: "Green Flag",
  blue: "Blue Flag",
};

export function PinFlagControls({
  isPinned,
  flagColor,
  onPinToggle,
  onFlagToggle,
  onFlagColorChange,
  className,
  size = "md",
}: PinFlagControlsProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const iconSize = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  }[size];

  const buttonSize = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-10 w-10",
  }[size];

  const handleFlagStart = useCallback(() => {
    setIsLongPressing(false);
    longPressTimer.current = setTimeout(() => {
      setIsLongPressing(true);
      setDropdownOpen(true);
    }, 500); // 500ms for long press
  }, []);

  const handleFlagEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    // Only trigger toggle if it wasn't a long press
    if (!isLongPressing && !dropdownOpen) {
      onFlagToggle();
    }
    setIsLongPressing(false);
  }, [isLongPressing, dropdownOpen, onFlagToggle]);

  const handleFlagMouseLeave = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setIsLongPressing(false);
  }, []);

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {/* Pin Control */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              buttonSize,
              isPinned
                ? "text-blue-600 hover:text-blue-700"
                : "text-gray-400 hover:text-gray-600",
            )}
            onClick={(e) => {
              e.stopPropagation();
              onPinToggle();
            }}
          >
            <Pin className={cn(iconSize, isPinned ? "fill-current" : "")} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isPinned ? "Unpin" : "Pin"}</TooltipContent>
      </Tooltip>

      {/* Flag Control with Dropdown Menu */}
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    buttonSize,
                    flagColor
                      ? flagColors[flagColor]
                      : "text-gray-400 hover:text-gray-600",
                  )}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    handleFlagStart();
                  }}
                  onMouseUp={(e) => {
                    e.stopPropagation();
                    handleFlagEnd();
                  }}
                  onMouseLeave={handleFlagMouseLeave}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    handleFlagStart();
                  }}
                  onTouchEnd={(e) => {
                    e.stopPropagation();
                    handleFlagEnd();
                  }}
                >
                  <Flag
                    className={cn(iconSize, flagColor ? "fill-current" : "")}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {flagColor
                  ? `${flagColorLabels[flagColor]} (Long-press for more colors)`
                  : "Add Flag (Long-press for colors)"}
              </TooltipContent>
            </Tooltip>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
          {Object.entries(flagColors).map(([color, colorClass]) => (
            <DropdownMenuItem
              key={color}
              onClick={(e) => {
                e.stopPropagation();
                onFlagColorChange(color as keyof typeof flagColors);
                setDropdownOpen(false);
              }}
              className="flex items-center gap-2"
            >
              <Flag className={cn("h-4 w-4 fill-current", colorClass)} />
              {flagColorLabels[color as keyof typeof flagColorLabels]}
            </DropdownMenuItem>
          ))}
          {flagColor && (
            <>
              <div className="h-px bg-border my-1" />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onFlagToggle();
                  setDropdownOpen(false);
                }}
                className="text-muted-foreground"
              >
                Remove Flag
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
