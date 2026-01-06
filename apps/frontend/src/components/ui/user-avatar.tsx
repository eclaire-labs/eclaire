import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { User } from "@/types/user";

// Predefined avatar colors - vibrant and accessible
export const AVATAR_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-green-500",
  "bg-teal-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-rose-500",
] as const;

export type AvatarColor = (typeof AVATAR_COLORS)[number];

interface UserAvatarProps {
  user: Pick<User, "displayName" | "fullName" | "email" | "avatarUrl"> & {
    avatarColor?: string;
    id?: string;
  };
  size?: "sm" | "md" | "lg";
  className?: string;
}

// Generate a consistent color based on user ID or email
function generateAvatarColor(seed: string): AvatarColor {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) & 0xffffffff;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// Get user initials for fallback
function getUserInitials(user: UserAvatarProps["user"]): string {
  if (user.displayName) {
    return user.displayName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  }

  if (user.fullName) {
    return user.fullName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  }

  if (user.email) {
    return user.email.substring(0, 2).toUpperCase();
  }

  return "??";
}

const sizeClasses = {
  sm: "h-6 w-6 text-xs",
  md: "h-8 w-8 text-sm",
  lg: "h-16 w-16 text-lg",
};

export function UserAvatar({ user, size = "md", className }: UserAvatarProps) {
  const initials = getUserInitials(user);
  const seed = user.id || user.email || "default";
  const avatarColor =
    user.avatarColor && AVATAR_COLORS.includes(user.avatarColor as AvatarColor)
      ? user.avatarColor
      : generateAvatarColor(seed);

  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      <AvatarImage
        src={user.avatarUrl || undefined}
        alt={user.displayName || user.fullName || user.email || "User"}
      />
      <AvatarFallback className={cn("text-white font-medium", avatarColor)}>
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
