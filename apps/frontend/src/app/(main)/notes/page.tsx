"use client";

import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Edit,
  FileText,
  Filter,
  LayoutGrid,
  List,
  Loader2,
  MessageSquare, // Chat icon
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useRouter } from "next/navigation";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { MarkdownPreview } from "@/components/markdown-preview";
import { MobileListsBackButton } from "@/components/mobile/mobile-lists-back-button";
import { SimpleProcessingStatusIcon } from "@/components/processing/SimpleProcessingStatusIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNotes } from "@/hooks/use-notes";
import { useProcessingEvents } from "@/hooks/use-processing-status";
import { useToast } from "@/hooks/use-toast";
import { useViewPreferences } from "@/hooks/use-view-preferences";
import { setFlagColor, togglePin } from "@/lib/frontend-api";
import type { NoteEntry } from "@/types/note";

// Type for tracking file uploads
interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
  noteId?: string;
}

// Constants for file uploads
const MAX_FILE_SIZE_MB = 1;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = {
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "application/json": [".json"],
};

// Helper functions
const formatDate = (dateString: string) => {
  if (!dateString) return "";

  try {
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "long",
      day: "numeric",
    };

    return new Date(dateString).toLocaleDateString(undefined, options);
  } catch (error) {
    console.error("Error formatting date:", dateString, error);
    return dateString; // Return the original string if parsing fails
  }
};

const getGroupDateLabel = (dateString: string): string => {
  if (!dateString) return "No Date";
  try {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "No Date";

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    // Compare dates ignoring time
    const dateOnly = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
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

    // Group by Month and Year for older dates
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
    });
  } catch (error) {
    console.error("Error in getGroupDateLabel:", error);
    return "No Date";
  }
};

// FilterSortDialog component for Notes
interface FilterSortDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  filterTag: string;
  onTagFilterChange: (value: string) => void;
  allTags: string[];
  sortBy: string;
  onSortByChange: (value: string) => void;
  sortDir: "asc" | "desc";
  onToggleSortDir: () => void;
  viewMode: string;
  onViewModeChange: (value: string) => void;
  onClearAllFilters: () => void;
}

