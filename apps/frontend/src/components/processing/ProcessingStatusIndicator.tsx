"use client";

import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  Play,
  RefreshCw,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
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

// User-friendly stage names (shared with processing page)
const stageNames: Record<string, string> = {
  // Common stages
  result_saving: "Saving Results",
  result_processing: "Saving Results",
  ai_processing: "AI Analysis",
  ai_analysis: "AI Analysis",
  text_extraction: "Text Extraction",
  thumbnail_generation: "Creating Thumbnail",
  metadata_extraction: "Extracting Metadata",
  vector_embedding: "Creating Search Index",
  initialization: "Starting Process",
  validation: "Validating Input",
  cleanup: "Cleaning Up",
  completion: "Finalizing",

  // Photo-specific stages
  image_preparation: "Preparing Image",
  image_conversion: "Converting Image",
  image_analysis: "Analyzing Image",

  // Document-specific stages
  pdf_generation: "Generating PDF",
  file_processing: "Processing File",
  document_parsing: "Parsing Document",
  content_extraction: "Extracting Content",

  // Bookmark-specific stages
  content_analysis: "Extracting Content",
  ai_tagging: "AI Analysis",
  bookmark_processing: "Processing Bookmark",

  // Note-specific stages
  note_processing: "Processing Note",

  // Python worker stages
  document_download: "Downloading Document",
  docling_processing: "Text Extraction",
  output_generation: "Generating Output",
  text_preparation: "Preparing Text",
  embedding_generation: "Creating Embeddings",
  index_creation: "Building Search Index",
  result_storage: "Storing Results",
};

function getFriendlyStage(stage?: string): string {
  if (!stage) return "—";
  return (
    stageNames[stage] ||
    stage.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
  );
}

interface ProcessingStatusIndicatorProps {
  assetType: AssetType;
  assetId: string;
  variant?: "compact" | "detailed" | "inline";
  showRetry?: boolean;
  className?: string;
}

export function ProcessingStatusIndicator({
  assetType,
  assetId,
  variant = "compact",
  showRetry = true,
  className = "",
}: ProcessingStatusIndicatorProps) {
  const { status, isLoading, isConnected, retry, refresh, isRetrying } =
    useProcessingStatus(assetType, assetId);

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Loading status...</span>
      </div>
    );
  }

  if (!status || status.status === "unknown") {
    return null;
  }

  // Status badge styling
  const getStatusBadge = () => {
    switch (status.status) {
      case "pending":
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        );
      case "processing":
        return (
          <Badge variant="default" className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Processing
          </Badge>
        );
      case "completed":
        return (
          <Badge
            variant="default"
            className="bg-green-500 hover:bg-green-600 flex items-center gap-1"
          >
            <CheckCircle className="h-3 w-3" />
            Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            Failed
          </Badge>
        );
      case "retry_pending":
        return (
          <Badge variant="outline" className="flex items-center gap-1">
            <RefreshCw className="h-3 w-3" />
            Retrying
          </Badge>
        );
      default:
        return null;
    }
  };

  // Inline variant - minimal display
  if (variant === "inline") {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {getStatusBadge()}
        {status.status === "processing" && (
          <div className="flex items-center gap-1">
            <Progress value={status.overallProgress} className="w-16 h-2" />
            <span className="text-xs text-muted-foreground">
              {status.overallProgress}%
            </span>
          </div>
        )}
      </div>
    );
  }

  // Compact variant
  if (variant === "compact") {
    return (
      <TooltipProvider>
        <div
          className={`flex items-center gap-3 p-3 rounded-lg border bg-card ${className}`}
        >
          <div className="flex items-center gap-2">
            {getStatusBadge()}
            <div className="flex items-center gap-1">
              {isConnected ? (
                <Wifi className="h-3 w-3 text-green-500" />
              ) : (
                <WifiOff className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
          </div>

          {(status.status === "processing" || status.status === "pending") && (
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Progress value={status.overallProgress} className="flex-1" />
                <span className="text-sm font-medium">
                  {status.overallProgress}%
                </span>
              </div>
              {status.currentStage && (
                <p className="text-xs text-muted-foreground mt-1">
                  Current: {getFriendlyStage(status.currentStage)}
                </p>
              )}
            </div>
          )}

          {status.error && (
            <Tooltip>
              <TooltipTrigger>
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">{status.error}</p>
              </TooltipContent>
            </Tooltip>
          )}

          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={refresh}
                  className="h-8 w-8 p-0"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Refresh status</p>
              </TooltipContent>
            </Tooltip>

            {showRetry && status.canRetry && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={retry}
                    disabled={isRetrying}
                    className="h-8 w-8 p-0"
                  >
                    {isRetrying ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Retry processing</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </TooltipProvider>
    );
  }

  // Detailed variant
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg">Processing Status</CardTitle>
            {getStatusBadge()}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {isConnected ? (
                <Wifi className="h-4 w-4 text-green-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">
                {isConnected ? "Live" : "Offline"}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              className="flex items-center gap-1"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </Button>
            {showRetry && status.canRetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={retry}
                disabled={isRetrying}
                className="flex items-center gap-1"
              >
                {isRetrying ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
                Retry
              </Button>
            )}
          </div>
        </div>

        {status.currentStage && (
          <CardDescription>
            Current stage: {status.currentStage}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Overall Progress */}
        {(status.status === "processing" || status.status === "pending") && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Overall Progress</span>
              <span className="text-sm text-muted-foreground">
                {status.overallProgress}%
              </span>
            </div>
            <Progress value={status.overallProgress} className="w-full" />
            {status.estimatedCompletion && (
              <p className="text-xs text-muted-foreground">
                Estimated completion:{" "}
                {formatDistanceToNow(new Date(status.estimatedCompletion), {
                  addSuffix: true,
                })}
              </p>
            )}
          </div>
        )}

        {/* Stages */}
        {status.stages && status.stages.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Processing Stages</h4>
            <div className="space-y-2">
              {status.stages.map((stage, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 rounded border"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      {stage.status === "completed" && (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                      {stage.status === "processing" && (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      )}
                      {stage.status === "failed" && (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      {stage.status === "pending" && (
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <span className="text-sm font-medium">
                      {getFriendlyStage(stage.name)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {stage.status === "processing" && (
                      <>
                        <Progress value={stage.progress} className="w-16 h-2" />
                        <span className="text-xs text-muted-foreground w-8 text-right">
                          {stage.progress}%
                        </span>
                      </>
                    )}
                    {stage.error && (
                      <Tooltip>
                        <TooltipTrigger>
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">{stage.error}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error Information */}
        {status.error && (
          <>
            <Separator />
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">Processing Error</p>
                  <p className="text-sm">{status.error}</p>
                  {status.retryCount > 0 && (
                    <p className="text-xs">
                      Retry attempts: {status.retryCount}
                    </p>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          </>
        )}
      </CardContent>
    </Card>
  );
}
