import { useNavigate } from "@tanstack/react-router";
import { Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ProcessingStatusBadgeProps {
  contentType: string;
  itemId: string;
  processingStatus: string | null;
  enabled?: boolean;
  isJobStuck: boolean;
  isReprocessing: boolean;
  onReprocessClick: () => void;
}

export function ProcessingStatusBadge({
  contentType,
  itemId,
  processingStatus,
  enabled = true,
  isJobStuck,
  isReprocessing,
  onReprocessClick,
}: ProcessingStatusBadgeProps) {
  const navigate = useNavigate();

  const disabled = enabled === false;

  const variant = disabled
    ? "outline"
    : processingStatus === "completed"
      ? "default"
      : processingStatus === "failed"
        ? "destructive"
        : "secondary";

  const showReprocess =
    !disabled &&
    (processingStatus === "completed" ||
      processingStatus === "failed" ||
      isJobStuck);

  return (
    <div className="flex items-center gap-2">
      <Badge
        variant={variant}
        className={
          !disabled ? "cursor-pointer hover:opacity-80 transition-opacity" : ""
        }
        onClick={
          !disabled
            ? () =>
                navigate({
                  to: `/processing?assetType=${contentType}&assetId=${itemId}`,
                })
            : undefined
        }
        title={
          !disabled
            ? "Click to view processing details"
            : `Processing is disabled for this ${contentType.replace(/s$/, "")}`
        }
      >
        {disabled ? (
          "disabled"
        ) : processingStatus === "processing" ? (
          <span className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            processing
          </span>
        ) : (
          (processingStatus || "unknown").replace(/_/g, " ")
        )}
      </Badge>

      {showReprocess && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onReprocessClick}
          disabled={isReprocessing}
          title={`Reprocess ${contentType.replace(/s$/, "")}`}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
