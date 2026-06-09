import { Clock, Eye, Play, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProcessingJob } from "@/hooks/use-processing-jobs";

import { JobDetailsDialog } from "./JobDetailsDialog";
import {
  getFriendlyCurrentStage,
  statusColors,
  statusIcons,
} from "./processing-job-utils";

interface JobsTableProps {
  jobs: ProcessingJob[];
  autoOpenJobId: string | null;
  manualOpenJobId: string | null;
  onDetailsOpenChange: (jobId: string, open: boolean) => void;
  onRowClick: (job: ProcessingJob) => void;
  onRetry: (assetType: string, assetId: string, force: boolean) => void;
}

export function JobsTable({
  jobs,
  autoOpenJobId,
  manualOpenJobId,
  onDetailsOpenChange,
  onRowClick,
  onRetry,
}: JobsTableProps) {
  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return "—";
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Asset</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Current Stage</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Completed</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job: ProcessingJob) => (
            <TableRow
              key={job.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => onRowClick(job)}
            >
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">{job.assetType}</span>
                  <span className="text-sm text-muted-foreground font-mono">
                    {job.assetId.substring(0, 10)}...
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {statusIcons[job.status as keyof typeof statusIcons]}
                  <Badge
                    className={
                      statusColors[job.status as keyof typeof statusColors]
                    }
                  >
                    {job.status.replace("_", " ")}
                  </Badge>
                  {(job.status === "processing" ||
                    job.status === "pending") && (
                    <div className="flex items-center gap-1 ml-2">
                      <Progress
                        value={job.overallProgress}
                        className="w-16 h-2"
                      />
                      <span className="text-xs text-muted-foreground">
                        {job.overallProgress}%
                      </span>
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <span className="text-sm">
                  {getFriendlyCurrentStage(job.currentStage, job.status)}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-sm">
                  {formatTimestamp(job.startedAt)}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-sm">
                  {formatTimestamp(job.completedAt)}
                </span>
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2">
                  <Dialog
                    open={
                      autoOpenJobId === job.id || manualOpenJobId === job.id
                    }
                    onOpenChange={(open) => onDetailsOpenChange(job.id, open)}
                  >
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline">
                        <Eye className="h-3 w-3 mr-1" />
                        Details
                      </Button>
                    </DialogTrigger>
                    <JobDetailsDialog job={job} />
                  </Dialog>

                  {job.status === "failed" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onRetry(job.assetType, job.assetId, false)}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Retry
                    </Button>
                  ) : job.status === "completed" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onRetry(job.assetType, job.assetId, true)}
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Re-run
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled>
                      <Clock className="h-3 w-3 mr-1" />
                      {job.status === "processing" ? "Processing" : "Pending"}
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
