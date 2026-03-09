import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Filter,
  LayoutGrid,
  List,
  Search,
  X,
} from "lucide-react";
import { MobileListsBackButton } from "@/components/mobile/mobile-lists-back-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ListableItem, ListPageState } from "@/hooks/use-list-page-state";
import { DeleteConfirmationDialog } from "./DeleteConfirmationDialog";
import {
  type ExtraFilterDef as ExtraFilterProps,
  FilterSortDialog,
  type SortOptionDef,
  type ViewModeDef,
} from "./FilterSortDialog";

export interface ListPageLayoutProps<TItem extends ListableItem> {
  state: ListPageState<TItem>;
  title: string;
  emptyIcon: LucideIcon;
  emptyMessage: string;
  emptyFilterMessage?: string;
  searchPlaceholder: string;
  totalCount: number;
  filteredCount: number;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  sortOptions: SortOptionDef[];
  extraFilters?: ExtraFilterProps[];
  viewModes?: ViewModeDef[];
  headerAction?: React.ReactNode;
  /** Wraps the entire page in a dropzone div. */
  dropzoneRootProps?: React.HTMLAttributes<HTMLDivElement>;
  dropzoneInputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  isDragActive?: boolean;
  dragOverlay?: React.ReactNode;
  /** Shown below controls (e.g. upload progress). */
  uploadProgress?: React.ReactNode;
  deleteEntityName: string;
  isDeleting?: boolean;
  /** Extra content in the delete dialog (e.g. markdown preview). */
  deleteDialogExtra?: React.ReactNode;
  /** Page-specific dialogs rendered after content. */
  dialogs?: React.ReactNode;
  /** Infinite scroll sentinel rendered below content. */
  loadMoreSentinel?: React.ReactNode;
  children: React.ReactNode;
}

const defaultViewModes: ViewModeDef[] = [
  { value: "tile", label: "Tiles", icon: LayoutGrid },
  { value: "list", label: "List", icon: List },
];