const FilterSortDialog = React.memo(
  ({
    isOpen,
    onOpenChange,
    filterTag,
    onTagFilterChange,
    allTags,
    sortBy,
    onSortByChange,
    sortDir,
    onToggleSortDir,
    viewMode,
    onViewModeChange,
    onClearAllFilters,
  }: FilterSortDialogProps) => (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Filter & Sort Notes</DialogTitle>
          <DialogDescription>
            Customize how you view and organize your notes.
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
              <Select value={filterTag} onValueChange={onTagFilterChange}>
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
              <Select value={sortBy} onValueChange={onSortByChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="content">Content Length</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort Direction */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Sort Direction</label>
              <Button
                variant="outline"
                onClick={onToggleSortDir}
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
                onValueChange={onViewModeChange}
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
            onClick={onClearAllFilters}
            className="w-full sm:w-auto"
          >
            Clear All Filters
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
);

FilterSortDialog.displayName = "FilterSortDialog";

export default function NotesPage() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const router = useRouter();

  // --- React Query Hook ---
  const {
    notes: entries,
    isLoading,
    error,
    createNote,
    updateNote,
    deleteNote,
    uploadNote,
    refresh,
    isCreating,
    isUpdating,
    isDeleting,
    isUploading,
  } = useNotes();

  // --- Initialize SSE for real-time updates ---
  const { isConnected } = useProcessingEvents();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<NoteEntry | null>(null);
  const [isEntryDialogOpen, setIsEntryDialogOpen] = useState(false);
  const [isNewEntryDialogOpen, setIsNewEntryDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [newEntry, setNewEntry] = useState<Omit<NoteEntry, "id">>({
    title: "",
    content: "",
    description: null,
    dueDate: null,
    tags: [],
    userId: "",
    rawMetadata: null,
    originalMimeType: null,
    userAgent: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    processingStatus: null,
    reviewStatus: "pending",
    flagColor: null,
    isPinned: false,
    enabled: true,
  });
  const [filterTag, setFilterTag] = useState("all");
  const [tagInput, setTagInput] = useState("");
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  // Use view preferences hook instead of individual state variables
  const [viewPreferences, updateViewPreference, isPreferencesLoaded] =
    useViewPreferences("notes");
  const { viewMode, sortBy, sortDir } = viewPreferences;

  // Add deletion confirmation dialog state
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] =
    useState(false);
  const [entryToDelete, setEntryToDelete] = useState<NoteEntry | null>(null);

  // File upload state
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);

  // Mobile filter dialog state
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);

  const notesContainerRef = useRef<HTMLDivElement>(null);

  // Get unique tags from all entries
  const allTags = useMemo(
    () => Array.from(new Set(entries.flatMap((entry) => entry.tags))),
    [entries],
  );

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const matchesSearch =
        entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (entry.content || "")
          .toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        entry.tags.some((tag) =>
          tag.toLowerCase().includes(searchQuery.toLowerCase()),
        );

      const matchesTag = filterTag === "all" || entry.tags.includes(filterTag);

      return matchesSearch && matchesTag;
    });
  }, [entries, searchQuery, filterTag]);

  const sortedAndFilteredEntries = useMemo(() => {
    const sorted = [...filteredEntries].sort((a, b) => {
      let compareResult = 0;

      switch (sortBy) {
        case "title":
          compareResult = a.title
            .toLowerCase()
            .localeCompare(b.title.toLowerCase());
          break;
        case "content": {
          const aLength = (a.content || "").length;
          const bLength = (b.content || "").length;
          compareResult = aLength - bLength;
          if (compareResult === 0) {
            compareResult = a.title
              .toLowerCase()
              .localeCompare(b.title.toLowerCase());
          }
          break;
        }
        default: {
          const dateA = new Date(a.createdAt).getTime();
          const dateB = new Date(b.createdAt).getTime();
          compareResult =
            (Number.isNaN(dateA) ? 0 : dateA) -
            (Number.isNaN(dateB) ? 0 : dateB);
          if (compareResult === 0) {
            compareResult = a.title
              .toLowerCase()
              .localeCompare(b.title.toLowerCase());
          }
          break;
        }
      }

      const directionMultiplier =
        sortBy === "title"
          ? sortDir === "asc"
            ? 1
            : -1
          : sortBy === "content"
            ? sortDir === "asc"
              ? 1
              : -1
            : sortDir === "desc"
              ? -1
              : 1;

      return compareResult * directionMultiplier;
    });
    return sorted;
  }, [filteredEntries, sortBy, sortDir]);

  // Event handlers
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
    setFocusedIndex(-1);
  };

  const handleTagFilterChange = (value: string) => {
    setFilterTag(value);
    setFocusedIndex(-1);
  };

  const handleSortByChange = (value: string) => {
    const newSortBy = value as "date" | "title" | "content";
    updateViewPreference("sortBy", newSortBy);
    if (newSortBy === "title") {
      updateViewPreference("sortDir", "asc");
    } else if (newSortBy === "content") {
      updateViewPreference("sortDir", "desc"); // Longer content first by default
    } else {
      updateViewPreference("sortDir", "desc"); // Newest first by default
    }
    setFocusedIndex(-1);
  };

  const toggleSortDir = () => {
    updateViewPreference("sortDir", sortDir === "asc" ? "desc" : "asc");
    setFocusedIndex(-1);
  };

  // Clear search input
  const clearSearch = () => {
    setSearchQuery("");
    // Focus the input after clearing
    const searchInput = document.querySelector(
      'input[placeholder="Search notes..."]',
    ) as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
    }
  };

  const handleViewModeChange = (value: string) => {
    if (value) {
      const newMode = value as "tile" | "list";
      updateViewPreference("viewMode", newMode);
      setFocusedIndex(-1);
    }
  };

  const handleEntryClick = useCallback(
    (entry: NoteEntry) => {
      // Navigate to the dedicated note page instead of opening modal
      router.push(`/notes/${entry.id}`);
    },
    [router],
  );

  const openEditDialog = useCallback((entry: NoteEntry) => {
    setSelectedEntry(entry);
    setIsEditMode(true);
    setIsEntryDialogOpen(true);
  }, []);

  const handleDeleteEntry = useCallback(
    async (entryId: string) => {
      try {
        await deleteNote(entryId);

        // Close dialogs
        setIsEntryDialogOpen(false);
        setIsConfirmDeleteDialogOpen(false);
        setEntryToDelete(null);

        toast({
          title: "Note entry deleted",
          description: "Your note entry has been deleted.",
        });
      } catch (error) {
        console.error("Error deleting entry:", error);
        toast({
          title: "Error",
          description: "Failed to delete note entry. Please try again.",
          variant: "destructive",
        });
      }
    },
    [deleteNote, toast],
  );

  const openDeleteDialog = useCallback((entry: NoteEntry) => {
    setEntryToDelete(entry);
    setIsConfirmDeleteDialogOpen(true);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const items = sortedAndFilteredEntries;
      if (!items.length) return;

      const currentFocusableElement = document.activeElement;
      const isInputFocused =
        currentFocusableElement?.tagName === "INPUT" ||
        currentFocusableElement?.tagName === "TEXTAREA" ||
        currentFocusableElement?.getAttribute("role") === "combobox";

      if (
        isInputFocused &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
      ) {
        return;
      }

      let newIndex = focusedIndex;
      const itemsPerRow = viewMode === "tile" ? 3 : 1;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          newIndex = Math.min(items.length - 1, focusedIndex + itemsPerRow);
          break;
        case "ArrowUp":
          event.preventDefault();
          newIndex = Math.max(0, focusedIndex - itemsPerRow);
          break;
        case "ArrowRight":
          event.preventDefault();
          if (focusedIndex < 0) newIndex = 0;
          else newIndex = Math.min(items.length - 1, focusedIndex + 1);
          break;
        case "ArrowLeft":
          event.preventDefault();
          if (focusedIndex < 0) newIndex = 0;
          else newIndex = Math.max(0, focusedIndex - 1);
          break;
        case "Enter":
        case " ":
          if (focusedIndex >= 0 && focusedIndex < items.length) {
            event.preventDefault();
            handleEntryClick(items[focusedIndex]);
          }
          break;
        case "e":
          if (
            !isInputFocused &&
            focusedIndex >= 0 &&
            focusedIndex < items.length
          ) {
            event.preventDefault();
            openEditDialog(items[focusedIndex]);
          }
          break;
        case "Delete":
        case "Backspace":
          if (
            !isInputFocused &&
            focusedIndex >= 0 &&
            focusedIndex < items.length
          ) {
            event.preventDefault();
            openDeleteDialog(items[focusedIndex]);
          }
          break;
        case "Home":
          event.preventDefault();
          newIndex = 0;
          break;
        case "End":
          event.preventDefault();
          newIndex = items.length - 1;
          break;
        case "Escape":
          setFocusedIndex(-1);
          (event.target as HTMLElement).blur();
          break;
        default:
          return;
      }

      if (newIndex !== focusedIndex && newIndex >= 0) {
        setFocusedIndex(newIndex);
        const itemElement = notesContainerRef.current?.querySelector(
          `[data-index="${newIndex}"]`,
        ) as HTMLElement;
        itemElement?.focus();
      } else if (newIndex === -1) {
        setFocusedIndex(-1);
        (event.target as HTMLElement).blur();
      }
    },
    [
      focusedIndex,
      sortedAndFilteredEntries,
      viewMode,
      handleEntryClick,
      openEditDialog,
      openDeleteDialog,
    ],
  );

  const handleCreateEntry = async () => {
    try {
      await createNote({
        title: newEntry.title,
        content: newEntry.content || "",
        dueDate: newEntry.dueDate || undefined,
        tags: newEntry.tags,
      });

      // Reset form
      setNewEntry({
        title: "",
        content: "",
        description: null,
        dueDate: null,
        tags: [],
        userId: "",
        rawMetadata: null,
        originalMimeType: null,
        userAgent: null,
        createdAt: "",
        updatedAt: "",
        processingStatus: null,
        reviewStatus: "pending",
        flagColor: null,
        isPinned: false,
        enabled: true,
      });
      setIsNewEntryDialogOpen(false);

      toast({
        title: "Note entry created",
        description: "Your note entry has been saved successfully.",
      });
    } catch (error) {
      console.error("Error creating entry:", error);
      toast({
        title: "Error",
        description: "Failed to create note entry. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleUpdateEntry = async () => {
    if (!selectedEntry) return;

    try {
      await updateNote(selectedEntry.id, {
        title: selectedEntry.title,
        content: selectedEntry.content,
        dueDate: selectedEntry.dueDate,
        tags: selectedEntry.tags,
      });

      setIsEditMode(false);

      toast({
        title: "Note entry updated",
        description: "Your note entry has been updated successfully.",
      });
    } catch (error) {
      console.error("Error updating entry:", error);
      toast({
        title: "Error",
        description: "Failed to update note entry. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handle adding tags to a new entry
  const handleAddTag = () => {
    if (!tagInput.trim()) return;

    const tag = tagInput.trim().toLowerCase();

    // Add tag to new entry if it doesn't already exist
    if (isNewEntryDialogOpen && !newEntry.tags.includes(tag)) {
      setNewEntry({
        ...newEntry,
        tags: [...newEntry.tags, tag],
      });
    }
    // Add tag to selected entry if it doesn't already exist
    else if (isEditMode && selectedEntry && !selectedEntry.tags.includes(tag)) {
      setSelectedEntry({
        ...selectedEntry,
        tags: [...selectedEntry.tags, tag],
      });
    }

    setTagInput("");
  };

  // Handle removing tags
  const handleRemoveTag = (tag: string) => {
    if (isNewEntryDialogOpen) {
      setNewEntry({
        ...newEntry,
        tags: newEntry.tags.filter((t) => t !== tag),
      });
    } else if (isEditMode && selectedEntry) {
      setSelectedEntry({
        ...selectedEntry,
        tags: selectedEntry.tags.filter((t) => t !== tag),
      });
    }
  };

  // Handle pin toggle for notes
  const handlePinToggle = async (note: NoteEntry) => {
    const newPinned = !note.isPinned;

    try {
      const response = await togglePin("notes", note.id, newPinned);

      if (!response.ok) {
        throw new Error(`Failed to ${newPinned ? "pin" : "unpin"} note`);
      }

      // Refresh data to reflect changes
      refresh();

      toast({
        title: newPinned ? "Note pinned" : "Note unpinned",
        description: `"${note.title}" has been ${newPinned ? "pinned" : "unpinned"}.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update pin status",
        variant: "destructive",
      });
    }
  };

  // Handle flag color change for notes
  const handleFlagColorChange = async (
    note: NoteEntry,
    color: "red" | "yellow" | "orange" | "green" | "blue" | null,
  ) => {
    try {
      const response = await setFlagColor("notes", note.id, color);

      if (!response.ok) {
        throw new Error("Failed to update flag color");
      }

      // Refresh data to reflect changes
      refresh();

      toast({
        title: color ? "Note flagged" : "Flag removed",
        description: color
          ? `"${note.title}" has been flagged as ${color}.`
          : `Flag removed from "${note.title}".`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update flag color",
        variant: "destructive",
      });
    }
  };

  // Handle chat button click
  const handleChatClick = (note: NoteEntry) => {
    // Use the global function to open assistant with pre-attached assets
    if (
      typeof window !== "undefined" &&
      (window as any).openAssistantWithAssets
    ) {
      (window as any).openAssistantWithAssets([
        {
          type: "note",
          id: note.id,
          title: note.title,
        },
      ]);
    }
  };

  // Handle file upload
  const handleFileUpload = useCallback(
    async (acceptedFiles: File[]) => {
      const newUploads: UploadingFile[] = acceptedFiles.map((file) => ({
        id: nanoid(),
        file,
        progress: 0,
        status: "pending",
      }));

      setUploadingFiles((prev) => [...newUploads, ...prev]);

      for (const upload of newUploads) {
        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.id === upload.id ? { ...f, status: "uploading" } : f,
          ),
        );

        const formData = new FormData();

        // Prepare metadata
        const metadata = {
          title: upload.file.name.replace(/\.[^/.]+$/, ""),
          tags: [],
        };

        formData.append("metadata", JSON.stringify(metadata));
        formData.append("content", upload.file);

        try {
          // Update progress
          setUploadingFiles((prev) =>
            prev.map((f) => (f.id === upload.id ? { ...f, progress: 30 } : f)),
          );

          setUploadingFiles((prev) =>
            prev.map((f) => (f.id === upload.id ? { ...f, progress: 70 } : f)),
          );

          const createdNote = await uploadNote(formData);

          // Update upload status to success
          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.id === upload.id
                ? {
                    ...f,
                    status: "success",
                    progress: 100,
                    noteId: createdNote.id,
                  }
                : f,
            ),
          );

          toast({
            title: "Upload Successful",
            description: `"${createdNote.title}" has been created.`,
          });
        } catch (err) {
          console.error("Error uploading file:", upload.file.name, err);
          const message =
            err instanceof Error ? err.message : "An unknown error occurred.";

          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.id === upload.id
                ? { ...f, status: "error", error: message, progress: 0 }
                : f,
            ),
          );

          toast({
            title: "Upload Error",
            description: `Failed to upload ${upload.file.name}: ${message}`,
            variant: "destructive",
          });
        }
      }
    },
    [toast, uploadNote],
  );

  // Dropzone configuration
  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop: handleFileUpload,
      accept: ALLOWED_UPLOAD_TYPES,
      maxSize: MAX_FILE_SIZE_BYTES,
      multiple: true,
      noClick: true,
      noKeyboard: true,
      onDropRejected: (rejectedFiles) => {
        rejectedFiles.forEach(({ file, errors }) => {
          errors.forEach((error) => {
            let message = error.message;
            if (error.code === "file-too-large") {
              message = `File is larger than ${MAX_FILE_SIZE_MB}MB`;
            } else if (error.code === "file-invalid-type") {
              message = `Invalid file type. Supported types: TXT, MD, JSON`;
            }
            toast({
              title: "Upload Rejected",
              description: `${file.name}: ${message}`,
              variant: "destructive",
            });
          });
        });
      },
    });

  const renderContent = useMemo(() => {
    if (isLoading) {
      return (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
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

    if (sortedAndFilteredEntries.length === 0 && !isLoading) {
      return (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-16 w-16 mx-auto mb-4 text-gray-400" />
          <p className="mb-4">
            {entries.length === 0
              ? "Your notes collection is empty."
              : "No notes found matching your criteria."}
          </p>
        </div>
      );
    }

    return (
      <div
        ref={notesContainerRef}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="region"
        aria-label="Notes navigation"
        className="outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
      >
        {viewMode === "tile" && (
          <TileView
            entries={sortedAndFilteredEntries}
            focusedIndex={focusedIndex}
            sortBy={sortBy}
            onEntryClick={handleEntryClick}
            onEditClick={openEditDialog}
            onDeleteClick={openDeleteDialog}
            onPinToggle={handlePinToggle}
            onFlagColorChange={handleFlagColorChange}
            onChatClick={handleChatClick}
          />
        )}
        {viewMode === "list" && (
          <ListView
            entries={sortedAndFilteredEntries}
            focusedIndex={focusedIndex}
            onEntryClick={handleEntryClick}
            onEditClick={openEditDialog}
            onDeleteClick={openDeleteDialog}
            onPinToggle={handlePinToggle}
            onFlagColorChange={handleFlagColorChange}
            onChatClick={handleChatClick}
          />
        )}
      </div>
    );
  }, [
    isLoading,
    sortedAndFilteredEntries,
    entries.length,
    viewMode,
    focusedIndex,
    sortBy,
    handleKeyDown,
    handleEntryClick,
    openEditDialog,
    openDeleteDialog,
    handlePinToggle,
    handleFlagColorChange,
    handleChatClick,
  ]);

  // Memoize helper functions
  const getActiveFilterCount = useCallback(() => {
    let count = 0;
    if (filterTag !== "all") count++;
    return count;
  }, [filterTag]);

  const clearAllFilters = useCallback(() => {
    setFilterTag("all");
  }, []);

  return (
    <TooltipProvider>
      <div
        {...getRootProps()}
        className={`min-h-screen relative ${isDragActive ? "bg-blue-50 dark:bg-blue-900/30 outline-dashed outline-2 outline-blue-500" : ""}`}
      >
        <input {...getInputProps()} />

        {/* Drag overlay */}
        {(isDragActive || isUploading) && (
          <div className="absolute inset-0 bg-black/10 dark:bg-white/10 flex items-center justify-center z-50 pointer-events-none">
            <div className="text-center p-6 bg-background rounded-lg shadow-xl">
              {isUploading ? (
                <>
                  <Loader2 className="h-16 w-16 text-blue-500 mx-auto mb-4 animate-spin" />
                  <p className="text-xl font-semibold mb-2">
                    Uploading notes...
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Processing your files
                  </p>
                </>
              ) : isDragReject ? (
                <>
                  <AlertCircle className="h-16 w-16 mx-auto mb-4 text-red-500" />
                  <p className="text-xl font-semibold mb-2">
                    Invalid file type
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Please drop TXT, MD, or JSON files only
                  </p>
                </>
              ) : (
                <>
                  <Upload className="h-16 w-16 text-blue-500 mx-auto mb-4" />
                  <p className="text-xl font-semibold mb-2">
                    Drop files to create notes
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Supports TXT, MD, and JSON files
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        <div className="space-y-6">
          {/* Header Section */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <MobileListsBackButton />
              <div>
                <h1 className="text-lg md:text-3xl font-bold md:tracking-tight">
                  Notes
                  {entries.length > 0 && (
                    <span className="ml-2 text-sm md:text-base font-normal text-muted-foreground">
                      {sortedAndFilteredEntries.length === entries.length
                        ? `(${entries.length})`
                        : `(${sortedAndFilteredEntries.length} of ${entries.length})`}
                    </span>
                  )}
                </h1>
              </div>
            </div>
            <Button onClick={() => setIsNewEntryDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> New Note
            </Button>
          </div>

          {/* Controls Section: Search, Filter, Sort, View */}
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            {/* Search Input + Filter Button Container */}
            <div className="flex gap-2 flex-grow w-full md:w-auto">
              {/* Search */}
              <div className="relative flex-grow">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search notes..."
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
                title="Filter and sort notes"
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
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="content">Content Length</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                onClick={toggleSortDir}
                title={`Sort Direction: ${sortDir === "asc" ? "Ascending" : "Descending"}`}
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
                <ToggleGroupItem
                  value="tile"
                  aria-label="Tile view"
                  title="Tile View"
                >
                  <LayoutGrid className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="list"
                  aria-label="List view"
                  title="List View"
                >
                  <List className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {/* Upload Progress Section */}
          {uploadingFiles.length > 0 && (
            <UploadProgressList
              uploads={uploadingFiles}
              onClearComplete={() =>
                setUploadingFiles((prev) =>
                  prev.filter(
                    (f) => f.status !== "success" && f.status !== "error",
                  ),
                )
              }
            />
          )}

          {/* Main Content Area */}
          {renderContent}

          {/* View/Edit Entry Dialog */}
          <Dialog open={isEntryDialogOpen} onOpenChange={setIsEntryDialogOpen}>
            <DialogContent className="sm:max-w-[625px]">
              <DialogHeader>
                <DialogTitle>
                  {isEditMode ? "Edit Note Entry" : "Note Entry"}
                </DialogTitle>
                <DialogDescription>
                  {isEditMode
                    ? "Make changes to your note entry."
                    : "View your note entry details."}
                </DialogDescription>
              </DialogHeader>
              {selectedEntry && (
                <div className="space-y-4">
                  {isEditMode ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="title">Title</Label>
                        <Input
                          id="title"
                          value={selectedEntry.title}
                          onChange={(e) =>
                            setSelectedEntry({
                              ...selectedEntry,
                              title: e.target.value,
                            })
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="content">Content</Label>
                        <Textarea
                          id="content"
                          rows={8}
                          value={selectedEntry.content || ""}
                          onChange={(e) =>
                            setSelectedEntry({
                              ...selectedEntry,
                              content: e.target.value,
                            })
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="due-date">Due Date (optional)</Label>
                        <Input
                          id="due-date"
                          type="datetime-local"
                          value={
                            selectedEntry.dueDate
                              ? new Date(selectedEntry.dueDate)
                                  .toISOString()
                                  .slice(0, 16)
                              : ""
                          }
                          onChange={(e) =>
                            setSelectedEntry({
                              ...selectedEntry,
                              dueDate: e.target.value
                                ? new Date(e.target.value).toISOString()
                                : null,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Tags</Label>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {selectedEntry.tags.map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="flex items-center gap-1"
                            >
                              {tag}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-4 w-4 ml-1"
                                onClick={() => handleRemoveTag(tag)}
                              >
                                <span className="sr-only">Remove tag</span>×
                              </Button>
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
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <h3 className="text-xl font-semibold mb-1">
                          {selectedEntry.title}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(selectedEntry.createdAt)}
                        </p>
                      </div>
                      <div className="pt-2">
                        <p className="whitespace-pre-line">
                          {selectedEntry.content}
                        </p>
                      </div>
                      {selectedEntry.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-4">
                          {selectedEntry.tags.map((tag) => (
                            <Badge key={tag} variant="outline">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              <DialogFooter className="flex items-center justify-between">
                {isEditMode ? (
                  <>
                    <Button
                      variant="ghost"
                      onClick={() => setIsEditMode(false)}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleUpdateEntry}>Save Changes</Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        if (selectedEntry) {
                          setIsEntryDialogOpen(false);
                          openDeleteDialog(selectedEntry);
                        }
                      }}
                    >
                      Delete
                    </Button>
                    <Button onClick={() => setIsEditMode(true)}>Edit</Button>
                  </>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* New Entry Dialog */}
          <Dialog
            open={isNewEntryDialogOpen}
            onOpenChange={setIsNewEntryDialogOpen}
          >
            <DialogContent className="sm:max-w-[625px]">
              <DialogHeader>
                <DialogTitle>New Note Entry</DialogTitle>
                <DialogDescription>
                  Create a new note entry to record your thoughts.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-title">Title</Label>
                  <Input
                    id="new-title"
                    placeholder="Enter a title"
                    value={newEntry.title}
                    onChange={(e) =>
                      setNewEntry({ ...newEntry, title: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-content">Content (optional)</Label>
                  <Textarea
                    id="new-content"
                    placeholder="Add content to your note (optional)..."
                    rows={8}
                    value={newEntry.content || ""}
                    onChange={(e) =>
                      setNewEntry({ ...newEntry, content: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-due-date">Due Date (optional)</Label>
                  <Input
                    id="new-due-date"
                    type="datetime-local"
                    value={
                      newEntry.dueDate
                        ? new Date(newEntry.dueDate).toISOString().slice(0, 16)
                        : ""
                    }
                    onChange={(e) =>
                      setNewEntry({
                        ...newEntry,
                        dueDate: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : null,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tags</Label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {newEntry.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="flex items-center gap-1"
                      >
                        {tag}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 ml-1"
                          onClick={() => handleRemoveTag(tag)}
                        >
                          <span className="sr-only">Remove tag</span>×
                        </Button>
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
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setIsNewEntryDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateEntry}
                  disabled={!newEntry.title.trim()}
                >
                  Create Entry
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Deletion Confirmation Dialog */}
          <Dialog
            open={isConfirmDeleteDialogOpen}
            onOpenChange={setIsConfirmDeleteDialogOpen}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Confirm Deletion</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete this note? This action cannot
                  be undone.
                </DialogDescription>
              </DialogHeader>
              {entryToDelete && (
                <div className="my-4 p-3 border rounded-md bg-muted/50">
                  <div className="min-w-0">
                    <p className="font-medium break-words line-clamp-2 leading-tight">
                      {entryToDelete.title}
                    </p>
                    <div className="text-sm text-muted-foreground line-clamp-2 mt-1">
                      <MarkdownPreview
                        content={entryToDelete.content}
                        maxLength={120}
                        preserveFormatting={false}
                      />
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter className="sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsConfirmDeleteDialogOpen(false);
                    setEntryToDelete(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (entryToDelete) {
                      handleDeleteEntry(entryToDelete.id);
                    }
                  }}
                  disabled={isDeleting}
                >
                  {isDeleting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Delete Note
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Filter & Sort Dialog */}
          <FilterSortDialog
            isOpen={isFilterDialogOpen}
            onOpenChange={setIsFilterDialogOpen}
            filterTag={filterTag}
            onTagFilterChange={handleTagFilterChange}
            allTags={allTags}
            sortBy={sortBy}
            onSortByChange={handleSortByChange}
            sortDir={sortDir}
            onToggleSortDir={toggleSortDir}
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
            onClearAllFilters={clearAllFilters}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

// --- Child Components for Views ---

// Tile View Component
interface TileViewProps {
  entries: NoteEntry[];
  focusedIndex: number;
  sortBy: "date" | "title" | "content";
  onEntryClick: (entry: NoteEntry) => void;
  onEditClick: (entry: NoteEntry) => void;
  onDeleteClick: (entry: NoteEntry) => void;
  onPinToggle: (note: NoteEntry) => void;
  onFlagColorChange: (
    note: NoteEntry,
    color: "red" | "yellow" | "orange" | "green" | "blue" | null,
  ) => void;
  onChatClick: (note: NoteEntry) => void;
}

function TileView({
  entries,
  focusedIndex,
  sortBy,
  onEntryClick,
  onEditClick,
  onDeleteClick,
  onPinToggle,
  onFlagColorChange,
  onChatClick,
}: TileViewProps) {
  let lastGroupLabel = "";
  const isGrouped = sortBy === "date";

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {entries.map((entry, index) => {
        const currentGroupLabel = isGrouped
          ? getGroupDateLabel(entry.createdAt)
          : "";
        const showGroupHeader =
          isGrouped && currentGroupLabel !== lastGroupLabel;
        if (showGroupHeader) {
          lastGroupLabel = currentGroupLabel;
        }

        return (
          <React.Fragment key={entry.id}>
            {showGroupHeader && (
              <h2 className="col-span-full text-lg font-semibold mt-6 mb-2 pl-1 border-b pb-1">
                {currentGroupLabel}
              </h2>
            )}
            <NoteTileItem
              entry={entry}
              index={index}
              isFocused={index === focusedIndex}
              onClick={() => onEntryClick(entry)}
              onEditClick={onEditClick}
              onDeleteClick={onDeleteClick}
              onPinToggle={onPinToggle}
              onFlagColorChange={onFlagColorChange}
              onChatClick={onChatClick}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Note Tile Item Component
interface NoteTileItemProps {
  entry: NoteEntry;
  index: number;
  isFocused: boolean;
  onClick: () => void;
  onEditClick: (entry: NoteEntry) => void;
  onDeleteClick: (entry: NoteEntry) => void;
  onPinToggle: (note: NoteEntry) => void;
  onFlagColorChange: (
    note: NoteEntry,
    color: "red" | "yellow" | "orange" | "green" | "blue" | null,
  ) => void;
  onChatClick: (note: NoteEntry) => void;
}

function NoteTileItem({
  entry,
  index,
  isFocused,
  onClick,
  onEditClick,
  onDeleteClick,
  onPinToggle,
  onFlagColorChange,
  onChatClick,
}: NoteTileItemProps) {
  return (
    <Card
      data-index={index}
      tabIndex={-1}
      className={`cursor-pointer transition-shadow hover:shadow-md group relative ${isFocused ? "ring-2 ring-ring ring-offset-2" : ""}`}
      onClick={onClick}
      onDoubleClick={() => onEditClick(entry)}
    >
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <CardTitle className="line-clamp-1" title={entry.title}>
              {entry.title}
            </CardTitle>
            <CardDescription className="flex items-center text-xs text-muted-foreground mt-1">
              <CalendarDays className="mr-1 h-3 w-3 flex-shrink-0" />
              {formatDate(entry.createdAt)}
              {/* Processing Status Icon */}
              <div className="ml-2">
                <SimpleProcessingStatusIcon
                  status={entry.processingStatus}
                  enabled={entry.enabled}
                  className=""
                />
              </div>
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <PinFlagControls
              size="sm"
              isPinned={entry.isPinned}
              flagColor={entry.flagColor}
              onPinToggle={() => onPinToggle(entry)}
              onFlagToggle={() =>
                onFlagColorChange(entry, entry.flagColor ? null : "orange")
              }
              onFlagColorChange={(color) => onFlagColorChange(entry, color)}
            />
            {/* Chat Icon */}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onChatClick(entry);
              }}
              title="Chat about this note"
            >
              <MessageSquare className="h-3 w-3 text-gray-400" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onClick();
                  }}
                >
                  <FileText className="mr-2 h-4 w-4" /> View Details
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditClick(entry);
                  }}
                >
                  <Edit className="mr-2 h-4 w-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/50"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteClick(entry);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="line-clamp-3 mb-3">
          <MarkdownPreview
            content={entry.content}
            maxLength={200}
            preserveFormatting={true}
          />
        </div>
        <div className="flex flex-wrap gap-1 mb-2">
          {entry.tags.length > 0 && (
            <>
              {entry.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {entry.tags.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{entry.tags.length - 3}
                </Badge>
              )}
            </>
          )}
          {entry.enabled === false ? (
            <Badge variant="outline" className="text-xs">
              disabled
            </Badge>
          ) : (
            entry.processingStatus &&
            entry.processingStatus !== "completed" && (
              <Badge
                variant={
                  entry.processingStatus === "failed"
                    ? "destructive"
                    : "secondary"
                }
                className="text-xs"
              >
                {entry.processingStatus}
              </Badge>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// List View Component
interface ListViewProps {
  entries: NoteEntry[];
  focusedIndex: number;
  onEntryClick: (entry: NoteEntry) => void;
  onEditClick: (entry: NoteEntry) => void;
  onDeleteClick: (entry: NoteEntry) => void;
  onPinToggle: (note: NoteEntry) => void;
  onFlagColorChange: (
    note: NoteEntry,
    color: "red" | "yellow" | "orange" | "green" | "blue" | null,
  ) => void;
  onChatClick: (note: NoteEntry) => void;
}

function ListView({
  entries,
  focusedIndex,
  onEntryClick,
  onEditClick,
  onDeleteClick,
  onPinToggle,
  onFlagColorChange,
  onChatClick,
}: ListViewProps) {
  return (
    <div className="border rounded-md overflow-hidden">
      <div className="divide-y divide-border">
        {/* Header Row */}
        <div className="flex items-center px-4 py-2 bg-muted/50 text-sm font-medium text-muted-foreground">
          <div className="w-10 flex-shrink-0 mr-3" />
          <div className="flex-1 min-w-0 mr-4">Title</div>
          <div className="w-32 hidden md:block mr-4">Date</div>
          <div className="w-20 hidden sm:block mr-4">Length</div>
          <div className="w-32 hidden lg:block mr-4">Tags</div>
          <div className="w-16 flex-shrink-0 mr-3">Actions</div>
          <div className="w-10 flex-shrink-0" />
        </div>

        {/* Data Rows */}
        {entries.map((entry, index) => {
          const isFocused = index === focusedIndex;
          const contentLength = `${(entry.content || "").length} chars`;

          return (
            <div
              key={entry.id}
              data-index={index}
              tabIndex={-1}
              className={`flex items-center px-4 py-2.5 hover:bg-muted/50 cursor-pointer outline-none ${isFocused ? "ring-2 ring-ring ring-offset-0 bg-muted/50" : ""}`}
              onClick={() => onEntryClick(entry)}
              onDoubleClick={() => onEditClick(entry)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onEntryClick(entry);
                }
              }}
            >
              {/* Icon */}
              <div className="w-10 flex-shrink-0 mr-3 flex items-center justify-center relative">
                <FileText className="h-6 w-6 text-muted-foreground" />
                {/* Processing Status Icon */}
                <div className="absolute -top-1 -right-1">
                  <SimpleProcessingStatusIcon
                    status={entry.processingStatus}
                    enabled={entry.enabled}
                    className="bg-white/90 dark:bg-black/90 rounded-full p-0.5"
                  />
                </div>
              </div>
              {/* Title & Content Preview */}
              <div className="flex-1 min-w-0 mr-4">
                <p className="text-sm font-medium truncate" title={entry.title}>
                  {entry.title}
                </p>
                <div className="text-xs text-muted-foreground truncate">
                  <MarkdownPreview
                    content={entry.content}
                    maxLength={80}
                    preserveFormatting={false}
                  />
                </div>
              </div>
              {/* Date */}
              <div className="w-32 hidden md:block mr-4 text-sm text-muted-foreground">
                {formatDate(entry.createdAt)}
              </div>
              {/* Content Length */}
              <div className="w-20 hidden sm:block mr-4 text-sm text-muted-foreground">
                {contentLength}
              </div>
              {/* Tags */}
              <div className="w-32 hidden lg:flex flex-wrap gap-1 items-center mr-4">
                {entry.tags.slice(0, 2).map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-xs px-1 py-0 font-normal"
                  >
                    {tag}
                  </Badge>
                ))}
                {entry.tags.length > 2 && (
                  <Badge
                    variant="outline"
                    className="text-xs px-1 py-0 font-normal"
                  >
                    +{entry.tags.length - 2}
                  </Badge>
                )}
                {entry.tags.length === 0 && (
                  <span className="text-xs text-muted-foreground italic">
                    No tags
                  </span>
                )}
              </div>
              {/* Pin/Flag Controls */}
              <div
                className="w-16 flex-shrink-0 mr-3 flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <PinFlagControls
                  size="sm"
                  isPinned={entry.isPinned}
                  flagColor={entry.flagColor}
                  onPinToggle={() => onPinToggle(entry)}
                  onFlagToggle={() =>
                    onFlagColorChange(entry, entry.flagColor ? null : "orange")
                  }
                  onFlagColorChange={(color) => onFlagColorChange(entry, color)}
                />
                {/* Chat Icon */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChatClick(entry);
                  }}
                  title="Chat about this note"
                >
                  <MessageSquare className="h-3 w-3 text-gray-400" />
                </Button>
              </div>
              {/* Actions */}
              <div className="w-10 flex-shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    asChild
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenuItem onClick={() => onEntryClick(entry)}>
                      <FileText className="mr-2 h-4 w-4" /> View Details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEditClick(entry)}>
                      <Edit className="mr-2 h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDeleteClick(entry)}
                      className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/50"
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Upload Progress List Component
interface UploadProgressListProps {
  uploads: UploadingFile[];
  onClearComplete: () => void;
}

function UploadProgressList({
  uploads,
  onClearComplete,
}: UploadProgressListProps) {
  const completedCount = uploads.filter(
    (u) => u.status === "success" || u.status === "error",
  ).length;

  return (
    <div className="bg-card rounded-lg border p-4 shadow-sm">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-sm">File Uploads</h3>
        {completedCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearComplete}
            className="text-xs h-7"
          >
            Clear Completed
          </Button>
        )}
      </div>
      <div className="space-y-2 max-h-40 overflow-y-auto">
        {uploads.map((upload) => (
          <div
            key={upload.id}
            className={`flex items-center gap-3 p-2 rounded-md transition-opacity ${
              upload.status === "success" || upload.status === "error"
                ? "opacity-70"
                : ""
            }`}
          >
            <div className="flex-shrink-0">
              {upload.status === "pending" && (
                <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
              )}
              {upload.status === "uploading" && (
                <Upload className="h-4 w-4 text-blue-500 animate-pulse" />
              )}
              {upload.status === "success" && (
                <div className="h-4 w-4 rounded-full bg-green-500 flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-white" />
                </div>
              )}
              {upload.status === "error" && (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-medium truncate"
                title={upload.file.name}
              >
                {upload.file.name}
              </p>
              {upload.status === "error" && (
                <p
                  className="text-xs text-red-600 truncate"
                  title={upload.error}
                >
                  {upload.error}
                </p>
              )}
              {upload.status === "success" && (
                <p className="text-xs text-green-600">Upload complete</p>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {Math.round(upload.file.size / 1024)}KB
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
