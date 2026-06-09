/**
 * Shared list UI for the All / Flagged / Pinned / Pending / Due Now pages.
 *
 * Each page renders this with its fixed `/api/all` filters, titles, and a
 * `variant` that controls the page-specific quirks (card accents, badge
 * styles, extra filters, and the pending accept/reject actions).
 */

import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  BookMarked,
  Calendar,
  Check,
  Clock,
  FileText,
  Filter,
  Flag,
  ImageIcon,
  ListTodo,
  Loader2,
  Pin,
  Search,
  StickyNote,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { MobileListsBackButton } from "@/components/mobile/mobile-lists-back-button";
import { PinFlagControls } from "@/components/shared/pin-flag-controls";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  type AllItem,
  type AllItemsFilters,
  type AllItemType,
  type FlagColor,
  useAllItems,
} from "@/hooks/use-all-items";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useIsMobile } from "@/hooks/use-mobile";
import { apiFetch } from "@/lib/api-client";
import { setFlagColor, togglePin } from "@/lib/api-content";

export type AllItemsVariant =
  | "all"
  | "flagged"
  | "pinned"
  | "pending"
  | "dueNow";

export interface AllItemsListProps {
  variant: AllItemsVariant;
  /** Fixed server-side filters for this page (e.g. `{ flagged: true }`). */
  fixedFilters?: AllItemsFilters;
  title: string;
  titleIcon?: ReactNode;
  subtitle: string;
  searchPlaceholder: string;
  dialogTitle: string;
  dialogDescription: string;
  emptyState: ReactNode;
  /** Tag preselected from the URL search params (All page only). */
  tagFromUrl?: string;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const getContentType = (
  type: AllItemType,
): "bookmarks" | "tasks" | "notes" | "photos" | "documents" => {
  switch (type) {
    case "bookmark":
      return "bookmarks";
    case "task":
      return "tasks";
    case "note":
      return "notes";
    case "photo":
      return "photos";
    case "document":
      return "documents";
    default:
      return "bookmarks";
  }
};

const formatDate = (dateString: string) => {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  return new Date(dateString).toLocaleDateString(undefined, options);
};

const formatDueDate = (dueDateString: string | null | undefined) => {
  if (!dueDateString) return null;

  const dueDate = new Date(dueDateString);
  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const dueDateStart = new Date(
    dueDate.getFullYear(),
    dueDate.getMonth(),
    dueDate.getDate(),
  );

  const diffTime = dueDateStart.getTime() - todayStart.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      text: `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"}`,
      isOverdue: true,
    };
  } else if (diffDays === 0) {
    return {
      text: "Due today",
      isOverdue: false,
    };
  } else {
    return {
      text: `Due in ${diffDays} day${diffDays === 1 ? "" : "s"}`,
      isOverdue: false,
    };
  }
};

const getItemIcon = (type: AllItemType) => {
  switch (type) {
    case "task":
      return <ListTodo className="h-5 w-5" />;
    case "bookmark":
      return <BookMarked className="h-5 w-5" />;
    case "document":
      return <FileText className="h-5 w-5" />;
    case "photo":
      return <ImageIcon className="h-5 w-5" />;
    case "note":
      return <StickyNote className="h-5 w-5" />;
  }
};

const getItemUrl = (item: AllItem) => {
  switch (item.type) {
    case "task":
      return `/tasks/${item.id}`;
    case "bookmark":
      return `/bookmarks/${item.id}`;
    case "document":
      return `/documents/${item.id}`;
    case "photo":
      return `/photos/${item.id}`;
    case "note":
      return `/notes/${item.id}`;
    default:
      return "/";
  }
};

const getFlagColorClass = (flagColor: string | null | undefined) => {
  if (!flagColor) return "";

  switch (flagColor) {
    case "red":
      return "bg-red-100 border-red-200 text-red-800";
    case "yellow":
      return "bg-yellow-100 border-yellow-200 text-yellow-800";
    case "orange":
      return "bg-orange-100 border-orange-200 text-orange-800";
    case "green":
      return "bg-green-100 border-green-200 text-green-800";
    case "blue":
      return "bg-blue-100 border-blue-200 text-blue-800";
    default:
      return "";
  }
};

