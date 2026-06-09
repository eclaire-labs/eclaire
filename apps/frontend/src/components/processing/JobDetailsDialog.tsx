import { CheckCircle, Clock, Loader2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { ProcessingJob } from "@/hooks/use-processing-jobs";
import { useAssetDetails } from "@/hooks/use-processing-jobs";

import {
  getFriendlyStage,
  statusColors,
  statusIcons,
} from "./processing-job-utils";

export function JobDetailsDialog({ job }: { job: ProcessingJob }) {
  // Fetch asset details when dialog opens
  const { assetDetails, isLoadingAsset } = useAssetDetails(
    job.assetType,
    job.assetId,
  );

  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return "—";
    return new Date(timestamp * 1000).toLocaleString();
  };

  const formatDuration = (start?: number, end?: number) => {
    if (!start) return "—";
    if (!end) return "In progress";
    const duration = end - start;
    if (duration < 60) return `${duration}s`;
    if (duration < 3600)
      return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
  };

  const totalDuration = formatDuration(job.startedAt, job.completedAt);

  const getAssetDisplayName = () => {
    if (isLoadingAsset) return "Loading...";
    if (!assetDetails) return "Unknown";

    return (
      assetDetails.title ||
      assetDetails.name ||
      assetDetails.originalFilename ||
      assetDetails.url ||
      "Untitled"
    );
  };

  return (
    <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Processing Job Details</DialogTitle>
        <DialogDescription>
          View detailed information about this processing job including status,
          progress, and stage details.
        </DialogDescription>
        <div className="space-y-1 pt-2">
          <div className="flex items-center gap-2">
            <span className="font-medium">{job.assetType}</span>
            <span className="text-muted-foreground">•</span>
            <span className="font-mono text-sm">{job.assetId}</span>
          </div>
          <div className="text-sm">
            <span className="font-medium">Asset:</span> {getAssetDisplayName()}
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-6">
        {/* Job Overview */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Status</div>
            <div className="flex items-center gap-2">
              {statusIcons[job.status]}
              <Badge className={statusColors[job.status]}>
                {job.status.replace("_", " ")}
              </Badge>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              Overall Progress
            </div>
            <div className="flex items-center gap-2">
              <Progress value={job.overallProgress} className="flex-1" />
              <span className="text-sm font-medium">
                {job.overallProgress}%
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Started</div>
            <p className="text-sm">{formatTimestamp(job.startedAt)}</p>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Completed</div>
            <p className="text-sm">{formatTimestamp(job.completedAt)}</p>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Duration</div>
            <p className="text-sm">{totalDuration}</p>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              Retry Count
            </div>
            <p className="text-sm">{job.retryCount}</p>
          </div>
        </div>

        {/* Processing Stages */}
        {job.stages && job.stages.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Processing Stages</h4>
            <div className="space-y-2">
              {job.stages.map((stage) => (
                <div
                  key={stage.name}
                  className="flex items-center justify-between p-3 rounded border"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      {stage.status === "completed" && (
                        <CheckCircle className="h-4 w-4 text-success" />
                      )}
                      {stage.status === "processing" && (
                        <Loader2 className="h-4 w-4 animate-spin text-info" />
                      )}
                      {stage.status === "failed" && (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      {stage.status === "pending" && (
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <span className="text-sm font-medium">
                        {getFriendlyStage(stage.name)}
                      </span>
                      {stage.error && (
                        <p className="text-xs text-red-600 mt-1">
                          {stage.error}
                        </p>
                      )}
                    </div>
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
                    {stage.startedAt && (
                      <div className="text-xs text-muted-foreground">
                        {formatDuration(stage.startedAt, stage.completedAt)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error Details */}
        {job.errorMessage && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-red-600">Error Details</h4>
            <div className="p-3 bg-red-50 border border-red-200 rounded">
              <p className="text-sm text-red-800">{job.errorMessage}</p>
            </div>
          </div>
        )}
      </div>
    </DialogContent>
  );
}
