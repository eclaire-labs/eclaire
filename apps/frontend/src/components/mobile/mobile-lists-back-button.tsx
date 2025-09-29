"use client";

import { ChevronLeft } from "lucide-react";
import { useMobileNavigationSafe } from "@/contexts/mobile-navigation-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface MobileListsBackButtonProps {
  /** Additional CSS classes */
  className?: string;
  /** Show the back button even on desktop (default: mobile only) */
  showOnDesktop?: boolean;
}

export function MobileListsBackButton({
  className,
  showOnDesktop = false,
}: MobileListsBackButtonProps) {
  const isMobile = useIsMobile();
  const mobileNavigation = useMobileNavigationSafe(); // Safe hook that won't throw on desktop

  // Don't render on desktop unless explicitly requested
  if (!isMobile && !showOnDesktop) {
    return null;
  }

  const handleBackToLists = () => {
    // Only execute if we have mobile navigation context (should always be true on mobile)
    if (mobileNavigation) {
      mobileNavigation.setCurrentMobileTab("folders");
      mobileNavigation.setFoldersSheetOpen(true);
    }
  };

  return (
    <button
      onClick={handleBackToLists}
      className={cn(
        "flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted transition-colors",
        "touch-manipulation", // Better touch handling on mobile
        className,
      )}
      aria-label="Back to Lists"
    >
      <ChevronLeft className="h-4 w-4" />
    </button>
  );
}
