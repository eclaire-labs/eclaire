import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Eye,
  Filter,
  Loader2,
  Play,
  RefreshCw,
  Search,
  X,
  XCircle,
} from "lucide-react";

const routeApi = getRouteApi("/_authenticated/processing");

import { useEffect, useState } from "react";
import { MobileListsBackButton } from "@/components/mobile/mobile-lists-back-button";
import { ProcessingSummaryDashboard } from "@/components/processing/ProcessingSummaryDashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { useProcessingEvents } from "@/hooks/use-processing-status";
import { apiFetch } from "@/lib/frontend-api";

interface ProcessingJob {
  id: string;
  assetType: "photos" | "documents" | "bookmarks" | "notes";
  assetId: string;
  status: "pending" | "processing" | "completed" | "failed" | "retry_pending";
  stages: Array<{
    name: string;
    status: string;
    progress: number;
    startedAt?: number;
    completedAt?: number;
    error?: string;
  }>;
  currentStage?: string;
  overallProgress: number;
  errorMessage?: string;
  retryCount: number;
  canRetry: boolean;
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

interface AssetDetails {
  title?: string;
  name?: string;
  url?: string;
  originalFilename?: string;
  description?: string;
}

const statusIcons = {
  pending: <Clock className="h-4 w-4 text-yellow-500" />,
  processing: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
  completed: <CheckCircle className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
  retry_pending: <AlertCircle className="h-4 w-4 text-orange-500" />,
};

const statusColors = {
  pending:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  processing: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  completed:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  retry_pending:
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

// User-friendly stage names
const stageNames: Record<string, string> = {
  // Common stages
  result_saving: "Saving Results",
  result_processing: "Saving Results", // Same as result_saving for consistency
  ai_processing: "AI Analysis",
  ai_analysis: "AI Analysis", // For photos
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
  image_conversion: "Converting Image", // For HEIC conversion
  image_analysis: "Analyzing Image",

  // Document-specific stages
  pdf_generation: "Generating PDF", // Updated from "Processing File"
  file_processing: "Processing File",
  document_parsing: "Parsing Document",
  content_extraction: "Extracting Content",

  // Bookmark-specific stages
  content_analysis: "Extracting Content", // Changed from "Analyzing Content"
  ai_tagging: "AI Analysis",
  bookmark_processing: "Processing Bookmark",

  // Note-specific stages
  note_processing: "Processing Note",

  // Python worker stages (replace Docling with generic terms)
  document_download: "Downloading Document",
  docling_processing: "Text Extraction", // Changed from Docling implementation detail
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

function getFriendlyCurrentStage(stage?: string, status?: string): string {
  // Don't show current stage for completed or failed jobs
  if (status === "completed" || status === "failed") {
    return "—";
  }
  return getFriendlyStage(stage);
}

function JobDetailsDialog({ job }: { job: ProcessingJob }) {
  const _navigate = useNavigate();
  const [assetDetails, setAssetDetails] = useState<AssetDetails | null>(null);
  const [isLoadingAsset, setIsLoadingAsset] = useState(false);

  // Fetch asset details when dialog opens
  useEffect(() => {
    const fetchAssetDetails = async () => {
      setIsLoadingAsset(true);
      try {
        const response = await apiFetch(`/api/${job.assetType}/${job.assetId}`);
        if (response.ok) {
          const data = await response.json();
          setAssetDetails(data);
        }
      } catch (error) {
        console.error("Failed to fetch asset details:", error);
      } finally {
        setIsLoadingAsset(false);
      }
    };

    fetchAssetDetails();
  }, [job.assetType, job.assetId]);

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
              {job.stages.map((stage, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded border"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      {stage.status === "completed" && (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                      {stage.status === "processing" && (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      )}
                      {stage.status === "failed" && (
                        <XCircle className="h-4 w-4 text-red-500" />
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

export default function ProcessingContent() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { assetType, assetId } = routeApi.useSearch();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assetTypeFilter, setAssetTypeFilter] = useState("all");
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  const [autoOpenJobId, setAutoOpenJobId] = useState<string | null>(null);
  const [manualOpenJobId, setManualOpenJobId] = useState<string | null>(null);

  // Get SSE connection status for real-time updates
  const { isConnected } = useProcessingEvents();

  const {
    data: jobs,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["processing-jobs"],
    queryFn: async () => {
      const response = await apiFetch("/api/processing-status/jobs?limit=9999");
      if (!response.ok) {
        throw new Error("Failed to fetch processing jobs");
      }
      return response.json();
    },
    // Only poll as fallback when SSE is disconnected
    refetchInterval: isConnected ? false : 60000, // Poll every minute when SSE disconnected
  });

  // Handle auto-opening job details dialog based on URL parameters
  useEffect(() => {
    if (assetType && assetId && jobs) {
      // Find the job that matches the asset type and ID
      const targetJob = jobs.find(
        (job: ProcessingJob) =>
          job.assetType === assetType && job.assetId === assetId,
      );

      if (targetJob) {
        setAutoOpenJobId(targetJob.id);
        setManualOpenJobId(null); // Clear any manual open state
        // Clear the URL parameters after finding the job
        navigate({ to: "/processing", replace: true });
      }
    }
  }, [jobs, assetType, assetId, navigate]);

  const handleRetry = async (
    assetType: string,
    assetId: string,
    force: boolean = false,
  ) => {
    try {
      const response = await apiFetch(
        `/api/processing-status/${assetType}/${assetId}/retry`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force }),
        },
      );

      if (response.ok) {
        refetch();
      } else {
        const errorData = await response.json();
        console.error("Failed to retry job:", errorData.error);
      }
    } catch (error) {
      console.error("Failed to retry job:", error);
    }
  };

  const clearAllFilters = () => {
    setStatusFilter("all");
    setAssetTypeFilter("all");
  };

  // Clear search input
  const clearSearch = () => {
    setSearchQuery("");
    // Focus the input after clearing
    const searchInput = document.querySelector(
      'input[placeholder="Search jobs..."]',
    ) as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
    }
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (statusFilter !== "all") count++;
    if (assetTypeFilter !== "all") count++;
    return count;
  };

  const handleRowClick = (job: ProcessingJob) => {
    // Navigate to the asset details page
    const detailsUrl = `/${job.assetType}/${job.assetId}`;
    navigate({ to: detailsUrl });
  };

  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return "—";
    return new Date(timestamp * 1000).toLocaleString();
  };

  const filteredJobs =
    jobs?.filter((job: ProcessingJob) => {
      if (statusFilter !== "all" && job.status !== statusFilter) return false;
      if (assetTypeFilter !== "all" && job.assetType !== assetTypeFilter)
        return false;
      if (
        searchQuery &&
        !job.assetId.toLowerCase().includes(searchQuery.toLowerCase())
      )
        return false;
      return true;
    }) || [];

  // FilterDialog component
  const FilterDialog = () => (
    <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Filter Processing Jobs</DialogTitle>
          <DialogDescription>
            Filter processing jobs by status and asset type.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Status Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="retry_pending">Retry Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Asset Type Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Asset Type</label>
            <Select value={assetTypeFilter} onValueChange={setAssetTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="photos">Photos</SelectItem>
                <SelectItem value="documents">Documents</SelectItem>
                <SelectItem value="bookmarks">Bookmarks</SelectItem>
                <SelectItem value="notes">Notes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={clearAllFilters}
            className="w-full sm:w-auto"
          >
            Clear All Filters
          </Button>
          <Button
            onClick={() => setIsFilterDialogOpen(false)}
            className="w-full sm:w-auto"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <MobileListsBackButton />
          <div>
            <h1 className="text-lg md:text-3xl font-bold md:tracking-tight">
              Processing Jobs
              {jobs && jobs.length > 0 && (
                <span className="ml-2 text-sm md:text-base font-normal text-muted-foreground">
                  {filteredJobs.length === jobs.length
                    ? `(${jobs.length})`
                    : `(${filteredJobs.length} of ${jobs.length})`}
                </span>
              )}
            </h1>
            {!isMobile && (
              <p className="text-muted-foreground mt-2">
                Monitor and manage background processing jobs for your assets.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Processing Summary Dashboard */}
      <ProcessingSummaryDashboard />

      {/* Controls: Search, Filters, Refresh */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
        {/* Search Input + Filter Button Container */}
        <div className="flex gap-2 flex-grow w-full md:w-auto">
          {/* Search Input */}
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs..."
              className={`pl-10 w-full ${searchQuery ? "pr-10" : ""}`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filter Button - Mobile only */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsFilterDialogOpen(true)}
            className="md:hidden shrink-0 relative"
            title="Filter processing jobs"
          >
            <Filter className="h-4 w-4" />
            {getActiveFilterCount() > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full h-4 w-4 flex items-center justify-center">
                {getActiveFilterCount()}
              </span>
            )}
          </Button>

          {/* Refresh Button - Mobile only */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isLoading}
            className="md:hidden shrink-0"
            title="Refresh jobs"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>

        {/* Filters and Refresh Button - Hidden on mobile, shown on desktop */}
        <div className="hidden md:flex flex-wrap gap-2 items-center w-full md:w-auto justify-start md:justify-end">
          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="retry_pending">Retry Pending</SelectItem>
            </SelectContent>
          </Select>

          {/* Asset Type Filter */}
          <Select value={assetTypeFilter} onValueChange={setAssetTypeFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="photos">Photos</SelectItem>
              <SelectItem value="documents">Documents</SelectItem>
              <SelectItem value="bookmarks">Bookmarks</SelectItem>
              <SelectItem value="notes">Notes</SelectItem>
            </SelectContent>
          </Select>

          {/* Refresh Button */}
          <Button
            onClick={() => refetch()}
            disabled={isLoading}
            variant="outline"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Jobs Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading jobs...
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No processing jobs found matching your criteria.
        </div>
      ) : (
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
              {filteredJobs.map((job: ProcessingJob) => (
                <TableRow
                  key={job.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleRowClick(job)}
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
                        onOpenChange={(open) => {
                          if (!open) {
                            if (autoOpenJobId === job.id)
                              setAutoOpenJobId(null);
                            if (manualOpenJobId === job.id)
                              setManualOpenJobId(null);
                          } else {
                            setManualOpenJobId(job.id);
                          }
                        }}
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
                          onClick={() =>
                            handleRetry(job.assetType, job.assetId, false)
                          }
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Retry
                        </Button>
                      ) : job.status === "completed" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            handleRetry(job.assetType, job.assetId, true)
                          }
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Re-run
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled>
                          <Clock className="h-3 w-3 mr-1" />
                          {job.status === "processing"
                            ? "Processing"
                            : "Pending"}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Filter Dialog */}
      <FilterDialog />
    </div>
  );
}
