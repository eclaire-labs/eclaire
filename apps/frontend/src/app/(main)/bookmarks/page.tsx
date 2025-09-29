"use client";

import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Download,
  Edit,
  ExternalLink,
  FileText,
  Filter,
  Globe,
  Image as ImageIcon,
  LayoutGrid,
  Link as LinkIcon,
  List,
  Loader2,
  MessageSquare, // Chat icon
  Monitor,
  MoreHorizontal,
  Plus,
  Search,
  Smartphone,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDropzone } from "react-dropzone";
import { MobileListsBackButton } from "@/components/mobile/mobile-lists-back-button";
import { SimpleProcessingStatusIcon } from "@/components/processing/SimpleProcessingStatusIcon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PinFlagControls } from "@/components/ui/pin-flag-controls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { useIsMobile } from "@/hooks/use-mobile";
import { useProcessingEvents } from "@/hooks/use-processing-status";
import { useToast } from "@/hooks/use-toast";
import { useViewPreferences } from "@/hooks/use-view-preferences";
import {
  getAbsoluteApiUrl,
  setFlagColor,
  togglePin,
} from "@/lib/frontend-api";
import type { Bookmark } from "@/types/bookmark";

// Helper function to format dates (handles both Unix timestamps and ISO strings)
const formatDate = (date: number | string | null | undefined) => {
  if (!date) return "N/A";
  try {
    let dateObj: Date;
    if (typeof date === "string") {
      // Handle ISO date strings
      dateObj = new Date(date);
    } else {
      // Handle Unix timestamps
      dateObj = new Date(date * 1000);
    }

    if (isNaN(dateObj.getTime())) {
      return "Invalid Date";
    }

    return dateObj.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch (error) {
    console.error("Error formatting date:", date, error);
    return "Invalid Date";
  }
};

const getDomainFromUrl = (url: string) => {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch (e) {
    return url;
  }
};

const getGroupDateLabel = (date: number | string): string => {
  if (!date) return "Unknown Date";
  try {
    let dateObj: Date;
    if (typeof date === "string") {
      // Handle ISO date strings
      dateObj = new Date(date);
    } else {
      // Handle Unix timestamps
      dateObj = new Date(date * 1000);
    }

    if (isNaN(dateObj.getTime())) {
      return "Unknown Date";
    }

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const dateOnly = new Date(
      dateObj.getFullYear(),
      dateObj.getMonth(),
      dateObj.getDate(),
    );
    const todayOnly = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const yesterdayOnly = new Date(
      yesterday.getFullYear(),
      yesterday.getMonth(),
      yesterday.getDate(),
    );

    if (dateOnly.getTime() === todayOnly.getTime()) return "Today";
    if (dateOnly.getTime() === yesterdayOnly.getTime()) return "Yesterday";

    return dateObj.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
    });
  } catch (error) {
    return "Unknown Date";
  }
};

