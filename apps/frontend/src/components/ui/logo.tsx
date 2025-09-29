"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  priority?: boolean;
  variant?: "default" | "auth";
}

export function Logo({
  className,
  priority = false,
  variant = "default",
}: LogoProps) {
  // For auth variant, always use white logo and white text
  const logoSrc = variant === "auth" ? "/logo-light.png" : "/logo.png";
  const textClassName =
    variant === "auth"
      ? "font-normal text-xl text-white"
      : "font-normal text-xl text-foreground";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Image
        src={logoSrc}
        alt="Eclaire Logo"
        width={32}
        height={32}
        priority={priority}
        className="h-8 w-auto object-contain"
      />
      <span className={textClassName} style={{ fontFamily: "Arial" }}>
        ECLAIRE
      </span>
    </div>
  );
}
