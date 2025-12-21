
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface MobileBackButtonProps {
  /** Optional custom back action. If not provided, uses window.history.back() */
  onBack?: () => void;
  /** Optional custom route to navigate to instead of going back */
  href?: string;
  /** Additional CSS classes */
  className?: string;
  /** Show the back button even on desktop (default: mobile only) */
  showOnDesktop?: boolean;
}

export function MobileBackButton({
  onBack,
  href,
  className,
  showOnDesktop = false,
}: MobileBackButtonProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // Don't render on desktop unless explicitly requested
  if (!isMobile && !showOnDesktop) {
    return null;
  }

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (href) {
      navigate({ to: href });
    } else {
      // Fallback: if no history, go to dashboard
      if (window.history.length <= 1) {
        navigate({ to: "/dashboard" });
      } else {
        window.history.back();
      }
    }
  };

  return (
    <button
      onClick={handleBack}
      className={cn(
        "flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted transition-colors",
        "touch-manipulation", // Better touch handling on mobile
        className,
      )}
      aria-label="Go back"
    >
      <ChevronLeft className="h-4 w-4" />
    </button>
  );
}
