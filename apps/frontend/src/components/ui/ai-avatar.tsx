import { Bot } from "lucide-react";
import * as React from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface AIAvatarProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-16 w-16",
};

const iconSizeClasses = {
  sm: "h-3 w-3",
  md: "h-5 w-5",
  lg: "h-8 w-8",
};

export function AIAvatar({ size = "md", className }: AIAvatarProps) {
  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
        <Bot className={iconSizeClasses[size]} />
      </AvatarFallback>
    </Avatar>
  );
}