const getFlagBorderClass = (flagColor: string | null | undefined) => {
  switch (flagColor) {
    case "red":
      return "border-l-red-500";
    case "yellow":
      return "border-l-yellow-500";
    case "orange":
      return "border-l-orange-500";
    case "green":
      return "border-l-green-500";
    case "blue":
      return "border-l-blue-500";
    default:
      return "border-l-gray-500";
  }
};

const getFlagIcon = (flagColor: string | null | undefined) => {
  const baseClass = "h-4 w-4";
  switch (flagColor) {
    case "red":
      return <Flag className={`${baseClass} text-red-500`} />;
    case "yellow":
      return <Flag className={`${baseClass} text-yellow-500`} />;
    case "orange":
      return <Flag className={`${baseClass} text-orange-500`} />;
    case "green":
      return <Flag className={`${baseClass} text-green-500`} />;
    case "blue":
      return <Flag className={`${baseClass} text-blue-500`} />;
    default:
      return <Flag className={`${baseClass} text-muted-foreground`} />;
  }
};

// Type filter options ("Due Now" historically lists notes second)
const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "task", label: "Tasks" },
  { value: "bookmark", label: "Bookmarks" },
  { value: "document", label: "Documents" },
  { value: "photo", label: "Photos" },
  { value: "note", label: "Notes" },
];

