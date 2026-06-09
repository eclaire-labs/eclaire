import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { Filter, Loader2, RefreshCw, Search, X } from "lucide-react";

const routeApi = getRouteApi("/_authenticated/processing");

import { useEffect, useState } from "react";

import { MobileListsBackButton } from "@/components/mobile/mobile-lists-back-button";
import { JobsTable } from "@/components/processing/JobsTable";
import { ProcessingSummaryDashboard } from "@/components/processing/ProcessingSummaryDashboard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ProcessingJob } from "@/hooks/use-processing-jobs";
import { useProcessingJobs } from "@/hooks/use-processing-jobs";

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

  const { jobs, isLoading, refetch, retryJob } = useProcessingJobs();

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

  const handleDetailsOpenChange = (jobId: string, open: boolean) => {
    if (!open) {
      if (autoOpenJobId === jobId) setAutoOpenJobId(null);
      if (manualOpenJobId === jobId) setManualOpenJobId(null);
    } else {
      setManualOpenJobId(jobId);
    }
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
            <label className="text-sm font-medium" htmlFor="filter-status">
              Status
            </label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger id="filter-status">
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
            <label className="text-sm font-medium" htmlFor="filter-asset-type">
              Asset Type
            </label>
            <Select value={assetTypeFilter} onValueChange={setAssetTypeFilter}>
              <SelectTrigger id="filter-asset-type">
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
                type="button"
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
        <JobsTable
          jobs={filteredJobs}
          autoOpenJobId={autoOpenJobId}
          manualOpenJobId={manualOpenJobId}
          onDetailsOpenChange={handleDetailsOpenChange}
          onRowClick={handleRowClick}
          onRetry={retryJob}
        />
      )}

      {/* Filter Dialog */}
      <FilterDialog />
    </div>
  );
}