export function ListPageLayout<TItem extends ListableItem>({
  state,
  title,
  emptyIcon: EmptyIcon,
  emptyMessage,
  emptyFilterMessage,
  searchPlaceholder,
  totalCount,
  filteredCount,
  isLoading,
  error,
  onRetry,
  sortOptions,
  extraFilters,
  viewModes = defaultViewModes,
  headerAction,
  dropzoneRootProps,
  dropzoneInputProps,
  isDragActive,
  dragOverlay,
  uploadProgress,
  deleteEntityName,
  isDeleting,
  deleteDialogExtra,
  dialogs,
  loadMoreSentinel,
  children,
}: ListPageLayoutProps<TItem>) {
  const content = isLoading ? (
    <LoadingSkeleton />
  ) : error && totalCount === 0 ? (
    <ErrorCard error={error} onRetry={onRetry} />
  ) : filteredCount === 0 ? (
    <EmptyState
      icon={EmptyIcon}
      message={
        totalCount === 0
          ? emptyMessage
          : (emptyFilterMessage ?? "No items found matching your criteria.")
      }
    />
  ) : (
    children
  );

  const page = (
    <div className="space-y-6">
      {/* Inline error when items exist */}
      {error && totalCount > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error.message}.{" "}
            <Button variant="link" className="p-0 h-auto" onClick={onRetry}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <MobileListsBackButton />
          <div>
            <h1 className="text-lg md:text-3xl font-bold md:tracking-tight">
              {title}
              {totalCount > 0 && (
                <span className="ml-2 text-sm md:text-base font-normal text-muted-foreground">
                  {filteredCount === totalCount
                    ? `(${totalCount})`
                    : `(${filteredCount} of ${totalCount})`}
                </span>
              )}
            </h1>
          </div>
        </div>
        {headerAction}
      </div>

      {/* Controls: Search + Filter/Sort */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
        {/* Search Input + Mobile Filter Button */}
        <div className="flex gap-2 flex-grow w-full md:w-auto">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={state.searchInputRef}
              placeholder={searchPlaceholder}
              className={`pl-10 w-full ${state.searchQuery ? "pr-10" : ""}`}
              value={state.searchQuery}
              onChange={state.handleSearchChange}
            />
            {state.searchQuery && (
              <button
                type="button"
                onClick={state.clearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filter button - Mobile only */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => state.setIsFilterDialogOpen(true)}
            className="md:hidden shrink-0 relative"
            title={`Filter and sort ${title.toLowerCase()}`}
          >
            <Filter className="h-4 w-4" />
            {state.activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full h-4 w-4 flex items-center justify-center">
                {state.activeFilterCount}
              </span>
            )}
          </Button>
        </div>

        {/* Desktop filter/sort/view controls */}
        <div className="hidden md:flex flex-wrap gap-2 w-full md:w-auto">
          {/* Tag filter */}
          <Select
            value={state.filterTag}
            onValueChange={state.handleTagFilterChange}
          >
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Filter by Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tags</SelectItem>
              {state.allTags.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Extra filters (desktop inline) */}
          {extraFilters?.map((filter) => (
            <Select
              key={filter.key}
              value={filter.value}
              onValueChange={filter.onChange}
            >
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {filter.options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}

          {/* Sort by */}
          <Select value={state.sortBy} onValueChange={state.handleSortByChange}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sort direction */}
          <Button
            variant="outline"
            size="icon"
            onClick={state.toggleSortDir}
            title={`Sort Direction: ${state.sortDir === "asc" ? "Ascending" : "Descending"}`}
          >
            {state.sortDir === "asc" ? (
              <ArrowUp className="h-4 w-4" />
            ) : (
              <ArrowDown className="h-4 w-4" />
            )}
          </Button>

          {/* View mode */}
          <ToggleGroup
            type="single"
            value={state.viewMode}
            onValueChange={state.handleViewModeChange}
            className="w-auto justify-start"
          >
            {viewModes.map((vm) => (
              <ToggleGroupItem
                key={vm.value}
                value={vm.value}
                aria-label={`${vm.label} view`}
                title={`${vm.label} View`}
              >
                <vm.icon className="h-4 w-4" />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {/* Upload progress */}
      {uploadProgress}

      {/* Main content area */}
      {content}

      {/* Infinite scroll sentinel */}
      {loadMoreSentinel}

      {/* Delete confirmation dialog */}
      <DeleteConfirmationDialog
        open={state.isConfirmDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) state.closeDeleteDialog();
        }}
        entityName={deleteEntityName}
        itemTitle={state.itemToDelete?.title ?? null}
        onConfirm={state.handleDeleteConfirmed}
        isDeleting={isDeleting}
      >
        {deleteDialogExtra}
      </DeleteConfirmationDialog>

      {/* Mobile filter/sort dialog */}
      <FilterSortDialog
        open={state.isFilterDialogOpen}
        onOpenChange={state.setIsFilterDialogOpen}
        entityNamePlural={title}
        tagFilter={{
          value: state.filterTag,
          onChange: state.handleTagFilterChange,
          options: state.allTags,
        }}
        extraFilters={extraFilters}
        sortBy={{
          value: state.sortBy,
          onChange: state.handleSortByChange,
          options: sortOptions,
        }}
        sortDir={{
          value: state.sortDir,
          onToggle: state.toggleSortDir,
        }}
        viewMode={{
          value: state.viewMode,
          onChange: state.handleViewModeChange,
          options: viewModes,
        }}
        onClearAllFilters={state.clearAllFilters}
      />

      {/* Page-specific dialogs */}
      {dialogs}
    </div>
  );

  return (
    <TooltipProvider>
      {dropzoneRootProps ? (
        <div
          {...dropzoneRootProps}
          className={`min-h-screen relative ${isDragActive ? "bg-blue-50 dark:bg-blue-900/30 outline-dashed outline-2 outline-blue-500" : ""}`}
        >
          {dropzoneInputProps && <input {...dropzoneInputProps} />}
          {dragOverlay}
          {page}
        </div>
      ) : (
        page
      )}
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Internal sub-components
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
        <Card key={index} className="animate-pulse">
          <CardHeader>
            <div className="h-5 bg-muted rounded-full w-3/4 mb-2" />
            <div className="h-4 bg-muted rounded-full w-1/2" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="h-4 bg-muted rounded-full w-full" />
              <div className="h-4 bg-muted rounded-full w-full" />
              <div className="h-4 bg-muted rounded-full w-2/3" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ErrorCard({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="text-center py-16">
      <AlertCircle className="h-16 w-16 mx-auto mb-4 text-destructive" />
      <p className="text-lg font-medium mb-2">Failed to load</p>
      <p className="text-muted-foreground mb-4">{error.message}</p>
      <Button onClick={onRetry}>Try Again</Button>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  message,
}: {
  icon: LucideIcon;
  message: string;
}) {
  return (
    <div className="text-center py-16 text-muted-foreground">
      <Icon className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
      <p className="mb-4">{message}</p>
    </div>
  );
}
