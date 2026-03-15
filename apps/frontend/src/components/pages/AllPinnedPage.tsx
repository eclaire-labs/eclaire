import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  BookMarked,
  Calendar,
  FileText,
  Filter,
  ImageIcon,
  ListTodo,
  Loader2,
  Pin,
  Search,
  StickyNote,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useIsMobile } from "@/hooks/use-mobile";
import { apiFetch } from "@/lib/api-client";
import { setFlagColor, togglePin } from "@/lib/api-content";

type ItemType = "task" | "bookmark" | "document" | "photo" | "note";

interface Item {
  id: string;
  title: string;
  description: string;
  type: ItemType;
  createdAt: string;
  tags: string[];
  reviewStatus?: "pending" | "accepted" | "rejected";
  flagColor?: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned?: boolean;
}

interface AllPage {
  items: Item[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount?: number;
}

export default function PinnedItemsPage() {
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);

  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  // Build server params
  const serverParams = useMemo(() => {
    const params: Record<string, string> = { isPinned: "true" };
    if (debouncedSearch) params.text = debouncedSearch;
    if (filterTag !== "all") params.tags = filterTag;
    if (filterType !== "all") params.types = filterType;
    return params;
  }, [debouncedSearch, filterTag, filterType]);

  // Fetch with cursor pagination via useInfiniteQuery
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery<AllPage>({
    queryKey: ["pinned-items", serverParams],
    queryFn: async ({ pageParam }) => {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(serverParams)) {
        if (value) searchParams.set(key, value);
      }
      if (pageParam) searchParams.set("cursor", pageParam as string);
      const response = await apiFetch(`/api/all?${searchParams.toString()}`);
      return response.json();
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 5 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  const totalCount = data?.pages[0]?.totalCount;

  const { sentinelRef } = useInfiniteScroll({
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
    fetchNextPage,
  });

  // Get unique tags from loaded items
  const allTags = useMemo(
    () => Array.from(new Set(items.flatMap((item) => item.tags || []))),
    [items],
  );

  // Active filter count for mobile badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterType !== "all") count++;
    if (filterTag !== "all") count++;
    return count;
  }, [filterType, filterTag]);

  // Pin and flag handlers
  const handlePinToggle = async (item: Item) => {
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

  const handleFlagToggle = async (item: Item) => {
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

  const handleFlagColorChange = async (
    item: Item,
    color: "red" | "yellow" | "orange" | "green" | "blue",
  ) => {
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

  const getContentType = (
    type: ItemType,
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

  const getItemIcon = (type: ItemType) => {
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

  const getItemUrl = (item: Item) => {
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

  const getReviewStatusBadge = (reviewStatus: string | undefined) => {
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

  const clearSearch = () => {
    setSearchQuery("");
    const searchInput = document.querySelector(
      'input[placeholder="Search pinned items..."]',
    ) as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
    }
  };

  const clearAllFilters = () => {
    setFilterType("all");
    setFilterTag("all");
  };

  // FilterSortDialog component
  const FilterSortDialog = () => (
    <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Filter Pinned Items</DialogTitle>
          <DialogDescription>
            Filter and sort your pinned items by type and tags.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="type-filter" className="text-right font-medium">
              Type
            </label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="task">Tasks</SelectItem>
                <SelectItem value="bookmark">Bookmarks</SelectItem>
                <SelectItem value="document">Documents</SelectItem>
                <SelectItem value="photo">Photos</SelectItem>
                <SelectItem value="note">Notes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="tag-filter" className="text-right font-medium">
              Tag
            </label>
            <Select value={filterTag} onValueChange={setFilterTag}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tags</SelectItem>
                {allTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
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
    <TooltipProvider>
      <div className="space-y-6 w-full">
        <div className="flex items-center gap-4">
          <MobileListsBackButton />
          <div>
            <h1 className="text-lg md:text-3xl font-bold md:tracking-tight flex items-center gap-2">
              <Pin className="h-5 w-5 md:h-8 md:w-8 text-blue-500" />
              Pinned Items
              {totalCount !== undefined && (
                <span className="ml-2 text-sm md:text-base font-normal text-muted-foreground">
                  ({totalCount})
                </span>
              )}
            </h1>
            {!isMobile && (
              <p className="text-muted-foreground mt-2">
                Your most important items, pinned for quick access
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          <div className="flex gap-2 flex-grow w-full md:w-auto">
            <div className="relative flex-grow">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search pinned items..."
                className={`pl-8 w-full ${searchQuery ? "pr-8" : ""}`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
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

          <div className="hidden md:flex flex-wrap gap-2">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="task">Tasks</SelectItem>
                <SelectItem value="bookmark">Bookmarks</SelectItem>
                <SelectItem value="document">Documents</SelectItem>
                <SelectItem value="photo">Photos</SelectItem>
                <SelectItem value="note">Notes</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterTag} onValueChange={setFilterTag}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tags</SelectItem>
                {allTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          {isLoading ? (
            [0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 border rounded-lg"
              >
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
            ))
          ) : items.length > 0 ? (
            items.map((item) => (
              <div
                key={`${item.type}-${item.id}`}
                className="flex items-start justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors border-l-4 border-l-blue-500"
              >
                <Link
                  to={getItemUrl(item)}
                  className="flex items-start gap-3 flex-1 min-w-0"
                >
                  <div className="p-2 rounded-md bg-muted flex items-center justify-center">
                    {getItemIcon(item.type)}
                  </div>
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      <Pin className="h-4 w-4 text-blue-500" />
                      {item.title}
                    </div>
                    <div className="text-sm text-muted-foreground line-clamp-1 mt-1">
                      {item.description}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Badge variant="outline" className="capitalize">
                        {item.type}
                      </Badge>
                      {getReviewStatusBadge(item.reviewStatus)}
                      <Badge
                        variant="outline"
                        className="flex items-center gap-1"
                      >
                        <Calendar className="h-3 w-3" />{" "}
                        {formatDate(item.createdAt)}
                      </Badge>
                      {item.flagColor && (
                        <Badge variant="outline" className="capitalize">
                          {item.flagColor} flag
                        </Badge>
                      )}
                      {(item.tags || []).map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-xs"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </Link>
                <div className="flex items-center gap-1 ml-3">
                  <PinFlagControls
                    isPinned={item.isPinned || false}
                    flagColor={item.flagColor || null}
                    onPinToggle={() => handlePinToggle(item)}
                    onFlagToggle={() => handleFlagToggle(item)}
                    onFlagColorChange={(color) =>
                      handleFlagColorChange(item, color)
                    }
                    size="sm"
                  />
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-10">
              <Pin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No pinned items found</p>
              <p className="text-sm text-muted-foreground mt-2">
                Pin important items to find them quickly here.
              </p>
            </div>
          )}

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
