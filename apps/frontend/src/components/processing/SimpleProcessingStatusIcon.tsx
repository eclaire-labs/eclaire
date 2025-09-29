"use client";

import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
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
  enabled?: boolean; // Whether processing is enabled
  className?: string;
}

export function SimpleProcessingStatusIcon({
  status,
  enabled = true,
  className = "",
}: SimpleProcessingStatusIconProps) {
  const router = useRouter();
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
    enabled === false
  ) {
    return null;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push("/processing");
  };

  const getStatusIcon = () => {
    const iconClass =
      "h-4 w-4 cursor-pointer hover:scale-110 transition-transform";

    switch (status) {
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
    const baseText = status?.replace("_", " ") || "unknown";
    return `Processing ${baseText}. Click to view details.`;
  };

  const icon = getStatusIcon();
  if (!icon) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`inline-flex items-center justify-center ${className}`}
            onClick={handleClick}
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
