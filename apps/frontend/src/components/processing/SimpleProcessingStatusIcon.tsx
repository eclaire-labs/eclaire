import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ProcessingStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "retry_pending"
  | null;

interface SimpleProcessingStatusIconProps {
  status: ProcessingStatus;
  processingEnabled?: boolean; // Whether processing is enabled
  className?: string;
}

export function SimpleProcessingStatusIcon({
  status,
  processingEnabled = true,
  className = "",
}: SimpleProcessingStatusIconProps) {
  const navigate = useNavigate();
  const [showCompleted, setShowCompleted] = useState(true);

  // Hide completed status after 10 seconds
  useEffect(() => {
    if (status === "completed" && showCompleted) {
      const timer = setTimeout(() => {
        setShowCompleted(false);
      }, 10000); // 10 seconds

      return () => clearTimeout(timer);
    }
  }, [status, showCompleted]);

  // Reset showCompleted when status changes from completed to something else
  useEffect(() => {
    if (status !== "completed") {
      setShowCompleted(true);
    }
  }, [status]);

  if (
    !status ||
    (status === "completed" && !showCompleted) ||
    processingEnabled === false
  ) {
    return null;
  }

  const handleClick = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate({ to: "/processing" });
  };

  const getStatusIcon = () => {
    const iconClass =
      "h-4 w-4 cursor-pointer hover:scale-110 transition-transform";

    switch (status) {
      case "pending":
        return <Clock className={`${iconClass} text-warning`} />;
      case "processing":
        return <Loader2 className={`${iconClass} text-info animate-spin`} />;
      case "completed":
        return <CheckCircle className={`${iconClass} text-success`} />;
      case "failed":
        return <XCircle className={`${iconClass} text-destructive`} />;
      case "retry_pending":
        return <AlertTriangle className={`${iconClass} text-warning`} />;
      default:
        return null;
    }
  };

  const getTooltipText = () => {
    const baseText = status?.replace("_", " ") || "unknown";
    return `Processing ${baseText}. Click to view details.`;
  };

  const icon = getStatusIcon();
  if (!icon) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* biome-ignore lint/a11y/useSemanticElements: icon wrapper not suited for button element */}
          <div
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
            role="button"
            tabIndex={0}
            className={`inline-flex items-center justify-center ${className}`}
            onClick={handleClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick(e);
              }
            }}
          >
            {icon}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs">{getTooltipText()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