const DUE_NOW_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "task", label: "Tasks" },
  { value: "note", label: "Notes" },
  { value: "bookmark", label: "Bookmarks" },
  { value: "document", label: "Documents" },
  { value: "photo", label: "Photos" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AllItemsList({
  variant,
  fixedFilters,
  title,
  titleIcon,
  subtitle,
  searchPlaceholder,
  dialogTitle,
  dialogDescription,
  emptyState,
  tagFromUrl,
}: AllItemsListProps) {
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>(tagFromUrl || "all");
  const [filterFlagColor, setFilterFlagColor] = useState<string>("all");
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const isDueNow = variant === "dueNow";
  const isPending = variant === "pending";
  const isFlagged = variant === "flagged";
  const typeOptions = isDueNow ? DUE_NOW_TYPE_OPTIONS : TYPE_OPTIONS;

  // Sync filterTag when the URL search param changes (All page)
  useEffect(() => {
    if (tagFromUrl !== undefined || variant === "all") {
      setFilterTag(tagFromUrl || "all");
    }
  }, [tagFromUrl, variant]);

  const {
    items,
    totalCount,
    isLoading,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAllItems({
    ...fixedFilters,
    text: debouncedSearch || undefined,
    tags: filterTag !== "all" ? filterTag : undefined,
    types: filterType !== "all" ? filterType : undefined,
  });

  // Client-side flag color filter (narrows within flagged items)
  const displayItems = useMemo(
    () =>
      isFlagged && filterFlagColor !== "all"
        ? items.filter((item) => item.flagColor === filterFlagColor)
        : items,
    [items, isFlagged, filterFlagColor],
  );

  const { sentinelRef } = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  });

  // Get unique tags from loaded items
  const allTags = useMemo(
    () => Array.from(new Set(items.flatMap((item) => item.tags || []))),
    [items],
  );

  // Get unique flag colors from loaded items (flagged page)
  const allFlagColors = useMemo(
    () =>
      Array.from(new Set(items.map((item) => item.flagColor).filter(Boolean))),
    [items],
  );

  // Active filter count for mobile badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterType !== "all") count++;
    if (filterTag !== "all") count++;
    if (isFlagged && filterFlagColor !== "all") count++;
    return count;
  }, [filterType, filterTag, isFlagged, filterFlagColor]);

  // Pin and flag handlers
  const handlePinToggle = async (item: AllItem) => {
    try {
      const response = await togglePin(
        getContentType(item.type),
        item.id,
        !item.isPinned,
      );
      if (response.ok) {
        refetch();
        toast.success(item.isPinned ? "Unpinned" : "Pinned");
      }
    } catch {
      toast.error("Error", { description: "Failed to update pin status" });
    }
  };

  const handleFlagToggle = async (item: AllItem) => {
    const newColor = item.flagColor ? null : "orange";
    try {
      const response = await setFlagColor(
        getContentType(item.type),
        item.id,
        newColor,
      );
      if (response.ok) {
        refetch();
        toast.success(newColor ? "Flagged" : "Unflagged");
      }
    } catch {
      toast.error("Error", { description: "Failed to update flag" });
    }
  };

  const handleFlagColorChange = async (item: AllItem, color: FlagColor) => {
    try {
      const response = await setFlagColor(
        getContentType(item.type),
        item.id,
        color,
      );
      if (response.ok) {
        refetch();
        toast.success("Flag Updated");
      }
    } catch {
      toast.error("Error", { description: "Failed to update flag color" });
    }
  };

  // Accept / reject handlers (pending page)
  const getUpdateEndpoint = (item: AllItem): string | null => {
    switch (item.type) {
      case "bookmark":
        return `/api/bookmarks/${item.id}/review`;
      case "task":
        return `/api/tasks/${item.id}`;
      case "document":
        return `/api/documents/${item.id}`;
      case "photo":
        return `/api/photos/${item.id}`;
      case "note":
        return `/api/notes/${item.id}`;
      default:
        return null;
    }
  };

  const getDeleteEndpoint = (item: AllItem): string | null => {
    switch (item.type) {
      case "bookmark":
        return `/api/bookmarks/${item.id}`;
      case "task":
        return `/api/tasks/${item.id}`;
      case "document":
        return `/api/documents/${item.id}`;
      case "photo":
        return `/api/photos/${item.id}`;
      case "note":
        return `/api/notes/${item.id}`;
      default:
        return null;
    }
  };

  const handleAcceptItem = async (item: AllItem, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      const endpoint = getUpdateEndpoint(item);
      if (!endpoint) {
        toast.error("Error", { description: "Cannot update this item type" });
        return;
      }

      const response = await apiFetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewStatus: "accepted" }),
      });

      if (response.ok) {
        refetch();
        toast.success("Success", {
          description: `${item.title} has been accepted`,
        });
      } else {
        throw new Error("Failed to accept item");
      }
    } catch (error) {
      console.error("Error accepting item:", error);
      toast.error("Error", { description: "Failed to accept item" });
    }
  };

  const handleRejectItem = async (item: AllItem, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      const endpoint = getDeleteEndpoint(item);
      if (!endpoint) {
        toast.error("Error", { description: "Cannot delete this item type" });
        return;
      }

      const response = await apiFetch(endpoint, { method: "DELETE" });

      if (response.ok) {
        refetch();
        toast.success("Success", {
          description: `${item.title} has been rejected and deleted`,
        });
      } else {
        throw new Error("Failed to reject item");
      }
    } catch (error) {
      console.error("Error rejecting item:", error);
      toast.error("Error", { description: "Failed to reject item" });
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    searchInputRef.current?.focus();
  };

  const clearAllFilters = () => {
    setFilterType("all");
    setFilterTag("all");
    if (isFlagged) setFilterFlagColor("all");
  };

  // -------------------------------------------------------------------------
  // Variant-specific rendering
  // -------------------------------------------------------------------------

  const getCardClassName = (item: AllItem) => {
    const base =
      "flex items-start justify-between border rounded-lg hover:bg-muted/50 transition-colors";
    switch (variant) {
      case "all":
        return `${base} p-3 ${item.isPinned ? "border-l-4 border-l-blue-500" : ""}`;
      case "flagged":
        return `${base} p-3 border-l-4 ${getFlagBorderClass(item.flagColor)}`;
      case "pinned":
        return `${base} p-3 border-l-4 border-l-blue-500`;
      case "pending":
        return `${base} p-3`;
      case "dueNow":
        return `${base} p-4`;
    }
  };

  // Icon shown before the title (all/flagged/pinned variants)
  const getLeadingTitleIcon = (item: AllItem): ReactNode => {
    switch (variant) {
      case "all":
        return item.isPinned ? <Pin className="h-4 w-4 text-blue-500" /> : null;
      case "flagged":
        return getFlagIcon(item.flagColor);
      case "pinned":
        return <Pin className="h-4 w-4 text-blue-500" />;
      default:
        return null;
    }
  };

  // Icon shown after the title (pending/dueNow variants)
  const getTrailingTitleIcon = (item: AllItem): ReactNode => {
    if (!item.isPinned) return null;
    switch (variant) {
      case "pending":
        return <Clock className="h-4 w-4 text-orange-500" />;
      case "dueNow":
        return <Clock className="h-4 w-4 text-blue-500" />;
      default:
        return null;
    }
  };

  const getReviewStatusBadge = (reviewStatus: string | undefined) => {
    if (isPending) {
      // Fixed badge — every item on the pending page is pending review
      return (
        <Badge
          variant="outline"
          className="bg-orange-100 text-orange-800 border-orange-200"
        >
          <Clock className="h-3 w-3 mr-1" />
          Pending Review
        </Badge>
      );
    }
    if (variant === "all") {
      switch (reviewStatus) {
        case "pending":
          return (
            <Badge variant="warning">
              <Clock className="h-3 w-3 mr-1" />
              Pending
            </Badge>
          );
        case "accepted":
          return <Badge variant="success">Accepted</Badge>;
        case "rejected":
          return <Badge variant="destructive">Rejected</Badge>;
        default:
          return null;
      }
    }
    switch (reviewStatus) {
      case "pending":
        return (
          <Badge
            variant="outline"
            className="bg-orange-100 text-orange-800 border-orange-200"
          >
            Pending
          </Badge>
        );
      case "accepted":
        return (
          <Badge
            variant="outline"
            className="bg-green-100 text-green-800 border-green-200"
          >
            Accepted
          </Badge>
        );
      case "rejected":
        return (
          <Badge
            variant="outline"
            className="bg-red-100 text-red-800 border-red-200"
          >
            Rejected
          </Badge>
        );
      default:
        return null;
    }
  };

  // Flagged & Due Now color the flag badge; the others keep it neutral
  const flagBadgeClass = (item: AllItem) =>
    isFlagged || isDueNow
      ? `capitalize ${getFlagColorClass(item.flagColor)}`
      : "capitalize";

  const renderItemCard = (item: AllItem) => {
    const dueDateInfo = isDueNow ? formatDueDate(item.dueDate) : null;
    const leadingIcon = getLeadingTitleIcon(item);
    const trailingIcon = getTrailingTitleIcon(item);

    return (
      <div key={`${item.type}-${item.id}`} className={getCardClassName(item)}>
        <Link
          to={getItemUrl(item)}
          className={
            isPending || isDueNow
              ? "flex items-start gap-3 flex-1 cursor-pointer"
              : "flex items-start gap-3 flex-1 min-w-0"
          }
        >
          <div className="p-2 rounded-md bg-muted flex items-center justify-center">
            {getItemIcon(item.type)}
          </div>
          <div className={isPending || isDueNow ? "flex-1" : undefined}>
            <div className="font-medium flex items-center gap-2">
              {leadingIcon}
              {item.title}
              {trailingIcon}
            </div>
            <div className="text-sm text-muted-foreground line-clamp-1 mt-1">
              {item.description}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="outline" className="capitalize">
                {item.type}
              </Badge>
              {dueDateInfo && (
                <Badge
                  variant="outline"
                  className={`flex items-center gap-1 ${
                    dueDateInfo.isOverdue
                      ? "bg-red-100 text-red-800 border-red-200"
                      : "bg-orange-100 text-orange-800 border-orange-200"
                  }`}
                >
                  {dueDateInfo.isOverdue ? (
                    <AlertTriangle className="h-3 w-3" />
                  ) : (
                    <Clock className="h-3 w-3" />
                  )}
                  {dueDateInfo.text}
                </Badge>
              )}
              {getReviewStatusBadge(item.reviewStatus)}
              <Badge variant="outline" className="flex items-center gap-1">
                <Calendar className="h-3 w-3" /> {formatDate(item.createdAt)}
              </Badge>
              {item.flagColor && (
                <Badge variant="outline" className={flagBadgeClass(item)}>
                  {item.flagColor} flag
                </Badge>
              )}
              {isFlagged && item.isPinned && (
                <Badge variant="outline" className="capitalize">
                  pinned
                </Badge>
              )}
              {(item.tags || []).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </Link>
        {isPending ? (
          <div className="flex items-center gap-2 ml-4 shrink-0">
            <PinFlagControls
              isPinned={item.isPinned || false}
              flagColor={item.flagColor || null}
              onPinToggle={() => handlePinToggle(item)}
              onFlagToggle={() => handleFlagToggle(item)}
              onFlagColorChange={(color) => handleFlagColorChange(item, color)}
              size="sm"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 bg-green-50 hover:bg-green-100 border-green-200 text-green-700 hover:text-green-800"
              onClick={(e) => handleAcceptItem(item, e)}
              title="Accept item"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 bg-red-50 hover:bg-red-100 border-red-200 text-red-700 hover:text-red-800"
              onClick={(e) => handleRejectItem(item, e)}
              title="Reject and delete item"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1 ml-3">
            <PinFlagControls
              isPinned={item.isPinned || false}
              flagColor={item.flagColor || null}
              onPinToggle={() => handlePinToggle(item)}
              onFlagToggle={() => handleFlagToggle(item)}
              onFlagColorChange={(color) => handleFlagColorChange(item, color)}
              size="sm"
            />
          </div>
        )}
      </div>
    );
  };

  const renderLoadingSkeleton = () =>
    isDueNow
      ? [0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center space-x-4 p-4 border rounded-lg"
          >
            <Skeleton className="h-12 w-12 rounded-md" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-[250px]" />
              <Skeleton className="h-4 w-[200px]" />
            </div>
          </div>
        ))
      : [0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-start gap-3 p-3 border rounded-lg">
            <div className="p-2 rounded-md bg-muted">
              <Skeleton className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <Skeleton className="h-5 w-3/4 mb-2" />
              <Skeleton className="h-4 w-1/2 mb-3" />
              <div className="flex gap-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          </div>
        ));

  const typeSelectItems = typeOptions.map((option) => (
    <SelectItem key={option.value} value={option.value}>
      {option.label}
    </SelectItem>
  ));

  const tagSelectItems = (
    <>
      <SelectItem value="all">All Tags</SelectItem>
      {allTags.map((tag) => (
        <SelectItem key={tag} value={tag}>
          {tag}
        </SelectItem>
      ))}
    </>
  );

  const flagColorSelectItems = (
    <>
      <SelectItem value="all">All Colors</SelectItem>
      {allFlagColors.map((color) =>
        color ? (
          <SelectItem key={color} value={color}>
            <div className="flex items-center gap-2">
              <Flag className={`h-3 w-3 text-${color}-500`} />
              <span className="capitalize">{color}</span>
            </div>
          </SelectItem>
        ) : null,
      )}
    </>
  );

  // FilterSortDialog component
  const FilterSortDialog = () => (
    <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="type-filter" className="text-right font-medium">
              Type
            </label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="col-span-3">
                <SelectValue
                  placeholder={isDueNow ? "Filter by type" : "Type"}
                />
              </SelectTrigger>
              <SelectContent>{typeSelectItems}</SelectContent>
            </Select>
          </div>

          {(!isDueNow || allTags.length > 0) && (
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="tag-filter" className="text-right font-medium">
                Tag
              </label>
              <Select value={filterTag} onValueChange={setFilterTag}>
                <SelectTrigger className="col-span-3">
                  <SelectValue
                    placeholder={isDueNow ? "Filter by tag" : "Tag"}
                  />
                </SelectTrigger>
                <SelectContent>{tagSelectItems}</SelectContent>
              </Select>
            </div>
          )}

          {isFlagged && (
            <div className="grid grid-cols-4 items-center gap-4">
              <label
                htmlFor="flag-color-filter"
                className="text-right font-medium"
              >
                Flag Color
              </label>
              <Select
                value={filterFlagColor}
                onValueChange={setFilterFlagColor}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Flag Color" />
                </SelectTrigger>
                <SelectContent>{flagColorSelectItems}</SelectContent>
              </Select>
            </div>
          )}
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
    <TooltipProvider>
      <div className="space-y-6 w-full">
        <div className="flex items-center gap-4">
          <MobileListsBackButton />
          <div>
            <h1
              className={`text-lg md:text-3xl font-bold md:tracking-tight${
                titleIcon ? " flex items-center gap-2" : ""
              }`}
            >
              {titleIcon}
              {title}
              {totalCount !== undefined && (
                <span className="ml-2 text-sm md:text-base font-normal text-muted-foreground">
                  ({totalCount})
                </span>
              )}
            </h1>
            {!isMobile && (
              <p className="text-muted-foreground mt-2">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          <div className="flex gap-2 flex-grow w-full md:w-auto">
            <div className="relative flex-grow">
              <Search
                className={`absolute ${isDueNow ? "left-2" : "left-2.5"} top-2.5 h-4 w-4 text-muted-foreground`}
              />
              <Input
                ref={searchInputRef}
                placeholder={searchPlaceholder}
                className={`pl-8 w-full ${searchQuery ? "pr-8" : ""}`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className={`absolute ${isDueNow ? "right-2" : "right-2.5"} top-2.5 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors`}
                  title="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsFilterDialogOpen(true)}
              className="md:hidden shrink-0 relative"
              title="Filter items"
            >
              <Filter className="h-4 w-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full h-4 w-4 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </div>

          <div
            className={
              isDueNow
                ? "hidden md:flex gap-2"
                : "hidden md:flex flex-wrap gap-2"
            }
          >
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className={isDueNow ? "w-[180px]" : "w-[130px]"}>
                {isDueNow && <Filter className="mr-2 h-4 w-4" />}
                <SelectValue
                  placeholder={isDueNow ? "Filter by type" : "Type"}
                />
              </SelectTrigger>
              <SelectContent>{typeSelectItems}</SelectContent>
            </Select>
            {(!isDueNow || allTags.length > 0) && (
              <Select value={filterTag} onValueChange={setFilterTag}>
                <SelectTrigger className={isDueNow ? "w-[180px]" : "w-[130px]"}>
                  <SelectValue
                    placeholder={isDueNow ? "Filter by tag" : "Tag"}
                  />
                </SelectTrigger>
                <SelectContent>{tagSelectItems}</SelectContent>
              </Select>
            )}
            {isFlagged && (
              <Select
                value={filterFlagColor}
                onValueChange={setFilterFlagColor}
              >
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Flag Color" />
                </SelectTrigger>
                <SelectContent>{flagColorSelectItems}</SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className={isDueNow ? "grid gap-4" : "space-y-4"}>
          {isLoading
            ? renderLoadingSkeleton()
            : displayItems.length > 0
              ? displayItems.map(renderItemCard)
              : emptyState}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="flex justify-center py-4">
            {isFetchingNextPage && (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>

        <FilterSortDialog />
      </div>
    </TooltipProvider>
  );
}