// Helper function to normalize URLs by adding protocol if missing
const normalizeUrl = (url: string): string => {
  const trimmedUrl = url.trim();

  // If URL already has a protocol, return as-is
  if (trimmedUrl.match(/^https?:\/\//i)) {
    return trimmedUrl;
  }

  // Add https:// prefix for URLs without protocol
  return `https://${trimmedUrl}`;
};

export default function BookmarksPage() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const router = useRouter();

  // --- React Query Hook ---
  const {
    bookmarks,
    isLoading,
    error,
    createBookmark,
    updateBookmark,
    deleteBookmark,
    importBookmarks,
    refresh,
    isCreating,
    isUpdating,
    isDeleting,
    isImporting,
  } = useBookmarks();

  // --- Initialize SSE for real-time updates ---
  const { isConnected } = useProcessingEvents();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBookmark, setSelectedBookmark] = useState<Bookmark | null>(
    null,
  );
  const [isBookmarkDialogOpen, setIsBookmarkDialogOpen] = useState(false);
  const [isNewBookmarkDialogOpen, setIsNewBookmarkDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [newBookmarkUrl, setNewBookmarkUrl] = useState("");
  const [filterTag, setFilterTag] = useState("all");
  const [tagInput, setTagInput] = useState("");
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  // Use view preferences hook instead of individual state variables
  const [viewPreferences, updateViewPreference, isPreferencesLoaded] =
    useViewPreferences("bookmarks");
  const { viewMode, sortBy, sortDir } = viewPreferences;

  // Mobile filter dialog state
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);

  // Add deletion confirmation dialog state
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] =
    useState(false);
  const [bookmarkToDelete, setBookmarkToDelete] = useState<Bookmark | null>(
    null,
  );

  const bookmarksContainerRef = useRef<HTMLDivElement>(null);

  // --- Error Handling ---
  useEffect(() => {
    if (error) {
      toast({
        title: "Error Loading Bookmarks",
        description:
          error instanceof Error ? error.message : "Failed to load bookmarks",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  const allTags = useMemo(
    () => Array.from(new Set((bookmarks || []).flatMap((b) => b.tags || []))),
    [bookmarks],
  );

  const filteredBookmarks = useMemo(() => {
    return bookmarks.filter((bookmark) => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        (bookmark.title || "").toLowerCase().includes(searchLower) ||
        (bookmark.url || "").toLowerCase().includes(searchLower) ||
        (bookmark.description || "").toLowerCase().includes(searchLower) ||
        (bookmark.extractedText || "").toLowerCase().includes(searchLower) || // ADD THIS LINE
        (bookmark.tags || []).some((tag) =>
          tag.toLowerCase().includes(searchLower),
        );
      const matchesTag =
        filterTag === "all" || (bookmark.tags || []).includes(filterTag);
      return matchesSearch && matchesTag;
    });
  }, [bookmarks, searchQuery, filterTag]);

  const sortedAndFilteredBookmarks = useMemo(() => {
    return [...filteredBookmarks].sort((a, b) => {
      let compareResult = 0;
      switch (sortBy) {
        case "title":
          compareResult = (a.title || "")
            .toLowerCase()
            .localeCompare((b.title || "").toLowerCase());
          break;
        case "url":
          compareResult = getDomainFromUrl(a.url)
            .toLowerCase()
            .localeCompare(getDomainFromUrl(b.url).toLowerCase());
          break;
        default: {
          // createdAt
          // Handle both Unix timestamps and ISO date strings
          const getTimestamp = (date: number | string) => {
            if (typeof date === "string") {
              return new Date(date).getTime();
            }
            return date * 1000;
          };
          compareResult = getTimestamp(b.createdAt) - getTimestamp(a.createdAt); // Default desc for dates
          break;
        }
      }
      return compareResult * (sortDir === "asc" ? 1 : -1);
    });
  }, [filteredBookmarks, sortBy, sortDir]);

  // 2. UPDATED CREATE BOOKMARK HANDLER
  const handleCreateBookmark = async () => {
    if (!newBookmarkUrl.trim()) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid URL.",
        variant: "destructive",
      });
      return;
    }

    // Normalize the URL by adding protocol if missing
    const normalizedUrl = normalizeUrl(newBookmarkUrl);

    // Validate the normalized URL
    if (!URL.canParse(normalizedUrl)) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid URL.",
        variant: "destructive",
      });
      return;
    }

    try {
      await createBookmark({ url: normalizedUrl });
      setNewBookmarkUrl("");
      setIsNewBookmarkDialogOpen(false);
      toast({
        title: "Bookmark Added",
        description: "We've started processing your bookmark.",
      });
    } catch (err) {
      // Error handling is done in the mutation
      console.error("Create bookmark error:", err);
    }
  };

  const handleUpdateBookmark = async () => {
    if (!selectedBookmark) return;
    try {
      await updateBookmark(selectedBookmark.id, {
        title: selectedBookmark.title,
        description: selectedBookmark.description,
        tags: selectedBookmark.tags,
      });
      setIsEditMode(false);
      toast({
        title: "Bookmark updated",
        description: "Your bookmark has been updated successfully.",
      });
    } catch (err) {
      // Error handling is done in the mutation
      console.error("Update bookmark error:", err);
    }
  };

  const openDeleteDialog = useCallback((bookmark: Bookmark) => {
    setBookmarkToDelete(bookmark);
    setIsConfirmDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirmed = useCallback(async () => {
    if (!bookmarkToDelete) return;

    try {
      await deleteBookmark(bookmarkToDelete.id);
      setIsBookmarkDialogOpen(false);
      setIsConfirmDeleteDialogOpen(false);
      setBookmarkToDelete(null);
      toast({
        title: "Bookmark deleted",
        description: "Your bookmark has been deleted.",
      });
    } catch (err) {
      // Error handling is done in the mutation
      console.error("Delete bookmark error:", err);
    }
  }, [bookmarkToDelete, deleteBookmark, toast]);

  const handlePinToggle = useCallback(
    async (bookmarkId: string, currentlyPinned: boolean) => {
      try {
        const response = await togglePin(
          "bookmarks",
          bookmarkId,
          !currentlyPinned,
        );
        if (response.ok) {
          // Refresh data to reflect changes
          refresh();
          toast({
            title: currentlyPinned ? "Unpinned" : "Pinned",
            description: `Bookmark has been ${currentlyPinned ? "unpinned" : "pinned"}.`,
          });
        } else {
          toast({
            title: "Error",
            description: "Failed to update pin status",
            variant: "destructive",
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
    },
    [refresh, toast],
  );

  const handleFlagToggle = useCallback(
    async (bookmarkId: string, currentColor: string | null) => {
      const newColor = currentColor ? null : "orange"; // Default to orange when flagging
      try {
        const response = await setFlagColor("bookmarks", bookmarkId, newColor);
        if (response.ok) {
          // Refresh data to reflect changes
          refresh();
          toast({
            title: newColor ? "Flagged" : "Unflagged",
            description: `Bookmark has been ${newColor ? "flagged" : "unflagged"}.`,
          });
        } else {
          toast({
            title: "Error",
            description: "Failed to update flag",
            variant: "destructive",
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
    },
    [refresh, toast],
  );

  const handleFlagColorChange = useCallback(
    async (
      bookmarkId: string,
      color: "red" | "yellow" | "orange" | "green" | "blue",
    ) => {
      try {
        const response = await setFlagColor("bookmarks", bookmarkId, color);
        if (response.ok) {
          // Refresh data to reflect changes
          refresh();
          toast({
            title: "Flag Updated",
            description: `Bookmark flag changed to ${color}.`,
          });
        } else {
          toast({
            title: "Error",
            description: "Failed to update flag color",
            variant: "destructive",
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
    },
    [refresh, toast],
  );

  // ... (other handlers like handleTagFilterChange, handleSortByChange, etc. remain largely the same) ...
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) =>
    setSearchQuery(event.target.value);
  const handleTagFilterChange = (value: string) => setFilterTag(value);
  const handleSortByChange = (value: string) =>
    updateViewPreference("sortBy", value as "createdAt" | "title" | "url");
  const toggleSortDir = () =>
    updateViewPreference("sortDir", sortDir === "asc" ? "desc" : "asc");

  // Clear search input
  const clearSearch = () => {
    setSearchQuery("");
    // Focus the input after clearing
    const searchInput = document.querySelector(
      'input[placeholder="Search bookmarks..."]',
    ) as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
    }
  };

  const handleViewModeChange = (value: string) => {
    if (value) updateViewPreference("viewMode", value as "tile" | "list");
  };
  const handleBookmarkClick = useCallback(
    (bookmark: Bookmark) => {
      // Navigate to the dedicated bookmark page instead of opening modal
      router.push(`/bookmarks/${bookmark.id}`);
    },
    [router],
  );
  const openEditDialog = useCallback((bookmark: Bookmark) => {
    setSelectedBookmark(bookmark);
    setIsEditMode(true);
    setIsBookmarkDialogOpen(true);
  }, []);

  const handleAddTag = () => {
    if (!tagInput.trim() || !selectedBookmark) return;
    const tag = tagInput.trim().toLowerCase();
    if (isEditMode && !selectedBookmark.tags.includes(tag)) {
      setSelectedBookmark({
        ...selectedBookmark,
        tags: [...selectedBookmark.tags, tag],
      });
    }
    setTagInput("");
  };
  const handleRemoveTag = (tag: string) => {
    if (isEditMode && selectedBookmark) {
      setSelectedBookmark({
        ...selectedBookmark,
        tags: selectedBookmark.tags.filter((t) => t !== tag),
      });
    }
  };

  // Handle chat button click
  const handleChatClick = (bookmark: Bookmark) => {
    // Use the global function to open assistant with pre-attached assets
    if (
      typeof window !== "undefined" &&
      (window as any).openAssistantWithAssets
    ) {
      (window as any).openAssistantWithAssets([
        {
          type: "bookmark",
          id: bookmark.id,
          title: bookmark.title,
        },
      ]);
    }
  };

  // File upload handler
  const handleFileUpload = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;

      // Validate file size (5MB limit)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        toast({
          title: "File too large",
          description: "Please upload a file smaller than 5MB.",
          variant: "destructive",
        });
        return;
      }

      try {
        const formData = new FormData();
        formData.append("file", file);

        const result = await importBookmarks(formData);
        toast({
          title: "Import successful",
          description: `Imported ${result.imported} bookmarks. ${result.queued} queued for processing.`,
        });
      } catch (err) {
        // Error handling is done in the mutation
        console.error("Import bookmarks error:", err);
      }
    },
    [toast, importBookmarks],
  );

  // Dropzone configuration
  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop: handleFileUpload,
      // Accept any file type, we'll validate the JSON format after reading
      maxSize: 5 * 1024 * 1024, // 5MB
      multiple: false,
      noClick: true,
      noKeyboard: true,
      onDropRejected: (rejectedFiles) => {
        const file = rejectedFiles[0];
        if (file.errors.some((error) => error.code === "file-too-large")) {
          toast({
            title: "File too large",
            description: "Please upload a file smaller than 5MB.",
            variant: "destructive",
          });
        }
      },
    });

  const renderContent = () => {
    if (isLoading && bookmarks.length === 0) {
      return (
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-medium mb-2">Loading Bookmarks...</h2>
          </div>
        </div>
      );
    }

    if (error && bookmarks.length === 0) {
      return (
        <div className="container mx-auto py-10 text-center">
          <Alert variant="destructive" className="max-w-md mx-auto">
            <AlertTitle>Error Loading Bookmarks</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
          <Button onClick={refresh} className="mt-6">
            Try Again
          </Button>
        </div>
      );
    }

    if (sortedAndFilteredBookmarks.length === 0 && !isLoading) {
      return (
        <div className="text-center py-16 text-muted-foreground">
          <Globe className="h-16 w-16 mx-auto mb-4 text-gray-400" />
          <p className="mb-4">
            {bookmarks.length === 0
              ? "Your bookmark collection is empty."
              : "No bookmarks found matching your criteria."}
          </p>
          {bookmarks.length === 0 && (
            <p>
              Drag and drop bookmark files here or use the add bookmark button.
            </p>
          )}
        </div>
      );
    }

    return (
      <div ref={bookmarksContainerRef} tabIndex={-1} className="outline-none">
        {viewMode === "tile" ? (
          <TileView
            bookmarks={sortedAndFilteredBookmarks}
            sortBy={sortBy}
            onBookmarkClick={handleBookmarkClick}
            onEditClick={openEditDialog}
            onDeleteClick={openDeleteDialog}
            onPinToggle={handlePinToggle}
            onFlagToggle={handleFlagToggle}
            onFlagColorChange={handleFlagColorChange}
            onChatClick={handleChatClick}
          />
        ) : (
          <ListView
            bookmarks={sortedAndFilteredBookmarks}
            onBookmarkClick={handleBookmarkClick}
            onEditClick={openEditDialog}
            onDeleteClick={openDeleteDialog}
            onPinToggle={handlePinToggle}
            onFlagToggle={handleFlagToggle}
            onFlagColorChange={handleFlagColorChange}
            onChatClick={handleChatClick}
          />
        )}
      </div>
    );
  };

  // Helper function to count active filters for Bookmarks
  const getActiveFilterCount = () => {
    let count = 0;
    if (filterTag !== "all") count++;
    return count;
  };

  // Helper function to clear all filters for Bookmarks
  const clearAllFilters = () => {
    setFilterTag("all");
  };

  // FilterSortDialog component for Bookmarks
  const FilterSortDialog = () => (
    <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Filter & Sort Bookmarks</DialogTitle>
          <DialogDescription>
            Customize how you view and organize your bookmarks.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Filters Section */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              Filters
            </h4>

            {/* Tag Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Tag</label>
              <Select value={filterTag} onValueChange={handleTagFilterChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Filter by Tag" />
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

          {/* Sort Section */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              Sort & View
            </h4>

            {/* Sort By */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Sort By</label>
              <Select value={sortBy} onValueChange={handleSortByChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="createdAt">Date Added</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="url">Domain</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort Direction */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Sort Direction</label>
              <Button
                variant="outline"
                onClick={toggleSortDir}
                className="w-full justify-start"
              >
                {sortDir === "asc" ? (
                  <>
                    <ArrowUp className="mr-2 h-4 w-4" />
                    Ascending
                  </>
                ) : (
                  <>
                    <ArrowDown className="mr-2 h-4 w-4" />
                    Descending
                  </>
                )}
              </Button>
            </div>

            {/* View Mode */}
            <div className="space-y-2">
              <label className="text-sm font-medium">View Mode</label>
              <ToggleGroup
                type="single"
                value={viewMode}
                onValueChange={handleViewModeChange}
                className="w-full justify-start"
              >
                <ToggleGroupItem
                  value="tile"
                  aria-label="Tile view"
                  className="flex-1"
                >
                  <LayoutGrid className="mr-2 h-4 w-4" />
                  Tiles
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="list"
                  aria-label="List view"
                  className="flex-1"
                >
                  <List className="mr-2 h-4 w-4" />
                  List
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
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
      <div
        {...getRootProps()}
        className={`min-h-screen relative ${isDragActive ? "bg-blue-50 dark:bg-blue-900/30 outline-dashed outline-2 outline-blue-500" : ""}`}
      >
        <input {...getInputProps()} />

        {/* Drag overlay */}
        {(isDragActive || isImporting) && (
          <div className="absolute inset-0 bg-black/10 dark:bg-white/10 flex items-center justify-center z-50 pointer-events-none">
            <div className="text-center p-6 bg-background rounded-lg shadow-xl">
              {isImporting ? (
                <>
                  <Loader2 className="h-16 w-16 text-blue-500 mx-auto mb-4 animate-spin" />
                  <p className="text-xl font-semibold mb-2">
                    Importing bookmarks...
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Processing your bookmark file
                  </p>
                </>
              ) : isDragReject ? (
                <>
                  <AlertCircle className="h-16 w-16 mx-auto mb-4 text-red-500" />
                  <p className="text-xl font-semibold mb-2">File too large</p>
                  <p className="text-sm text-muted-foreground">
                    Please drop a file smaller than 5MB
                  </p>
                </>
              ) : (
                <>
                  <Upload className="h-16 w-16 text-blue-500 mx-auto mb-4" />
                  <p className="text-xl font-semibold mb-2">
                    Drop bookmarks to upload
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Supports bookmark export files
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        <div className="space-y-6">
          {/* Error Indicators (Inline if content already exists) */}
          {error && bookmarks.length > 0 && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Update Error</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <MobileListsBackButton />
              <div>
                <h1 className="text-lg md:text-3xl font-bold md:tracking-tight">
                  Bookmarks
                  {bookmarks.length > 0 && (
                    <span className="ml-2 text-sm md:text-base font-normal text-muted-foreground">
                      {sortedAndFilteredBookmarks.length === bookmarks.length
                        ? `(${bookmarks.length})`
                        : `(${sortedAndFilteredBookmarks.length} of ${bookmarks.length})`}
                    </span>
                  )}
                </h1>
              </div>
            </div>
            <Button onClick={() => setIsNewBookmarkDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> New Bookmark
            </Button>
          </div>

          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            {/* Search Input + Filter Button Container */}
            <div className="flex gap-2 flex-grow w-full md:w-auto">
              {/* Search Input */}
              <div className="relative flex-grow">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search bookmarks..."
                  className={`pl-10 w-full ${searchQuery ? "pr-10" : ""}`}
                  value={searchQuery}
                  onChange={handleSearchChange}
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
                title="Filter and sort bookmarks"
              >
                <Filter className="h-4 w-4" />
                {filterTag !== "all" && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full h-4 w-4 flex items-center justify-center">
                    1
                  </span>
                )}
              </Button>
            </div>

            {/* Filter & Sort - Hidden on mobile, shown on desktop */}
            <div className="hidden md:flex flex-wrap gap-2 w-full md:w-auto">
              <Select value={filterTag} onValueChange={handleTagFilterChange}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="Filter by Tag" />
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
              <Select value={sortBy} onValueChange={handleSortByChange}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="createdAt">Date Added</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="url">Domain</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={toggleSortDir}
                title={`Sort: ${sortDir === "asc" ? "Asc" : "Desc"}`}
              >
                {sortDir === "asc" ? (
                  <ArrowUp className="h-4 w-4" />
                ) : (
                  <ArrowDown className="h-4 w-4" />
                )}
              </Button>

              {/* View Switcher */}
              <ToggleGroup
                type="single"
                value={viewMode}
                onValueChange={handleViewModeChange}
                className="w-auto justify-start"
              >
                <ToggleGroupItem value="tile" aria-label="Tile view">
                  <LayoutGrid className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="list" aria-label="List view">
                  <List className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {renderContent()}

          <Dialog
            open={isNewBookmarkDialogOpen}
            onOpenChange={setIsNewBookmarkDialogOpen}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Bookmark</DialogTitle>
                <DialogDescription>
                  Enter the URL of the page you want to save.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="url">URL</Label>
                  <Input
                    id="url"
                    type="url"
                    placeholder="https://example.com"
                    value={newBookmarkUrl}
                    onChange={(e) => setNewBookmarkUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreateBookmark();
                      }
                    }}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsNewBookmarkDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreateBookmark} disabled={isCreating}>
                  {isCreating && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {selectedBookmark && (
            <Dialog
              open={isBookmarkDialogOpen}
              onOpenChange={setIsBookmarkDialogOpen}
            >
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {isEditMode ? "Edit Bookmark" : "Bookmark Details"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-title">Title</Label>
                    <Input
                      id="edit-title"
                      value={selectedBookmark.title || ""}
                      onChange={(e) =>
                        setSelectedBookmark({
                          ...selectedBookmark,
                          title: e.target.value,
                        })
                      }
                      readOnly={!isEditMode}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-url">URL</Label>
                    <Input
                      id="edit-url"
                      type="url"
                      value={selectedBookmark.url || ""}
                      readOnly
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-description">Description</Label>
                    <Textarea
                      id="edit-description"
                      value={selectedBookmark.description || ""}
                      onChange={(e) =>
                        setSelectedBookmark({
                          ...selectedBookmark,
                          description: e.target.value,
                        })
                      }
                      readOnly={!isEditMode}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tags</Label>
                    {isEditMode ? (
                      <>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {selectedBookmark.tags.map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="flex items-center gap-1"
                            >
                              {tag}
                              <button
                                type="button"
                                className="h-4 w-4 ml-1"
                                onClick={() => handleRemoveTag(tag)}
                              >
                                ×
                              </button>
                            </Badge>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Add a tag..."
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddTag();
                              }
                            }}
                          />
                          <Button type="button" onClick={handleAddTag}>
                            Add
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-wrap gap-2 pt-2">
                        {selectedBookmark.tags.length > 0 ? (
                          selectedBookmark.tags.map((tag) => (
                            <Badge key={tag} variant="outline">
                              {tag}
                            </Badge>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No tags
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 3. NEW DETAILS SECTION */}
                  {!isEditMode && (
                    <div className="space-y-4 pt-4 border-t">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div>
                          <Label>Author</Label>
                          <p className="text-muted-foreground">
                            {selectedBookmark.author || "N/A"}
                          </p>
                        </div>
                        <div>
                          <Label>Language</Label>
                          <p className="text-muted-foreground">
                            {selectedBookmark.lang || "N/A"}
                          </p>
                        </div>
                        <div>
                          <Label>Added On</Label>
                          <p className="text-muted-foreground">
                            {formatDate(selectedBookmark.createdAt)}
                          </p>
                        </div>
                        <div>
                          <Label>Page Last Updated</Label>
                          <p className="text-muted-foreground">
                            {formatDate(selectedBookmark.pageLastUpdatedAt)}
                          </p>
                        </div>
                      </div>
                      <div>
                        <Label>Screenshots</Label>
                        <div className="flex flex-wrap gap-2 pt-2">
                          {selectedBookmark.screenshotFullPageUrl && (
                            <Button variant="outline" size="sm" asChild>
                              <a
                                href={getAbsoluteApiUrl(
                                  selectedBookmark.screenshotFullPageUrl,
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Monitor className="mr-2 h-4 w-4" />
                                Desktop
                              </a>
                            </Button>
                          )}
                          {selectedBookmark.screenshotMobileUrl && (
                            <Button variant="outline" size="sm" asChild>
                              <a
                                href={getAbsoluteApiUrl(
                                  selectedBookmark.screenshotMobileUrl,
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Smartphone className="mr-2 h-4 w-4" />
                                Mobile
                              </a>
                            </Button>
                          )}
                          {!selectedBookmark.screenshotFullPageUrl &&
                            !selectedBookmark.screenshotMobileUrl && (
                              <p className="text-sm text-muted-foreground">
                                No screenshots available yet.
                              </p>
                            )}
                        </div>
                      </div>
                      <div>
                        <Label>Archived Content</Label>
                        <div className="flex flex-wrap gap-2 pt-2">
                          {selectedBookmark.pdfUrl && (
                            <Button variant="outline" size="sm" asChild>
                              <a
                                href={getAbsoluteApiUrl(
                                  selectedBookmark.pdfUrl,
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Download className="mr-2 h-4 w-4" />
                                PDF
                              </a>
                            </Button>
                          )}
                          {selectedBookmark.contentUrl && (
                            <Button variant="outline" size="sm" asChild>
                              <a
                                href={getAbsoluteApiUrl(
                                  selectedBookmark.contentUrl,
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <BookOpen className="mr-2 h-4 w-4" />
                                Readable
                              </a>
                            </Button>
                          )}
                          {!selectedBookmark.pdfUrl &&
                            !selectedBookmark.contentUrl && (
                              <p className="text-sm text-muted-foreground">
                                No archived content available yet.
                              </p>
                            )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  {isEditMode ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setIsEditMode(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleUpdateBookmark}
                        disabled={isUpdating}
                      >
                        {isUpdating && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Save Changes
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setIsBookmarkDialogOpen(false)}
                      >
                        Close
                      </Button>
                      <Button onClick={() => setIsEditMode(true)}>Edit</Button>
                    </>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {/* Deletion Confirmation Dialog */}
          <Dialog
            open={isConfirmDeleteDialogOpen}
            onOpenChange={setIsConfirmDeleteDialogOpen}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Confirm Deletion</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete this bookmark? This action
                  cannot be undone.
                </DialogDescription>
              </DialogHeader>
              {bookmarkToDelete && (
                <div className="my-4 flex items-start gap-3 p-3 border rounded-md bg-muted/50">
                  <Favicon
                    bookmark={bookmarkToDelete}
                    className="h-6 w-6 flex-shrink-0 mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium break-words line-clamp-2 leading-tight">
                      {bookmarkToDelete.title || "Untitled"}
                    </p>
                    <p className="text-sm text-muted-foreground truncate mt-1">
                      {bookmarkToDelete.url}
                    </p>
                  </div>
                </div>
              )}
              <DialogFooter className="sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsConfirmDeleteDialogOpen(false);
                    setBookmarkToDelete(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteConfirmed}
                  disabled={isDeleting}
                >
                  {isDeleting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Delete Bookmark
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Filter & Sort Dialog */}
          <FilterSortDialog />
        </div>
      </div>
    </TooltipProvider>
  );
}

// --- Child Components for Views ---

interface ViewProps {
  bookmarks: Bookmark[];
  onBookmarkClick: (bookmark: Bookmark) => void;
  onEditClick: (bookmark: Bookmark) => void;
  onDeleteClick: (bookmark: Bookmark) => void;
  onPinToggle: (bookmarkId: string, currentlyPinned: boolean) => void;
  onFlagToggle: (bookmarkId: string, currentColor: string | null) => void;
  onFlagColorChange: (
    bookmarkId: string,
    color: "red" | "yellow" | "orange" | "green" | "blue",
  ) => void;
  onChatClick: (bookmark: Bookmark) => void;
}

function TileView({
  bookmarks,
  sortBy,
  onChatClick,
  ...props
}: ViewProps & { sortBy: string }) {
  let lastGroupLabel = "";
  const isGrouped = sortBy === "createdAt";

  return (
    <div
      className="grid gap-4 md:gap-6"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}
    >
      {bookmarks.map((bookmark) => {
        const currentGroupLabel = isGrouped
          ? getGroupDateLabel(bookmark.createdAt)
          : "";
        const showGroupHeader =
          isGrouped && currentGroupLabel !== lastGroupLabel;
        if (showGroupHeader) lastGroupLabel = currentGroupLabel;
        return (
          <React.Fragment key={bookmark.id}>
            {showGroupHeader && (
              <h2 className="col-span-full text-lg font-semibold mt-6 mb-2 pl-1 border-b pb-1">
                {currentGroupLabel}
              </h2>
            )}
            <BookmarkTileItem
              bookmark={bookmark}
              onChatClick={onChatClick}
              {...props}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
}

function BookmarkTileItem({
  bookmark,
  onBookmarkClick,
  onEditClick,
  onDeleteClick,
  onPinToggle,
  onFlagToggle,
  onFlagColorChange,
  onChatClick,
}: { bookmark: Bookmark } & Omit<ViewProps, "bookmarks">) {
  const thumbnailUrl = bookmark.thumbnailUrl;

  return (
    <Card
      className="flex flex-col cursor-pointer hover:shadow-md transition-shadow group w-full h-full"
      onClick={() => onBookmarkClick(bookmark)}
    >
      {/* 2. THUMBNAIL IN CARD VIEW */}
      <div className="relative aspect-video w-full bg-muted overflow-hidden rounded-t-lg flex-shrink-0">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={`Thumbnail of ${bookmark.title}`}
            className="object-cover w-full h-full"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
              const fallbackDiv = target.nextElementSibling as HTMLElement;
              if (fallbackDiv) {
                fallbackDiv.style.display = "flex";
              }
            }}
          />
        ) : null}
        {/* Fallback icon container */}
        <div
          className={`${thumbnailUrl ? "hidden" : "flex"} items-center justify-center w-full h-full bg-muted`}
        >
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        </div>

        {/* Processing Status Icon */}
        <div className="absolute top-2 left-2">
          <SimpleProcessingStatusIcon
            status={bookmark.processingStatus}
            enabled={bookmark.enabled}
            className="bg-white/90 dark:bg-black/90 rounded-full p-1"
          />
        </div>
      </div>
      <CardHeader className="pb-2 flex-grow">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle
              className="line-clamp-2 text-base font-semibold"
              title={bookmark.title || bookmark.url}
            >
              {bookmark.title || bookmark.url}
            </CardTitle>
            <CardDescription className="flex items-center text-xs text-muted-foreground mt-1">
              <Favicon
                bookmark={bookmark}
                className="mr-1.5 h-4 w-4 flex-shrink-0"
              />
              <span className="truncate">{getDomainFromUrl(bookmark.url)}</span>
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <PinFlagControls
              isPinned={bookmark.isPinned || false}
              flagColor={bookmark.flagColor}
              onPinToggle={() =>
                onPinToggle(bookmark.id, bookmark.isPinned || false)
              }
              onFlagToggle={() => onFlagToggle(bookmark.id, bookmark.flagColor)}
              onFlagColorChange={(color) =>
                onFlagColorChange(bookmark.id, color)
              }
              size="sm"
            />
            {/* Chat Icon */}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onChatClick(bookmark);
              }}
              title="Chat about this bookmark"
            >
              <MessageSquare className="h-3 w-3 text-gray-400" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem onClick={() => onBookmarkClick(bookmark)}>
                  <FileText className="mr-2 h-4 w-4" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => window.open(bookmark.url, "_blank")}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Link
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEditClick(bookmark)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDeleteClick(bookmark)}
                  className="text-red-500"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {bookmark.description || "No description available."}
        </p>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-1 pt-2">
        {bookmark.tags.slice(0, 3).map((tag) => (
          <Badge key={tag} variant="secondary" className="text-xs">
            {tag}
          </Badge>
        ))}
        {bookmark.tags.length > 3 && (
          <Badge variant="outline" className="text-xs">
            +{bookmark.tags.length - 3}
          </Badge>
        )}
      </CardFooter>
    </Card>
  );
}

function ListView({ bookmarks, onChatClick, ...props }: ViewProps) {
  return (
    <div className="border rounded-md overflow-hidden">
      <div className="divide-y divide-border">
        <div className="flex items-center px-4 py-2 bg-muted/50 text-sm font-medium text-muted-foreground">
          <div className="w-10 flex-shrink-0 mr-3" />
          <div className="flex-1 min-w-0 mr-4">Title</div>
          <div className="w-40 hidden md:block mr-4">Domain</div>
          <div className="w-32 hidden sm:block mr-4">Date Added</div>
          <div className="w-32 hidden lg:block mr-4">Tags</div>
          <div className="w-20 flex-shrink-0">Actions</div>
        </div>
        {bookmarks.map((bookmark) => (
          <BookmarkListItem
            key={bookmark.id}
            bookmark={bookmark}
            onChatClick={onChatClick}
            {...props}
          />
        ))}
      </div>
    </div>
  );
}

function BookmarkListItem({
  bookmark,
  onBookmarkClick,
  onEditClick,
  onDeleteClick,
  onPinToggle,
  onFlagToggle,
  onFlagColorChange,
  onChatClick,
}: { bookmark: Bookmark } & Omit<ViewProps, "bookmarks">) {
  return (
    <div
      className="flex items-center px-4 py-2.5 hover:bg-muted/50 cursor-pointer"
      onClick={() => onBookmarkClick(bookmark)}
    >
      <div className="w-10 flex-shrink-0 mr-3 flex items-center justify-center relative">
        <Favicon bookmark={bookmark} className="h-6 w-6" />
        {/* Processing Status Icon */}
        <div className="absolute -top-1 -right-1">
          <SimpleProcessingStatusIcon
            status={bookmark.processingStatus}
            enabled={bookmark.enabled}
            className="bg-white/90 dark:bg-black/90 rounded-full p-0.5"
          />
        </div>
      </div>
      <div className="flex-1 min-w-0 mr-4">
        <p
          className="text-sm font-medium truncate"
          title={bookmark.title || ""}
        >
          {bookmark.title || "Untitled"}
        </p>

        {/* --- CHANGED: Replaced description with originalUrl --- */}
        <p
          className="text-xs text-muted-foreground truncate"
          title={bookmark.url}
        >
          {bookmark.url}
        </p>
        {/* --- END CHANGE --- */}
      </div>
      <div className="w-40 hidden md:block mr-4 text-sm text-muted-foreground truncate">
        {getDomainFromUrl(bookmark.url)}
      </div>
      <div className="w-32 hidden sm:block mr-4 text-sm text-muted-foreground">
        {formatDate(bookmark.createdAt)}
      </div>
      <div className="w-32 hidden lg:flex flex-wrap gap-1 items-center mr-4">
        {bookmark.tags.slice(0, 2).map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="text-xs px-1 py-0 font-normal"
          >
            {tag}
          </Badge>
        ))}
        {bookmark.tags.length > 2 && (
          <Badge variant="outline" className="text-xs px-1 py-0 font-normal">
            +{bookmark.tags.length - 2}
          </Badge>
        )}
      </div>
      <div className="w-20 flex items-center justify-end gap-1 flex-shrink-0">
        <PinFlagControls
          isPinned={bookmark.isPinned || false}
          flagColor={bookmark.flagColor}
          onPinToggle={() =>
            onPinToggle(bookmark.id, bookmark.isPinned || false)
          }
          onFlagToggle={() => onFlagToggle(bookmark.id, bookmark.flagColor)}
          onFlagColorChange={(color) => onFlagColorChange(bookmark.id, color)}
          size="sm"
        />
        {/* Chat Icon */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onChatClick(bookmark);
          }}
          title="Chat about this bookmark"
        >
          <MessageSquare className="h-3 w-3 text-gray-400" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => onBookmarkClick(bookmark)}>
              <FileText className="mr-2 h-4 w-4" /> View Details
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => window.open(bookmark.url, "_blank")}
            >
              <ExternalLink className="mr-2 h-4 w-4" /> Open Link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEditClick(bookmark)}>
              <Edit className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDeleteClick(bookmark)}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// Reusable Favicon component with fallback
function Favicon({
  bookmark,
  className,
}: {
  bookmark: Bookmark;
  className?: string;
}) {
  const [error, setError] = useState(false);
  const faviconUrl = bookmark.faviconUrl
    ? getAbsoluteApiUrl(bookmark.faviconUrl)
    : null;

  useEffect(() => {
    setError(false); // Reset error state when bookmark changes
  }, [bookmark.id]);

  if (error || !faviconUrl) {
    return <LinkIcon className={className} />;
  }

  // Check if this is a GitHub domain to apply dark mode inversion
  const isGitHubDomain =
    bookmark.url.includes("github.com") || bookmark.url.includes("github.io");
  const darkModeClasses = isGitHubDomain ? "dark:brightness-0 dark:invert" : "";

  return (
    <img
      src={faviconUrl}
      alt="favicon"
      className={`${className} ${darkModeClasses}`}
      onError={() => setError(true)}
    />
  );
}
