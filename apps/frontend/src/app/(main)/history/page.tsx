"use client";

import { Calendar, Clock, Filter, Search, User, X } from "lucide-react";
import { useEffect, useState } from "react";
import { MobileListsBackButton } from "@/components/mobile/mobile-lists-back-button";
import { AIAvatar } from "@/components/ui/ai-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { UserAvatar } from "@/components/ui/user-avatar";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/frontend-api";

// Types for history items (matching the API response structure)
type HistoryAction =
  | "create"
  | "update"
  | "delete"
  | "api_call"
  | "ai_prompt_image_response"
  | "ai_prompt_text_response"
  | "ai_prompt_error"
  | "api_content_upload"
  | "api_error_general";

type HistoryItemType =
  | "task"
  | "note"
  | "bookmark"
  | "document"
  | "photo"
  | "api"
  | "prompt"
  | "api_error"
  | "content_submission";

type HistoryActor = "user" | "assistant" | "system";

// Interface for history item
interface HistoryItem {
  id: string;
  action: HistoryAction;
  itemType: HistoryItemType;
  itemId: string;
  itemName: string;
  beforeData: any | null;
  afterData: any | null;
  actor: HistoryActor;
  timestamp: string;
}

export default function HistoryPage() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { data: auth } = useAuth();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [filterItemType, setFilterItemType] = useState("all");
  const [filterActor, setFilterActor] = useState("all");
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);

  // Fetch history from API
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setIsLoading(true);
        const response = await apiFetch("/api/history?limit=9999");
        if (response.ok) {
          const data = await response.json();
          // Handle different response structures - ensure we always get an array
          const historyArray = Array.isArray(data)
            ? data
            : data.records || data.history || data.entries || [];
          setHistory(historyArray);
        } else {
          toast({
            title: "Error",
            description: "Failed to load history",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Error fetching history:", error);
        toast({
          title: "Error",
          description: "Failed to load history",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [toast]);

  // Ensure history is always an array before filtering
  const filteredHistory = (history || []).filter((item) => {
    // Search filter
    const matchesSearch =
      item.itemName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.itemType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.action.toLowerCase().includes(searchQuery.toLowerCase());

    // Action filter
    const matchesAction =
      filterAction === "all" || item.action === filterAction;

    // Item type filter
    const matchesItemType =
      filterItemType === "all" || item.itemType === filterItemType;

    // Actor filter
    const matchesActor = filterActor === "all" || item.actor === filterActor;

    return matchesSearch && matchesAction && matchesItemType && matchesActor;
  });

  // Get active filter count for mobile badge (includes all 3 history filters)
  const getActiveFilterCount = () => {
    let count = 0;
    if (filterAction !== "all") count++;
    if (filterItemType !== "all") count++;
    if (filterActor !== "all") count++;
    return count;
  };

  // Clear all filters (includes all 3 history filters)
  const clearAllFilters = () => {
    setFilterAction("all");
    setFilterItemType("all");
    setFilterActor("all");
  };

  // Clear search input
  const clearSearch = () => {
    setSearchQuery("");
    // Focus the input after clearing
    const searchInput = document.querySelector(
      'input[placeholder="Search history..."]',
    ) as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "";

    try {
      const date = new Date(dateString);

      // Check if date is valid
      if (isNaN(date.getTime())) {
        // Try parsing as ISO date string
        const isoDate = new Date(dateString);
        if (!isNaN(isoDate.getTime())) {
          return isoDate.toLocaleDateString();
        }

        // Return the original string if parsing fails
        return dateString;
      }

      return date.toLocaleDateString();
    } catch (error) {
      console.error("Error formatting date:", dateString, error);
      return dateString;
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case "create":
        return (
          <Badge
            variant="outline"
            className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
          >
            Create
          </Badge>
        );
      case "update":
        return (
          <Badge
            variant="outline"
            className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
          >
            Update
          </Badge>
        );
      case "delete":
        return (
          <Badge
            variant="outline"
            className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
          >
            Delete
          </Badge>
        );
      case "api_call":
        return (
          <Badge
            variant="outline"
            className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300"
          >
            API Call
          </Badge>
        );
      default:
        return <Badge variant="outline">{action}</Badge>;
    }
  };

  const getItemTypeBadge = (itemType: string) => {
    switch (itemType) {
      case "task":
        return (
          <Badge
            variant="secondary"
            className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
          >
            Task
          </Badge>
        );
      case "note":
        return (
          <Badge
            variant="secondary"
            className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300"
          >
            Journal
          </Badge>
        );
      case "bookmark":
        return (
          <Badge
            variant="secondary"
            className="bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300"
          >
            Bookmark
          </Badge>
        );
      case "document":
        return (
          <Badge
            variant="secondary"
            className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300"
          >
            Document
          </Badge>
        );
      case "photo":
        return (
          <Badge
            variant="secondary"
            className="bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300"
          >
            Photo
          </Badge>
        );
      case "api":
        return (
          <Badge
            variant="secondary"
            className="bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-300"
          >
            API
          </Badge>
        );
      default:
        return <Badge variant="secondary">{itemType}</Badge>;
    }
  };

  // Adapter function to safely map auth user to UserAvatar expected format
  const adaptUserForAvatar = (user: any) => {
    if (!user) {
      return {
        id: "",
        email: "",
        displayName: null,
        fullName: null,
        avatarUrl: null,
        avatarColor: null,
      };
    }

    return {
      id: user.id || "",
      email: user.email || "",
      displayName: user.displayName || user.name || null,
      fullName: user.fullName || user.name || null,
      avatarUrl: user.avatarUrl || user.image || null,
      avatarColor: user.avatarColor || null,
    };
  };

  const getChangeDescription = (item: HistoryItem) => {
    if (item.action === "create") {
      return `Created ${item.itemType.toLowerCase()} "${item.itemName}"`;
    } else if (item.action === "update") {
      const beforeTitle = item.beforeData?.title || item.itemName;
      const afterTitle = item.afterData?.title || item.itemName;

      if (beforeTitle !== afterTitle) {
        return `Updated title from "${beforeTitle}" to "${afterTitle}"`;
      } else {
        return `Updated ${item.itemType.toLowerCase()} "${item.itemName}"`;
      }
    } else if (item.action === "delete") {
      return `Deleted ${item.itemType.toLowerCase()} "${item.itemName}"`;
    } else {
      return `Performed ${item.action} on ${item.itemType.toLowerCase()} "${item.itemName}"`;
    }
  };

  // FilterSortDialog component
  const FilterSortDialog = () => (
    <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Filter History</DialogTitle>
          <DialogDescription>
            Filter your activity history by action, item type, and actor.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Action Filter */}
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="action-filter" className="text-right font-medium">
              Action
            </label>
            <Select value={filterAction} onValueChange={setFilterAction}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="create">Create</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
                <SelectItem value="api_call">API Call</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Item Type Filter */}
          <div className="grid grid-cols-4 items-center gap-4">
            <label
              htmlFor="item-type-filter"
              className="text-right font-medium"
            >
              Item Type
            </label>
            <Select value={filterItemType} onValueChange={setFilterItemType}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Item Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="task">Task</SelectItem>
                <SelectItem value="bookmark">Bookmark</SelectItem>
                <SelectItem value="document">Document</SelectItem>
                <SelectItem value="photo">Photo</SelectItem>
                <SelectItem value="api">API</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Actor Filter */}
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="actor-filter" className="text-right font-medium">
              Actor
            </label>
            <Select value={filterActor} onValueChange={setFilterActor}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Actor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actors</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="assistant">Assistant</SelectItem>
                <SelectItem value="system">System</SelectItem>
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
      <div className="flex items-center gap-4">
        <MobileListsBackButton />
        <div>
          <h1 className="text-lg md:text-3xl font-bold md:tracking-tight">
            History
            {history.length > 0 && (
              <span className="ml-2 text-sm md:text-base font-normal text-muted-foreground">
                {filteredHistory.length === history.length
                  ? `(${history.length})`
                  : `(${filteredHistory.length} of ${history.length})`}
              </span>
            )}
          </h1>
          {!isMobile && (
            <p className="text-muted-foreground mt-2">
              View all activity in your account
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
              placeholder="Search history..."
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
            title="Filter history"
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
        <div className="hidden md:flex gap-2">
          <Select value={filterAction} onValueChange={setFilterAction}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="create">Create</SelectItem>
              <SelectItem value="update">Update</SelectItem>
              <SelectItem value="delete">Delete</SelectItem>
              <SelectItem value="api_call">API Call</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterItemType} onValueChange={setFilterItemType}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Item Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="task">Task</SelectItem>
              <SelectItem value="bookmark">Bookmark</SelectItem>
              <SelectItem value="document">Document</SelectItem>
              <SelectItem value="photo">Photo</SelectItem>
              <SelectItem value="api">API</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterActor} onValueChange={setFilterActor}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Actor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actors</SelectItem>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="assistant">Assistant</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 grid-cols-1">
          {Array.from({ length: 5 }).map((_, index) => (
            <Card key={index} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-5 bg-muted rounded w-1/4 mb-2"></div>
                <div className="h-4 bg-muted rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-4 bg-muted rounded w-3/4 mt-2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredHistory.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-6">
            <Filter className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-1">No history found</p>
            <p className="text-sm text-muted-foreground">
              Try adjusting your filters or search query
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1">
          {filteredHistory.map((item) => (
            <Card key={item.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    {getActionBadge(item.action)}
                    {getItemTypeBadge(item.itemType)}
                  </div>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Calendar className="mr-1 h-3 w-3" />
                    {formatDate(item.timestamp)}
                    <Clock className="ml-3 mr-1 h-3 w-3" />
                    {formatTime(item.timestamp)}
                  </div>
                </div>
                <CardTitle className="text-base font-medium mt-2">
                  {item.itemName}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">
                    {getChangeDescription(item)}
                    {" by "}
                    <span className="flex items-center inline-flex">
                      {item.actor === "user" ? (
                        auth?.user ? (
                          <UserAvatar
                            user={adaptUserForAvatar(auth.user)}
                            size="sm"
                            className="mr-1"
                          />
                        ) : (
                          <User className="mr-1 h-3 w-3" />
                        )
                      ) : item.actor === "assistant" ? (
                        <AIAvatar size="sm" className="mr-1" />
                      ) : (
                        <User className="mr-1 h-3 w-3" />
                      )}
                      {item.actor === "user"
                        ? auth?.user
                          ? (auth.user as any).displayName ||
                            (auth.user as any).name ||
                            auth.user.email ||
                            "You"
                          : "You"
                        : item.actor === "assistant"
                          ? "Assistant"
                          : "System"}
                    </span>
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filter Dialog */}
      <FilterSortDialog />
    </div>
  );
}
