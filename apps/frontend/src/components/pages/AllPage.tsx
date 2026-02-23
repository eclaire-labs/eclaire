import { Link } from "@tanstack/react-router";
import {
  BookMarked,
  Calendar,
  Clock,
  FileText,
  Filter,
  ImageIcon,
  ListTodo,
  Pin,
  Search,
  StickyNote,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { MobileListsBackButton } from "@/components/mobile/mobile-lists-back-button";
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
import { PinFlagControls } from "@/components/ui/pin-flag-controls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { apiFetch, setFlagColor, togglePin } from "@/lib/frontend-api";

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
  extractedText?: string | null;
  ocrText?: string | null;
}

export default function AllItemsPage() {
  const isMobile = useIsMobile();
  const [items, setItems] = useState<Item[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);

  // Fetch all items from API
  useEffect(() => {
    const fetchItems = async () => {
      try {
        setIsLoading(true);
        const response = await apiFetch("/api/all?limit=9999");
        if (response.ok) {
          const data = await response.json();
          // Handle different response structures - ensure we always get an array
          const itemsArray = Array.isArray(data)
            ? data
            : data.items || data.entries || [];
          setItems(itemsArray);
        } else {
          toast({
            title: "Error",
            description: "Failed to load items",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Error fetching items:", error);
        toast({
          title: "Error",
          description: "Failed to load items",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchItems();
  }, []);

  // Get unique tags from all items - ensure items is always an array
  const allTags = Array.from(
    new Set((items || []).flatMap((item) => item.tags || [])),
  );

  // Get active filter count for mobile badge
  const getActiveFilterCount = () => {
    let count = 0;
    if (filterType !== "all") count++;
    if (filterTag !== "all") count++;
    return count;
  };

  const filteredItems = (items || []).filter((item) => {
    const lowerCaseQuery = searchQuery.toLowerCase();

    // Search filter
    const matchesSearch =
      (item.title || "").toLowerCase().includes(lowerCaseQuery) ||
      (item.description || "").toLowerCase().includes(lowerCaseQuery) ||
      (item.extractedText || "").toLowerCase().includes(lowerCaseQuery) || // ADD THIS
      (item.ocrText || "").toLowerCase().includes(lowerCaseQuery) || // AND THIS
      (item.tags || []).some((tag) =>
        (tag || "").toLowerCase().includes(lowerCaseQuery),
      );

    // Type filter
    const matchesType = filterType === "all" || item.type === filterType;

    // Tag filter
    const matchesTag =
      filterTag === "all" || (item.tags || []).includes(filterTag);

    return matchesSearch && matchesType && matchesTag;
  });

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

  // Pin and flag handlers
  const handlePinToggle = async (item: Item) => {
    try {
      const response = await togglePin(
        getContentType(item.type),
        item.id,
        !item.isPinned,
      );
      if (response.ok) {
        const updatedItem = await response.json();
        setItems(
          items.map((i) =>
            i.id === item.id ? { ...i, isPinned: updatedItem.isPinned } : i,
          ),
        );
        toast({
          title: updatedItem.isPinned ? "Pinned" : "Unpinned",
          description: `${item.title} has been ${updatedItem.isPinned ? "pinned" : "unpinned"}.`,
        });
      }
    } catch (error) {
      console.error("Error toggling pin:", error);
      toast({
        title: "Error",
        description: "Failed to update pin status",
        variant: "destructive",
      });
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
        const updatedItem = await response.json();
        setItems(
          items.map((i) =>
            i.id === item.id ? { ...i, flagColor: updatedItem.flagColor } : i,
          ),
        );
        toast({
          title: newColor ? "Flagged" : "Unflagged",
          description: `${item.title} has been ${newColor ? "flagged" : "unflagged"}.`,
        });
      }
    } catch (error) {
      console.error("Error toggling flag:", error);
      toast({
        title: "Error",
        description: "Failed to update flag",
        variant: "destructive",
      });
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
        const updatedItem = await response.json();
        setItems(
          items.map((i) =>
            i.id === item.id ? { ...i, flagColor: updatedItem.flagColor } : i,
          ),
        );
        toast({
          title: "Flag Updated",
          description: `${item.title} flag changed to ${color}.`,
        });
      }
    } catch (error) {
      console.error("Error changing flag color:", error);
      toast({
        title: "Error",
        description: "Failed to update flag color",
        variant: "destructive",
      });
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

  const getReviewStatusBadge = (reviewStatus: string | undefined) => {
    switch (reviewStatus) {
      case "pending":
        return (
          <Badge
            variant="outline"
            className="bg-orange-100 text-orange-800 border-orange-200"
          >
            <Clock className="h-3 w-3 mr-1" />
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

  // Clear search input
  const clearSearch = () => {
    setSearchQuery("");
    // Focus the input after clearing
    const searchInput = document.querySelector(
      'input[placeholder="Search across all items..."]',
    ) as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
    }
  };

  // Clear all filters
  const clearAllFilters = () => {
    setFilterType("all");
    setFilterTag("all");
  };

  // FilterSortDialog component
  const FilterSortDialog = () => (
    <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Filter Items</DialogTitle>
          <DialogDescription>
            Filter and sort your items by type and tags.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Type Filter */}
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

          {/* Tag Filter */}
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
            <h1 className="text-lg md:text-3xl font-bold md:tracking-tight">
              All Items
              {items.length > 0 && (
                <span className="ml-2 text-sm md:text-base font-normal text-muted-foreground">
                  {filteredItems.length === items.length
                    ? `(${items.length})`
                    : `(${filteredItems.length} of ${items.length})`}
                </span>
              )}
            </h1>
            {!isMobile && (
              <p className="text-muted-foreground mt-2">
                Search and filter across all your content
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          {/* Search Input + Filter Button Container */}
          <div className="flex gap-2 flex-grow w-full md:w-auto">
            {/* Search Input */}
            <div className="relative flex-grow">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search across all items..."
                className={`pl-8 w-full ${searchQuery ? "pr-8" : ""}`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
                  title="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {/* Mobile filter button */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsFilterDialogOpen(true)}
              className="md:hidden shrink-0 relative"
              title="Filter items"
            >
              <Filter className="h-4 w-4" />
              {getActiveFilterCount() > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full h-4 w-4 flex items-center justify-center">
                  {getActiveFilterCount()}
                </span>
              )}
            </Button>
          </div>

          {/* Desktop filters - hidden on mobile */}
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
            // Loading skeleton
            Array(5)
              .fill(0)
              .map((_, index) => (
                <div
                  key={index}
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
          ) : filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <div
                key={item.id}
                className={`flex items-start justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors ${
                  item.isPinned ? "border-l-4 border-l-blue-500" : ""
                }`}
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
                      {item.isPinned && (
                        <Pin className="h-4 w-4 text-blue-500" />
                      )}
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
              <p className="text-muted-foreground">No items found</p>
            </div>
          )}
        </div>

        {/* Filter Dialog */}
        <FilterSortDialog />
      </div>
    </TooltipProvider>
  );
}
