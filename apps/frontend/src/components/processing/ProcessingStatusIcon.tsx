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
import {
  type AssetType,
  useProcessingStatus,
} from "@/hooks/use-processing-status";

interface ProcessingStatusIconProps {
  assetType: AssetType;
  assetId: string;
  className?: string;
}

export function ProcessingStatusIcon({
  assetType,
  assetId,
  className = "",
}: ProcessingStatusIconProps) {
  const { status, isLoading } = useProcessingStatus(assetType, assetId);
  const navigate = useNavigate();
  const [showCompleted, setShowCompleted] = useState(true);

  // Hide completed status after 10 seconds
  useEffect(() => {
    if (status?.status === "completed" && showCompleted) {
      const timer = setTimeout(() => {
        setShowCompleted(false);
      }, 10000); // 10 seconds

      return () => clearTimeout(timer);
    }
  }, [status?.status, showCompleted]);

  // Reset showCompleted when status changes from completed to something else
  useEffect(() => {
    if (status?.status !== "completed") {
      setShowCompleted(true);
    }
  }, [status?.status]);

  if (isLoading || !status || status.status === "unknown") {
    return null;
  }

  // Don't show completed status after timeout
  if (status.status === "completed" && !showCompleted) {
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

    switch (status.status) {
      case "pending":
        return <Clock className={`${iconClass} text-yellow-500`} />;
      case "processing":
        return (
          <Loader2 className={`${iconClass} text-blue-500 animate-spin`} />
        );
      case "completed":
        return <CheckCircle className={`${iconClass} text-green-500`} />;
      case "failed":
        return <XCircle className={`${iconClass} text-red-500`} />;
      case "retry_pending":
        return <AlertTriangle className={`${iconClass} text-orange-500`} />;
      default:
        return null;
    }
  };

  const getTooltipText = () => {
    const baseText = status.status.replace("_", " ");
    const progress =
      status.overallProgress > 0 ? ` (${status.overallProgress}%)` : "";
    const stage = status.currentStage ? ` - ${status.currentStage}` : "";

    return `Processing ${baseText}${progress}${stage}. Click to view details.`;
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
