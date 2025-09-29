"use client";

import { Check } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { AVATAR_COLORS, type AvatarColor } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

interface AvatarColorPickerProps {
  selectedColor: string;
  onColorChange: (color: string) => void;
  className?: string;
}

export function AvatarColorPicker({
  selectedColor,
  onColorChange,
  className,
}: AvatarColorPickerProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {AVATAR_COLORS.map((color) => (
        <Button
          key={color}
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "relative h-8 w-8 rounded-full p-0 hover:scale-110 transition-transform",
            color,
          )}
          onClick={() => onColorChange(color)}
        >
          {selectedColor === color && (
            <Check className="h-4 w-4 text-white drop-shadow-sm" />
          )}
          <span className="sr-only">Select {color} color</span>
        </Button>
      ))}
    </div>
  );
}
