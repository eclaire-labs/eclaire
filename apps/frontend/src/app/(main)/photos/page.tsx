"use client";

import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit,
  FileText, // Lucide icons
  Filter,
  GalleryHorizontalEnd,
  LayoutGrid,
  Link as LinkIcon, // Lucide icons
  List,
  Loader2,
  MapPin,
  MessageSquare, // Chat icon
  MoreHorizontal,
  Search,
  Trash2,
  UploadCloud, // New Icons
  X,
  XCircle,
} from "lucide-react";
import { nanoid } from "nanoid"; // For unique upload IDs
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDropzone } from "react-dropzone"; // Import react-dropzone
import { MobileListsBackButton } from "@/components/mobile/mobile-lists-back-button";
import { SimpleProcessingStatusIcon } from "@/components/processing/SimpleProcessingStatusIcon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  DialogClose,
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
import { Progress } from "@/components/ui/progress"; // For upload progress
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"; // For view switcher
import { TooltipProvider } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePhotos } from "@/hooks/use-photos";
import { useProcessingEvents } from "@/hooks/use-processing-status";
import { useToast } from "@/hooks/use-toast";
import { useViewPreferences } from "@/hooks/use-view-preferences";
import { apiFetch, setFlagColor, togglePin } from "@/lib/frontend-api";
import type { EditPhotoState, Photo, UploadingFile } from "@/types/photo";

// --- Constants ---
const MAX_FILE_SIZE_MB = 25; // Increased limit slightly
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = {
  // Use object for easier checking
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
  "image/avif": [".avif"], // Added AVIF support
  "image/svg+xml": [".svg"], // Added SVG support
  "image/tiff": [".tiff", ".tif"], // Added TIFF support
  "image/bmp": [".bmp"], // Added BMP support
};
const ALLOWED_UPLOAD_TYPES_STRING = Object.keys(ALLOWED_UPLOAD_TYPES).join(",");

// --- Helper Functions ---
// (Keep existing formatters: formatDate, formatFileSize, formatFNumber, formatExposureTime, formatDimensions, formatLocation)
const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return "Unknown date";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString; // Return original if invalid
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch (error) {
    console.error("Error formatting date:", dateString, error);
    return dateString; // Fallback
  }
};

const formatFileSize = (bytes: number | null | undefined): string => {
  if (bytes === null || bytes === undefined || isNaN(bytes) || bytes < 0)
    return "N/A";
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Number.parseFloat((bytes / k ** i).toFixed(1)) + " " + sizes[i];
};

const formatFNumber = (fNumber: number | null | undefined): string => {
  if (fNumber === null || fNumber === undefined || isNaN(fNumber)) return "N/A";
  return `f/${fNumber.toFixed(1)}`;
};

const formatExposureTime = (
  exposureTime: number | null | undefined,
): string => {
  if (
    exposureTime === null ||
    exposureTime === undefined ||
    isNaN(exposureTime)
  )
    return "N/A";
  if (exposureTime >= 0.3 || exposureTime === 0) {
    return `${exposureTime.toFixed(1)}s`;
  } else {
    const fraction = 1 / exposureTime;
    return `1/${Math.round(fraction)}s`;
  }
};

const formatDimensions = (
  width: number | null | undefined,
  height: number | null | undefined,
): string => {
  if (width && height) {
    return `${width} x ${height} px`;
  }
  return "N/A";
};

const formatLocation = (
  city: string | null | undefined,
  country: string | null | undefined,
): string | null => {
  if (city && country) return `${city}, ${country}`;
  if (city) return city;
  if (country) return country;
  return null;
};

// Update the getGroupDateLabel to handle potential invalid dates from sorting fallback
const getGroupDateLabel = (dateString: string | null | undefined): string => {
  if (!dateString) return "Unknown Date";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Unknown Date"; // Check if date is valid

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
    return "Unknown Date";
  }
};

// --- Component ---
export default function PhotosPage() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const router = useRouter();

  // --- React Query Hook ---
  const {
    photos,
    isLoading,
    error,
    updatePhoto,
    deletePhoto,
    refresh,
    isUpdating,
    isDeleting,
  } = usePhotos();

  // --- Initialize SSE for real-time updates ---
  const { isConnected } = useProcessingEvents();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTag, setFilterTag] = useState("all");
  const [tagInput, setTagInput] = useState("");
  const [isViewPhotoDialogOpen, setIsViewPhotoDialogOpen] = useState(false);
  const [isEditPhotoDialogOpen, setIsEditPhotoDialogOpen] = useState(false);
  // Removed isNewPhotoDialogOpen
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] =
    useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null); // For view/edit/delete
  const [editingPhoto, setEditingPhoto] = useState<EditPhotoState | null>(null);
  const [photoToDelete, setPhotoToDelete] = useState<Photo | null>(null);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);

  // Use view preferences hook instead of individual state variables
  const [viewPreferences, updateViewPreference, isPreferencesLoaded] =
    useViewPreferences("photos");
  const { viewMode, sortBy, sortDir } = viewPreferences;
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1); // For keyboard nav

  // Mobile filter dialog state
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);

  const photosContainerRef = useRef<HTMLDivElement>(null); // Ref for keyboard nav container

  // Helper functions for mobile filter dialog
  const getActiveFilterCount = () => {
    let count = 0;
    if (filterTag !== "all") count++;
    return count;
  };

  const clearAllFilters = () => {
    setFilterTag("all");
  };

  // SSE is now connected for real-time query invalidation when processing completes

  // --- Error Handling ---
  useEffect(() => {
    if (error) {
      toast({
        title: "Error Loading Photos",
        description:
          error instanceof Error ? error.message : "Failed to load photos",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  // --- Computed Values ---
  const allTags = useMemo(
    () => Array.from(new Set(photos.flatMap((photo) => photo.tags))),
    [photos],
  );

  const filteredPhotos = useMemo(() => {
    return photos.filter((photo) => {
      const lowerSearch = searchQuery.toLowerCase();
      const matchesSearch =
        photo.title.toLowerCase().includes(lowerSearch) ||
        (photo.description &&
          photo.description.toLowerCase().includes(lowerSearch)) ||
        photo.originalFilename.toLowerCase().includes(lowerSearch) ||
        (photo.cameraMake &&
          photo.cameraMake.toLowerCase().includes(lowerSearch)) ||
        (photo.cameraModel &&
          photo.cameraModel.toLowerCase().includes(lowerSearch)) ||
        (photo.locationCity &&
          photo.locationCity.toLowerCase().includes(lowerSearch)) ||
        (photo.locationCountryName &&
          photo.locationCountryName.toLowerCase().includes(lowerSearch)) ||
        photo.tags.some((tag) => tag.toLowerCase().includes(lowerSearch));
      const matchesTag = filterTag === "all" || photo.tags.includes(filterTag);
      return matchesSearch && matchesTag;
    });
  }, [photos, searchQuery, filterTag]);

  const sortedAndFilteredPhotos = useMemo(() => {
    const sorted = [...filteredPhotos].sort((a, b) => {
      // Get primary sort date (prefer dateTaken, fallback to createdAt)
      // Use 0 as timestamp for invalid/missing dates to ensure consistent comparison
      const dateA = a.dateTaken
        ? new Date(a.dateTaken).getTime()
        : new Date(a.createdAt).getTime();
      const dateB = b.dateTaken
        ? new Date(b.dateTaken).getTime()
        : new Date(b.createdAt).getTime();
      const timeA = isNaN(dateA) ? 0 : dateA;
      const timeB = isNaN(dateB) ? 0 : dateB;

      let compareResult = 0;

      switch (sortBy) {
        case "title":
          compareResult = a.title
            .toLowerCase()
            .localeCompare(b.title.toLowerCase());
          break;
        case "location": {
          const locA =
            `${a.locationCity ?? ""}${a.locationCountryName ?? ""}`.toLowerCase();
          const locB =
            `${b.locationCity ?? ""}${b.locationCountryName ?? ""}`.toLowerCase();
          compareResult = locA.localeCompare(locB);
          if (compareResult === 0) {
            // Fallback to title if locations are same/empty
            compareResult = a.title
              .toLowerCase()
              .localeCompare(b.title.toLowerCase());
          }
          break;
        }
        case "createdAt": {
          const createdA = new Date(a.createdAt).getTime();
          const createdB = new Date(b.createdAt).getTime();
          compareResult =
            (isNaN(createdA) ? 0 : createdA) - (isNaN(createdB) ? 0 : createdB);
          break;
        }
        case "dateTaken":
        default:
          // Use the primary sort date determined above
          compareResult = timeA - timeB;
          // If primary dates are equal, use createdAt as secondary sort
          if (compareResult === 0) {
            const createdA = new Date(a.createdAt).getTime();
            const createdB = new Date(b.createdAt).getTime();
            compareResult =
              (isNaN(createdA) ? 0 : createdA) -
              (isNaN(createdB) ? 0 : createdB);
          }
          break;
      }

      // Apply direction (descending for dates by default, ascending for text)
      const directionMultiplier =
        sortBy === "title" || sortBy === "location"
          ? sortDir === "asc"
            ? 1
            : -1
          : sortDir === "desc"
            ? -1
            : 1; // Dates descending by default

      return compareResult * directionMultiplier;
    });
    return sorted;
  }, [filteredPhotos, sortBy, sortDir]);

  // --- Event Handlers ---

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
    setFocusedIndex(-1); // Reset focus on filter change
  };

  const handleTagFilterChange = (value: string) => {
    setFilterTag(value);
    setFocusedIndex(-1); // Reset focus on filter change
  };

  const handleSortByChange = (value: string) => {
    const newSortBy = value as "dateTaken" | "createdAt" | "title" | "location";
    updateViewPreference("sortBy", newSortBy);
    // Sensible default sort directions
    if (newSortBy === "title" || newSortBy === "location") {
      updateViewPreference("sortDir", "asc");
    } else {
      updateViewPreference("sortDir", "desc");
    }
    setFocusedIndex(-1); // Reset focus on sort change
  };

  const toggleSortDir = () => {
    updateViewPreference("sortDir", sortDir === "asc" ? "desc" : "asc");
    setFocusedIndex(-1); // Reset focus on sort change
  };

  // Clear search input
  const clearSearch = () => {
    setSearchQuery("");
    // Focus the input after clearing
    const searchInput = document.querySelector(
      'input[placeholder="Search photos..."]',
    ) as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
    }
  };

  const handleViewModeChange = (value: string) => {
    if (value) {
      // ToggleGroup can return empty string if deselected
      const newMode = value as "tile" | "list" | "gallery";
      updateViewPreference("viewMode", newMode);
      // Only reset galleryIndex if switching *away* from gallery mode
      if (newMode !== "gallery") {
        setGalleryIndex(null);
      }
      setFocusedIndex(-1); // Reset focus on view change
    }
  };

  // --- Dialog Open/Close Handlers ---

  const openViewDialog = (photo: Photo) => {
    // Navigate to the dedicated photo detail page instead of opening modal
    router.push(`/photos/${photo.id}`);
  };

  const openEditDialog = (photo: Photo) => {
    setEditingPhoto({
      id: photo.id,
      title: photo.title,
      description: photo.description,
      tags: photo.tags,
      deviceId: photo.deviceId,
    });
    setIsEditPhotoDialogOpen(true);
  };

  // Removed openNewDialog

  const openConfirmDeleteDialog = (photo: Photo) => {
    setPhotoToDelete(photo);
    setIsConfirmDeleteDialogOpen(true);
  };

  const openGalleryView = (index: number) => {
    if (index >= 0 && index < sortedAndFilteredPhotos.length) {
      setGalleryIndex(index);
      updateViewPreference("viewMode", "gallery"); // Switch view mode
    }
  };

  const closeGalleryView = () => {
    setGalleryIndex(null);
    updateViewPreference("viewMode", "tile"); // Revert to tile or previous view? Tile is safer.
  };

  const navigateGallery = (direction: "next" | "prev") => {
    if (galleryIndex === null) return;
    const total = sortedAndFilteredPhotos.length;
    let nextIndex;
    if (direction === "next") {
      nextIndex = (galleryIndex + 1) % total;
    } else {
      nextIndex = (galleryIndex - 1 + total) % total;
    }
    setGalleryIndex(nextIndex);
  };

  // --- Form Input Handlers (Only for Edit Dialog) ---

  const handleEditingPhotoChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setEditingPhoto((prev) =>
      prev ? { ...prev, [name]: value === null ? null : value } : null,
    );
  };

  const handleEditingPhotoTagsChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const tags = e.target.value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    setEditingPhoto((prev) => (prev ? { ...prev, tags } : null));
  };

  // Handle adding tags to photos
  const handleAddTag = () => {
    if (!tagInput.trim()) return;

    const tag = tagInput.trim().toLowerCase();

    // Add tag to editing photo if it doesn't already exist
    if (editingPhoto && !editingPhoto.tags.includes(tag)) {
      setEditingPhoto({
        ...editingPhoto,
        tags: [...editingPhoto.tags, tag],
      });
    }

    setTagInput("");
  };

  // Handle removing tags
  const handleRemoveTag = (tag: string) => {
    if (editingPhoto) {
      setEditingPhoto({
        ...editingPhoto,
        tags: editingPhoto.tags.filter((t) => t !== tag),
      });
    }
  };

  // Handle pin toggle for photos
  const handlePinToggle = async (photo: Photo) => {
    const newPinned = !photo.isPinned;

    try {
      const response = await togglePin("photos", photo.id, newPinned);

      if (!response.ok) {
        throw new Error(`Failed to ${newPinned ? "pin" : "unpin"} photo`);
      }

      // Refresh data to reflect changes
      refresh();

      toast({
        title: newPinned ? "Photo pinned" : "Photo unpinned",
        description: `"${photo.title}" has been ${newPinned ? "pinned" : "unpinned"}.`,
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

  // Handle flag color change for photos
  const handleFlagColorChange = async (
    photo: Photo,
    color: "red" | "yellow" | "orange" | "green" | "blue" | null,
  ) => {
    const previousColor = photo.flagColor;

    try {
      const response = await setFlagColor("photos", photo.id, color);

      if (!response.ok) {
        throw new Error("Failed to update flag color");
      }

      // Refresh data to reflect changes
      refresh();

      toast({
        title: color ? "Photo flagged" : "Flag removed",
        description: color
          ? `"${photo.title}" has been flagged as ${color}.`
          : `Flag removed from "${photo.title}".`,
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
  const handleChatClick = (photo: Photo) => {
    // Use the global function to open assistant with pre-attached assets
    if (
      typeof window !== "undefined" &&
      (window as any).openAssistantWithAssets
    ) {
      (window as any).openAssistantWithAssets([
        {
          type: "photo",
          id: photo.id,
          title: photo.title,
        },
      ]);
    }
  };

  // --- API Action Handlers (Update, Delete) ---

  const handleUpdatePhoto = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingPhoto) return;

    try {
      // Prepare only the data that needs updating
      const updateData: Partial<Photo> = {
        title: editingPhoto.title,
        description: editingPhoto.description,
        tags: editingPhoto.tags,
        deviceId: editingPhoto.deviceId,
      };

      await updatePhoto(editingPhoto.id, updateData);

      setIsEditPhotoDialogOpen(false);
      setEditingPhoto(null); // Clear editing state
      setSelectedPhoto(null); // Clear selected state
      toast({
        title: "Photo Updated",
        description: `"${editingPhoto.title}" updated.`,
      });
    } catch (err) {
      // Error handling is done in the mutation
      console.error("Update photo error:", err);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!photoToDelete) return;

    try {
      await deletePhoto(photoToDelete.id);

      setIsConfirmDeleteDialogOpen(false);
      // If deleting from gallery view, close it
      if (viewMode === "gallery" && selectedPhoto?.id === photoToDelete.id) {
        closeGalleryView();
      }
      setPhotoToDelete(null); // Clear delete state
      toast({
        title: "Photo Deleted",
        description: `"${photoToDelete.title}" deleted.`,
      });
    } catch (err) {
      // Error handling is done in the mutation
      console.error("Delete photo error:", err);
    }
  };

  // --- Upload Handling ---
  const handleUpload = useCallback(
    async (acceptedFiles: File[]) => {
      const newUploads: UploadingFile[] = acceptedFiles.map((file) => ({
        id: nanoid(), // Unique ID for this upload instance
        file,
        progress: 0,
        status: "pending",
      }));

      setUploadingFiles((prev) => [...newUploads, ...prev]); // Add to the top

      for (const upload of newUploads) {
        // Update status to uploading
        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.id === upload.id ? { ...f, status: "uploading" } : f,
          ),
        );

        const formData = new FormData();

        // Prepare metadata object
        const metadata = {
          title: upload.file.name.replace(/\.[^/.]+$/, ""), // Extract title from filename
          description: "", // Default empty description
          tags: [], // Default empty tags array
          originalFilename: upload.file.name, // Store original filename
        };

        // Add metadata as JSON string
        formData.append("metadata", JSON.stringify(metadata));

        // Add file content (renamed from photoFile to content)
        formData.append("content", upload.file);

        try {
          // Note: Simulating progress here. Real progress requires XHR or fetch streams.
          // For simplicity, we'll just update progress visually without real tracking.
          // A more robust solution would involve server-sent events or websockets for progress.
          setUploadingFiles((prev) =>
            prev.map((f) => (f.id === upload.id ? { ...f, progress: 50 } : f)),
          );

          const response = await apiFetch("/api/photos", {
            method: "POST",
            headers: {
              // Don't set Content-Type for FormData, let browser handle it
            },
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response
              .json()
              .catch(() => ({ error: `Upload failed (${response.status})` }));
            throw new Error(
              errorData.error || `Failed to upload ${upload.file.name}`,
            );
          }

          const createdPhoto = (await response.json()) as Photo;

          // Refresh the photos list to show the new upload
          refresh();

          // Update upload status to success
          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.id === upload.id
                ? {
                    ...f,
                    status: "success",
                    progress: 100,
                    photoId: createdPhoto.id,
                  }
                : f,
            ),
          );

          toast({
            title: "Upload Successful",
            description: `"${createdPhoto.title}" added.`,
          });
        } catch (err) {
          console.error("Error uploading file:", upload.file.name, err);
          const message =
            err instanceof Error ? err.message : "An unknown error occurred.";
          // Update upload status to error
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
    [toast],
  ); // Added toast dependency

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    open: openFileDialog,
  } = useDropzone({
    onDrop: handleUpload,
    accept: ALLOWED_UPLOAD_TYPES,
    maxSize: MAX_FILE_SIZE_BYTES,
    multiple: true,
    noClick: true, // Prevent opening file dialog on click of the dropzone itself
    noKeyboard: true, // Prevent opening file dialog on keyboard interaction
    onDropRejected: (fileRejections) => {
      fileRejections.forEach(({ file, errors }) => {
        errors.forEach((error) => {
          let message = error.message;
          if (error.code === "file-too-large") {
            message = `File is larger than ${MAX_FILE_SIZE_MB} MB`;
          } else if (error.code === "file-invalid-type") {
            message = `Invalid file type. Allowed: ${Object.values(ALLOWED_UPLOAD_TYPES).flat().join(", ")}`;
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

  // --- Keyboard Navigation ---
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const items = sortedAndFilteredPhotos;
      if (!items.length || viewMode === "gallery") return; // Gallery handles its own keys

      const currentFocusableElement = document.activeElement;
      const isInputFocused =
        currentFocusableElement?.tagName === "INPUT" ||
        currentFocusableElement?.tagName === "TEXTAREA" ||
        currentFocusableElement?.getAttribute("role") === "combobox";

      if (
        isInputFocused &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
      ) {
        // Allow default arrow key behavior in inputs/selects
        return;
      }

      let newIndex = focusedIndex;
      const itemsPerRow =
        viewMode === "tile"
          ? Number.parseInt(
              getComputedStyle(photosContainerRef.current!)
                .gridTemplateColumns.split(" ")
                .length.toString(),
            ) || 4
          : 1; // Estimate items per row for tile view

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
          if (viewMode === "list" && focusedIndex < 0)
            newIndex = 0; // Start at first item if none focused
          else newIndex = Math.min(items.length - 1, focusedIndex + 1);
          break;
        case "ArrowLeft":
          event.preventDefault();
          if (viewMode === "list" && focusedIndex < 0)
            newIndex = 0; // Start at first item if none focused
          else newIndex = Math.max(0, focusedIndex - 1);
          break;
        case "Enter":
        case " ": // Space key
          if (focusedIndex >= 0 && focusedIndex < items.length) {
            event.preventDefault();
            openGalleryView(focusedIndex); // Open gallery on Enter/Space
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
          // Could potentially clear focus or search query
          setFocusedIndex(-1);
          (event.target as HTMLElement).blur(); // Remove focus from container
          break;
        default:
          return; // Don't interfere with other keys
      }

      if (newIndex !== focusedIndex) {
        setFocusedIndex(newIndex);
        // Focus the item visually (scrolling handled by browser focus or manually if needed)
        const itemElement = photosContainerRef.current?.querySelector(
          `[data-index="${newIndex}"]`,
        ) as HTMLElement;
        itemElement?.focus();
      }
    },
    [focusedIndex, sortedAndFilteredPhotos, viewMode, openGalleryView],
  );

  // Effect for gallery keyboard navigation
  useEffect(() => {
    const handleGalleryKeyDown = (event: KeyboardEvent) => {
      if (viewMode !== "gallery" || galleryIndex === null) return;

      switch (event.key) {
        case "ArrowRight":
        case " ": // Space also advances
          navigateGallery("next");
          break;
        case "ArrowLeft":
          navigateGallery("prev");
          break;
        case "Escape":
          closeGalleryView();
          break;
        case "Enter": {
          // Maybe open edit dialog for current gallery image?
          const currentPhoto = sortedAndFilteredPhotos[galleryIndex];
          if (currentPhoto) {
            openEditDialog(currentPhoto);
          }
          break;
        }
        case "Delete":
        case "Backspace": {
          const photoToDelete = sortedAndFilteredPhotos[galleryIndex];
          if (photoToDelete) {
            openConfirmDeleteDialog(photoToDelete);
          }
          break;
        }
      }
    };

    window.addEventListener("keydown", handleGalleryKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGalleryKeyDown);
    };
  }, [
    viewMode,
    galleryIndex,
    sortedAndFilteredPhotos,
    navigateGallery,
    closeGalleryView,
    openEditDialog,
    openConfirmDeleteDialog,
  ]);

  // --- Render Logic ---

  const renderContent = () => {
    if (isLoading && photos.length === 0) {
      return (
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-medium mb-2">Loading Photos...</h2>
          </div>
        </div>
      );
    }

    if (error && photos.length === 0) {
      return (
        <div className="container mx-auto py-10 text-center">
          <Alert variant="destructive" className="max-w-md mx-auto">
            <AlertTitle>Error Loading Photos</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
          <Button onClick={refresh} className="mt-6">
            Try Again
          </Button>
        </div>
      );
    }

    if (
      viewMode === "gallery" &&
      galleryIndex !== null &&
      sortedAndFilteredPhotos[galleryIndex]
    ) {
      return (
        <GalleryView
          photos={sortedAndFilteredPhotos}
          currentIndex={galleryIndex}
          onClose={closeGalleryView}
          onNavigate={navigateGallery}
          onEdit={openEditDialog}
          onDelete={openConfirmDeleteDialog}
          onNavigateToIndex={setGalleryIndex} // Pass setGalleryIndex
        />
      );
    }

    if (sortedAndFilteredPhotos.length === 0 && uploadingFiles.length === 0) {
      return (
        <div className="text-center py-16 text-muted-foreground">
          <Camera className="h-16 w-16 mx-auto mb-4 text-gray-400" />
          <p className="mb-4">
            {photos.length === 0
              ? "Your photo collection is empty."
              : "No photos found matching your criteria."}
          </p>
          {photos.length === 0 && !isLoading && (
            <p>Drag and drop photos here or use the upload button.</p>
          )}
        </div>
      );
    }

    // Conditionally render Tile or List view
    return (
      <div
        ref={photosContainerRef}
        onKeyDown={handleKeyDown} // Attach keydown listener here
        tabIndex={0} // Make the container focusable
        className="outline-none" // Hide default focus outline
      >
        {/* Pass openViewDialog directly to the components */}
        {viewMode === "tile" && (
          <TileView
            photos={sortedAndFilteredPhotos}
            focusedIndex={
              focusedIndex
            } /* REMOVED onPhotoClick={openGalleryView} */
            openViewDialog={openViewDialog}
            onEditClick={openEditDialog}
            onDeleteClick={openConfirmDeleteDialog}
            onPinToggle={handlePinToggle}
            onFlagColorChange={handleFlagColorChange}
            onChatClick={handleChatClick}
            sortBy={sortBy}
          />
        )}
        {viewMode === "list" && (
          <ListView
            photos={sortedAndFilteredPhotos}
            focusedIndex={
              focusedIndex
            } /* REMOVED onPhotoClick={openGalleryView} */
            openViewDialog={openViewDialog}
            onEditClick={openEditDialog}
            onDeleteClick={openConfirmDeleteDialog}
            onPinToggle={handlePinToggle}
            onFlagColorChange={handleFlagColorChange}
            onChatClick={handleChatClick}
          />
        )}{" "}
      </div>
    );
  };

  return (
    <TooltipProvider>
      {/* The root div is now just for the dropzone functionality and relative positioning. */}
      {/* The `space-y-6` class has been removed from here. */}
      <div
        {...getRootProps()}
        className={`min-h-screen relative ${isDragActive ? "bg-blue-50 dark:bg-blue-900/30 outline-dashed outline-2 outline-blue-500" : ""}`}
      >
        {/* These elements are part of the dropzone, not the main layout flow */}
        <input
          {...getInputProps()}
          className="absolute opacity-0 pointer-events-none"
        />
        {isDragActive && (
          <div className="absolute inset-0 bg-black/10 dark:bg-white/10 flex items-center justify-center z-50 pointer-events-none">
            <div className="text-center p-6 bg-background rounded-lg shadow-xl">
              <UploadCloud className="h-16 w-16 text-blue-500 mx-auto mb-4" />
              <p className="text-xl font-semibold">Drop photos to upload</p>
            </div>
          </div>
        )}

        {/* This new div now manages the vertical spacing for all content blocks */}
        <div className="space-y-6">
          {/* Header Section */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <MobileListsBackButton />
              <div>
                <h1 className="text-lg md:text-3xl font-bold md:tracking-tight">
                  Photos
                  {photos.length > 0 && (
                    <span className="ml-2 text-sm md:text-base font-normal text-muted-foreground">
                      {sortedAndFilteredPhotos.length === photos.length
                        ? `(${photos.length})`
                        : `(${sortedAndFilteredPhotos.length} of ${photos.length})`}
                    </span>
                  )}
                </h1>
              </div>
            </div>
            <Button onClick={openFileDialog}>
              <UploadCloud className="mr-2 h-4 w-4" />
              Upload Photos
            </Button>
          </div>

          {/* Controls Section: Search, Filter, Sort, View */}
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            {/* Search with Mobile Filter Button */}
            <div className="flex gap-2 w-full md:flex-grow">
              <div className="relative flex-grow">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search photos..."
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
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsFilterDialogOpen(true)}
                className="md:hidden shrink-0 relative"
              >
                <Filter className="h-4 w-4" />
                {getActiveFilterCount() > 0 && (
                  <div className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {getActiveFilterCount()}
                  </div>
                )}
              </Button>
            </div>

            {/* Filter & Sort */}
            <div className="hidden md:flex gap-2 w-full md:w-auto">
              <Select value={filterTag} onValueChange={handleTagFilterChange}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="Filter by Tag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tags</SelectItem>
                  {allTags.map((tag: string) => (
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
                  <SelectItem value="dateTaken">Date Taken</SelectItem>
                  <SelectItem value="createdAt">Date Added</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="location">Location</SelectItem>
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
            </div>

            {/* View Switcher */}
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={handleViewModeChange}
              className="hidden md:flex w-full md:w-auto justify-start"
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
              <ToggleGroupItem
                value="gallery"
                aria-label="Gallery view"
                title="Gallery View"
                disabled={sortedAndFilteredPhotos.length === 0}
                // This onClick ensures galleryIndex is set when clicking the button
                onClick={() =>
                  sortedAndFilteredPhotos.length > 0 && openGalleryView(0)
                }
              >
                <GalleryHorizontalEnd className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
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

          {/* Error Indicators (Inline if content already exists) */}
          {error && photos.length > 0 && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Update Error</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}

          {/* Main Content Area (Tiles, List, or Gallery) */}
          {renderContent()}
        </div>

        {/* --- Dialogs --- */}
        {/* View Photo Details Dialog (Keep as is, maybe minor style tweaks) */}
        <Dialog
          open={isViewPhotoDialogOpen}
          onOpenChange={setIsViewPhotoDialogOpen}
        >
          {/* Content remains the same as provided */}
          <DialogContent className="sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle className="truncate">
                {selectedPhoto?.title ?? "Photo Details"}
              </DialogTitle>
              <DialogDescription>
                Taken on{" "}
                {selectedPhoto
                  ? formatDate(
                      selectedPhoto.dateTaken ?? selectedPhoto.createdAt,
                    )
                  : "N/A"}
              </DialogDescription>
            </DialogHeader>
            {selectedPhoto && (
              <div className="grid md:grid-cols-3 gap-6 py-4 max-h-[75vh] overflow-y-auto pr-2">
                {" "}
                {/* Added padding-right for scrollbar */}
                <div className="md:col-span-2 aspect-video overflow-hidden rounded-md bg-muted flex items-center justify-center">
                  <img
                    src={
                      selectedPhoto.processingStatus === "failed"
                        ? "/placeholder.svg"
                        : selectedPhoto.imageUrl
                    }
                    alt={selectedPhoto.title}
                    className="object-contain max-w-full max-h-[70vh]"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      // Prevent infinite error loops by tracking retry count
                      const retryCount = parseInt(
                        img.dataset.retryCount || "0",
                        10,
                      );
                      if (retryCount < 1) {
                        img.dataset.retryCount = String(retryCount + 1);
                        img.src = "/placeholder.svg";
                      }
                    }}
                  />
                </div>
                <div className="space-y-4 text-sm md:col-span-1">
                  {/* Basic Info */}
                  <h3 className="font-semibold mb-2 border-b pb-1 text-base">
                    Information
                  </h3>
                  <div className="space-y-2.5">
                    <div>
                      <Label className="text-xs text-muted-foreground font-medium">
                        Description
                      </Label>
                      <p className="mt-0.5">
                        {selectedPhoto.description || (
                          <span className="italic text-muted-foreground">
                            No description.
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground font-medium">
                        Tags
                      </Label>
                      {selectedPhoto.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {selectedPhoto.tags.map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="font-normal"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-0.5 italic text-muted-foreground">
                          No tags.
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground font-medium">
                        Filename
                      </Label>
                      <p className="mt-0.5 truncate">
                        {selectedPhoto.originalFilename}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground font-medium">
                        File Size / Type
                      </Label>
                      <p className="mt-0.5">
                        {formatFileSize(selectedPhoto.fileSize)} (
                        {selectedPhoto.mimeType})
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground font-medium">
                        Dimensions
                      </Label>
                      <p className="mt-0.5">
                        {formatDimensions(
                          selectedPhoto.imageWidth,
                          selectedPhoto.imageHeight,
                        )}
                      </p>
                    </div>
                  </div>

                  {/* EXIF Details */}
                  <h3 className="font-semibold mb-2 border-b pb-1 pt-3 text-base">
                    Camera Details
                  </h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                    <div>
                      <Label className="text-xs text-muted-foreground font-medium">
                        Camera
                      </Label>
                      <p className="mt-0.5">
                        {selectedPhoto.cameraMake ||
                        selectedPhoto.cameraModel ? (
                          `${selectedPhoto.cameraMake || ""} ${selectedPhoto.cameraModel || ""}`.trim()
                        ) : (
                          <span className="italic text-muted-foreground">
                            N/A
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground font-medium">
                        Lens
                      </Label>
                      <p className="mt-0.5">
                        {selectedPhoto.lensModel || (
                          <span className="italic text-muted-foreground">
                            N/A
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground font-medium">
                        Aperture
                      </Label>
                      <p className="mt-0.5">
                        {selectedPhoto.fNumber ? (
                          formatFNumber(selectedPhoto.fNumber)
                        ) : (
                          <span className="italic text-muted-foreground">
                            N/A
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground font-medium">
                        Shutter Speed
                      </Label>
                      <p className="mt-0.5">
                        {selectedPhoto.exposureTime ? (
                          formatExposureTime(selectedPhoto.exposureTime)
                        ) : (
                          <span className="italic text-muted-foreground">
                            N/A
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground font-medium">
                        ISO
                      </Label>
                      <p className="mt-0.5">
                        {selectedPhoto.iso ?? (
                          <span className="italic text-muted-foreground">
                            N/A
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground font-medium">
                        Device ID
                      </Label>
                      <p className="mt-0.5">
                        {selectedPhoto.deviceId || (
                          <span className="italic text-muted-foreground">
                            N/A
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Location Details */}
                  <h3 className="font-semibold mb-2 border-b pb-1 pt-3 text-base">
                    Location
                  </h3>
                  <div className="space-y-2.5">
                    <div>
                      <Label className="text-xs text-muted-foreground font-medium">
                        Place
                      </Label>
                      <p className="mt-0.5">
                        {formatLocation(
                          selectedPhoto.locationCity,
                          selectedPhoto.locationCountryName,
                        ) ?? (
                          <span className="italic text-muted-foreground">
                            No location data
                          </span>
                        )}
                      </p>
                    </div>
                    {selectedPhoto.latitude && selectedPhoto.longitude && (
                      <div>
                        <Label className="text-xs text-muted-foreground font-medium">
                          Coordinates
                        </Label>
                        <Link
                          href={`https://www.google.com/maps/search/?api=1&query=${selectedPhoto.latitude},${selectedPhoto.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline mt-0.5"
                        >
                          <FileText className="h-3 w-3" />
                          <span>
                            {selectedPhoto.latitude.toFixed(5)},{" "}
                            {selectedPhoto.longitude.toFixed(5)}
                          </span>
                        </Link>
                      </div>
                    )}
                  </div>

                  {/* Timestamps */}
                  <h3 className="font-semibold mb-2 border-b pb-1 pt-3 text-base">
                    Timestamps
                  </h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                    <div>
                      <Label className="text-xs text-muted-foreground font-medium">
                        Date Taken
                      </Label>
                      <p className="mt-0.5">
                        {formatDate(selectedPhoto.dateTaken)}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground font-medium">
                        Date Uploaded
                      </Label>
                      <p className="mt-0.5">
                        {formatDate(selectedPhoto.createdAt)}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground font-medium">
                        Last Updated
                      </Label>
                      <p className="mt-0.5">
                        {formatDate(selectedPhoto.updatedAt)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter className="sm:justify-between gap-2 pt-4 border-t mt-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setIsViewPhotoDialogOpen(false);
                  if (selectedPhoto) openConfirmDeleteDialog(selectedPhoto);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
              <div className="flex gap-2">
                <DialogClose asChild>
                  <Button variant="outline" size="sm">
                    Close
                  </Button>
                </DialogClose>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    setIsViewPhotoDialogOpen(false);
                    if (selectedPhoto) openEditDialog(selectedPhoto);
                  }}
                >
                  <Edit className="mr-2 h-4 w-4" /> Edit Metadata
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Photo Metadata Dialog (Keep as is) */}
        <Dialog
          open={isEditPhotoDialogOpen}
          onOpenChange={setIsEditPhotoDialogOpen}
        >
          {/* Content remains the same as provided */}
          <DialogContent className="sm:max-w-lg">
            <form onSubmit={handleUpdatePhoto}>
              <DialogHeader>
                <DialogTitle>Edit Photo Metadata</DialogTitle>
                <DialogDescription>
                  Make changes to the details of "{editingPhoto?.title}". File
                  content and EXIF data cannot be changed here.
                </DialogDescription>
              </DialogHeader>
              {editingPhoto && (
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-title">
                      Title <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="edit-title"
                      name="title"
                      value={editingPhoto.title}
                      onChange={handleEditingPhotoChange}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-description">Description</Label>
                    <Textarea
                      id="edit-description"
                      name="description"
                      rows={3}
                      value={editingPhoto.description ?? ""}
                      onChange={handleEditingPhotoChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tags</Label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {editingPhoto.tags.map((tag) => (
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
                  <div className="space-y-2">
                    <Label htmlFor="edit-deviceId">Device ID</Label>
                    <Input
                      id="edit-deviceId"
                      name="deviceId"
                      value={editingPhoto.deviceId ?? ""}
                      onChange={handleEditingPhotoChange}
                      placeholder="e.g. iPhone 15 Pro"
                    />
                  </div>
                </div>
              )}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  disabled={isUpdating || !editingPhoto?.title}
                >
                  {isUpdating && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Removed New Photo Dialog */}

        {/* Confirm Delete Dialog (Keep as is) */}
        <Dialog
          open={isConfirmDeleteDialogOpen}
          onOpenChange={setIsConfirmDeleteDialogOpen}
        >
          {/* Content remains the same as provided */}
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm Deletion</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete the photo "
                {photoToDelete?.title}
                "? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {photoToDelete && (
              <div className="my-4 flex justify-center">
                <img
                  src={
                    photoToDelete.processingStatus === "failed"
                      ? "/placeholder.svg"
                      : photoToDelete.imageUrl
                  }
                  alt="Thumbnail"
                  className="max-h-24 rounded border bg-muted"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    // Prevent infinite error loops by tracking retry count
                    const retryCount = parseInt(
                      img.dataset.retryCount || "0",
                      10,
                    );
                    if (retryCount < 1) {
                      img.dataset.retryCount = String(retryCount + 1);
                      img.src = "/placeholder.svg";
                    }
                  }}
                />
              </div>
            )}
            <DialogFooter className="sm:justify-end">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteConfirmed}
                disabled={isDeleting}
              >
                {isDeleting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Mobile Filter Dialog */}
        <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Filter & Sort Photos</DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              {/* Filters Section */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                  Filters
                </h4>
                <div className="space-y-2">
                  <div>
                    <label className="text-sm font-medium">Tag</label>
                    <Select
                      value={filterTag}
                      onValueChange={handleTagFilterChange}
                    >
                      <SelectTrigger className="w-full mt-1">
                        <SelectValue placeholder="Filter by Tag" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Tags</SelectItem>
                        {allTags.map((tag: string) => (
                          <SelectItem key={tag} value={tag}>
                            {tag}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Sort & View Section */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                  Sort & View
                </h4>
                <div className="space-y-2">
                  <div>
                    <label className="text-sm font-medium">Sort by</label>
                    <Select value={sortBy} onValueChange={handleSortByChange}>
                      <SelectTrigger className="w-full mt-1">
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dateTaken">Date Taken</SelectItem>
                        <SelectItem value="createdAt">Date Added</SelectItem>
                        <SelectItem value="title">Title</SelectItem>
                        <SelectItem value="location">Location</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">
                      Sort Direction
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleSortDir}
                      className="h-8"
                    >
                      {sortDir === "asc" ? (
                        <>
                          <ArrowUp className="h-3 w-3 mr-1" />
                          Ascending
                        </>
                      ) : (
                        <>
                          <ArrowDown className="h-3 w-3 mr-1" />
                          Descending
                        </>
                      )}
                    </Button>
                  </div>
                  <div>
                    <label className="text-sm font-medium">View Mode</label>
                    <ToggleGroup
                      type="single"
                      value={viewMode}
                      onValueChange={handleViewModeChange}
                      className="w-full mt-1 justify-start"
                    >
                      <ToggleGroupItem
                        value="tile"
                        aria-label="Tile view"
                        className="flex-1"
                      >
                        <LayoutGrid className="h-4 w-4 mr-2" />
                        Tiles
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="list"
                        aria-label="List view"
                        className="flex-1"
                      >
                        <List className="h-4 w-4 mr-2" />
                        List
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="gallery"
                        aria-label="Gallery view"
                        className="flex-1"
                        onClick={() => {
                          if (sortedAndFilteredPhotos.length > 0) {
                            openGalleryView(0);
                          }
                        }}
                      >
                        <GalleryHorizontalEnd className="h-4 w-4 mr-2" />
                        Gallery
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={clearAllFilters}
                  disabled={getActiveFilterCount() === 0}
                >
                  Clear Filters
                </Button>
                <Button onClick={() => setIsFilterDialogOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>{" "}
    </TooltipProvider>
  );
}

// --- Child Components for Views ---

// --- 1. Tile View ---
interface TileViewProps {
  photos: Photo[];
  focusedIndex: number;
  sortBy: "dateTaken" | "createdAt" | "title" | "location";
  // onPhotoClick: (index: number) => void; // Removed
  openViewDialog: (photo: Photo) => void; // Added
  onEditClick: (photo: Photo) => void;
  onDeleteClick: (photo: Photo) => void;
  onPinToggle: (photo: Photo) => void;
  onFlagColorChange: (
    photo: Photo,
    color: "red" | "yellow" | "orange" | "green" | "blue" | null,
  ) => void;
  onChatClick: (photo: Photo) => void;
}

function TileView({
  photos,
  focusedIndex,
  sortBy,
  openViewDialog,
  onEditClick,
  onDeleteClick,
  onPinToggle,
  onFlagColorChange,
  onChatClick,
}: TileViewProps) {
  let lastGroupLabel = "";

  return (
    <div className="grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {photos.map((photo, index) => {
        const isGrouped = sortBy === "dateTaken";
        // Use dateTaken if available, otherwise createdAt for the label
        const dateForGrouping = photo.dateTaken ?? photo.createdAt;
        const currentGroupLabel = isGrouped
          ? getGroupDateLabel(dateForGrouping)
          : "";
        const showGroupHeader =
          isGrouped && currentGroupLabel !== lastGroupLabel;
        if (showGroupHeader) {
          lastGroupLabel = currentGroupLabel;
        }
        // ... rest of the TileView map function
        return (
          <React.Fragment key={photo.id}>
            {showGroupHeader && (
              <h2 className="col-span-full text-lg font-semibold mt-6 mb-2 pl-1 border-b pb-1">
                {currentGroupLabel}
              </h2>
            )}
            <PhotoTileItem
              photo={photo}
              index={index}
              isFocused={index === focusedIndex}
              // *** CHANGE THIS LINE FOR ISSUE 2 ***
              // onClick={() => onPhotoClick(index)} // Old: Opens gallery
              onClick={() => openViewDialog(photo)} // New: Opens details dialog
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

// --- 2. Photo Tile Item ---
interface PhotoTileItemProps {
  photo: Photo;
  index: number;
  isFocused: boolean;
  onClick: () => void;
  onEditClick: (photo: Photo) => void;
  onDeleteClick: (photo: Photo) => void;
  onPinToggle: (photo: Photo) => void;
  onFlagColorChange: (
    photo: Photo,
    color: "red" | "yellow" | "orange" | "green" | "blue" | null,
  ) => void;
  onChatClick: (photo: Photo) => void;
}

function PhotoTileItem({
  photo,
  index,
  isFocused,
  onClick,
  onEditClick,
  onDeleteClick,
  onPinToggle,
  onFlagColorChange,
  onChatClick,
}: PhotoTileItemProps) {
  const { toast } = useToast();
  const locationString = formatLocation(
    photo.locationCity,
    photo.locationCountryName,
  );
  const displayDate = formatDate(photo.dateTaken ?? photo.createdAt);
  // Don't load image for failed photos to prevent infinite error loops
  const imgSrc =
    photo.processingStatus === "failed" ? "/placeholder.svg" : photo.imageUrl;

  return (
    <Card
      data-index={index} // For keyboard navigation targeting
      tabIndex={-1} // Make it programmatically focusable but not via Tab key
      className={`group cursor-pointer overflow-hidden transition-all duration-200 ease-in-out hover:shadow-lg flex flex-col bg-card outline-none ${isFocused ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""}`}
      onClick={onClick}
      onDoubleClick={() => onEditClick(photo)} // Example: Double click to edit
    >
      <CardHeader className="p-0">
        <div className="aspect-video relative overflow-hidden bg-muted">
          <img
            src={imgSrc}
            alt={photo.title}
            className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={(e) => {
              const img = e.target as HTMLImageElement;
              // Prevent infinite error loops by tracking retry count
              const retryCount = parseInt(img.dataset.retryCount || "0", 10);
              if (retryCount < 1) {
                img.dataset.retryCount = String(retryCount + 1);
                img.src = "/placeholder.svg";
                img.classList.add("opacity-50");
              }
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>

          {/* Processing Status Icon */}
          <div className="absolute top-2 left-2">
            <SimpleProcessingStatusIcon
              status={photo.processingStatus}
              enabled={photo.enabled}
              className="bg-white/90 dark:bg-black/90 rounded-full p-1"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 space-y-1.5 flex-grow">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 overflow-hidden">
            <CardTitle
              className="text-sm font-semibold line-clamp-1"
              title={photo.title}
            >
              {photo.title}
            </CardTitle>
            <CardDescription
              className="text-xs flex items-center gap-1 text-muted-foreground mt-0.5"
              title={displayDate}
            >
              <CalendarDays className="h-3 w-3 flex-shrink-0" />
              <span>{displayDate}</span>
            </CardDescription>
            {locationString && (
              <CardDescription
                className="text-xs flex items-center gap-1 text-muted-foreground mt-0.5"
                title={locationString}
              >
                <MapPin className="h-3 w-3 flex-shrink-0" />
                <span className="line-clamp-1">{locationString}</span>
              </CardDescription>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <PinFlagControls
              isPinned={photo.isPinned || false}
              flagColor={photo.flagColor}
              onPinToggle={() => onPinToggle(photo)}
              onFlagToggle={() =>
                onFlagColorChange(photo, photo.flagColor ? null : "orange")
              }
              onFlagColorChange={(color) => onFlagColorChange(photo, color)}
              size="sm"
            />
            {/* Chat Icon */}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onChatClick(photo);
              }}
              title="Chat about this photo"
            >
              <MessageSquare className="h-3 w-3 text-gray-400" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem onClick={onClick}>
                  <FileText className="mr-2 h-4 w-4" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEditClick(photo)}>
                  <Edit className="mr-2 h-4 w-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    window.open(photo.imageUrl, "_blank");
                    toast({
                      title: "Opening Image", // More accurate than "Download Started"
                      description: `Opening ${photo.originalFilename} in a new tab. You can save it from there.`,
                    });
                  }}
                >
                  <Download className="mr-2 h-4 w-4" /> Download
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDeleteClick(photo)}
                  className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/50"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {photo.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {photo.tags.slice(0, 3).map((tag: string) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs px-1.5 py-0.5 font-normal"
              >
                {tag}
              </Badge>
            ))}
            {photo.tags.length > 3 && (
              <Badge
                variant="outline"
                className="text-xs px-1.5 py-0.5 font-normal"
              >
                +{photo.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- 3. List View ---
interface ListViewProps {
  photos: Photo[];
  focusedIndex: number;
  // onPhotoClick: (index: number) => void; // Removed
  openViewDialog: (photo: Photo) => void; // Added
  onEditClick: (photo: Photo) => void;
  onDeleteClick: (photo: Photo) => void;
  onPinToggle: (photo: Photo) => void;
  onFlagColorChange: (
    photo: Photo,
    color: "red" | "yellow" | "orange" | "green" | "blue" | null,
  ) => void;
  onChatClick: (photo: Photo) => void;
}

function ListView({
  photos,
  focusedIndex,
  openViewDialog,
  onEditClick,
  onDeleteClick,
  onPinToggle,
  onFlagColorChange,
  onChatClick,
}: ListViewProps) {
  const { toast } = useToast();

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="divide-y divide-border">
        {/* Header Row (Optional) */}
        <div className="flex items-center px-4 py-2 bg-muted/50 text-sm font-medium text-muted-foreground">
          <div className="w-16 flex-shrink-0 mr-4"></div>{" "}
          {/* Thumbnail space */}
          <div className="flex-1 min-w-0 mr-4">Title</div>
          <div className="w-32 hidden md:block mr-4">Date Taken</div>
          <div className="w-32 hidden lg:block mr-4">Date Added</div>
          <div className="w-40 hidden md:block mr-4">Location</div>
          <div className="w-24 hidden sm:block mr-4">Size</div>
          <div className="w-16 flex-shrink-0 mr-3">Actions</div>
        </div>

        {/* Data Rows */}
        {photos.map((photo, index) => {
          const locationString = formatLocation(
            photo.locationCity,
            photo.locationCountryName,
          );
          // Don't load image for failed photos to prevent infinite error loops
          const imgSrc =
            photo.processingStatus === "failed"
              ? "/placeholder.svg"
              : photo.imageUrl;
          const isFocused = index === focusedIndex;

          return (
            <div
              key={photo.id}
              data-index={index} // For keyboard navigation targeting
              tabIndex={-1} // Make it programmatically focusable
              className={`flex items-center px-4 py-2 hover:bg-muted/50 cursor-pointer outline-none ${isFocused ? "ring-2 ring-ring ring-offset-2 ring-offset-background bg-muted/50" : ""}`}
              onClick={() => openViewDialog(photo)}
              onDoubleClick={() => onEditClick(photo)}
            >
              {/* Thumbnail */}
              <div className="w-16 h-12 flex-shrink-0 mr-4 bg-muted rounded overflow-hidden relative">
                <img
                  src={imgSrc}
                  alt={photo.title}
                  className="object-cover w-full h-full"
                  loading="lazy"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    // Prevent infinite error loops by tracking retry count
                    const retryCount = parseInt(
                      img.dataset.retryCount || "0",
                      10,
                    );
                    if (retryCount < 1) {
                      img.dataset.retryCount = String(retryCount + 1);
                      img.src = "/placeholder.svg";
                    }
                  }}
                />
                {/* Processing Status Icon */}
                <div className="absolute top-1 right-1">
                  <SimpleProcessingStatusIcon
                    status={photo.processingStatus}
                    enabled={photo.enabled}
                    className="bg-white/90 dark:bg-black/90 rounded-full p-0.5"
                  />
                </div>
              </div>
              {/* Title & Tags */}
              <div className="flex-1 min-w-0 mr-4">
                <p className="text-sm font-medium truncate" title={photo.title}>
                  {photo.title}
                </p>
                {photo.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {photo.tags.slice(0, 2).map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="text-xs px-1 py-0 font-normal"
                      >
                        {tag}
                      </Badge>
                    ))}
                    {photo.tags.length > 2 && (
                      <Badge
                        variant="outline"
                        className="text-xs px-1 py-0 font-normal"
                      >
                        +{photo.tags.length - 2}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              {/* Date Taken */}
              <div className="w-32 hidden md:block mr-4 text-sm text-muted-foreground">
                {formatDate(photo.dateTaken)}
              </div>
              {/* Date Added */}
              <div className="w-32 hidden lg:block mr-4 text-sm text-muted-foreground">
                {formatDate(photo.createdAt)}
              </div>
              {/* Location */}
              <div
                className="w-40 hidden md:block mr-4 text-sm text-muted-foreground truncate"
                title={locationString ?? ""}
              >
                {locationString ?? "-"}
              </div>
              {/* Size */}
              <div className="w-24 hidden sm:block mr-4 text-sm text-muted-foreground">
                {formatFileSize(photo.fileSize)}
              </div>
              {/* Pin/Flag Controls */}
              <div className="w-16 flex items-center justify-end gap-1 flex-shrink-0 mr-3">
                <PinFlagControls
                  isPinned={photo.isPinned || false}
                  flagColor={photo.flagColor}
                  onPinToggle={() => onPinToggle(photo)}
                  onFlagToggle={() =>
                    onFlagColorChange(photo, photo.flagColor ? null : "orange")
                  }
                  onFlagColorChange={(color) => onFlagColorChange(photo, color)}
                  size="sm"
                />
                {/* Chat Icon */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChatClick(photo);
                  }}
                  title="Chat about this photo"
                >
                  <MessageSquare className="h-3 w-3 text-gray-400" />
                </Button>
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
                    <DropdownMenuItem onClick={() => openViewDialog(photo)}>
                      <FileText className="mr-2 h-4 w-4" />
                      View Details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEditClick(photo)}>
                      <Edit className="mr-2 h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        window.open(photo.imageUrl, "_blank");
                        toast({
                          title: "Opening Image", // More accurate than "Download Started"
                          description: `Opening ${photo.originalFilename} in a new tab. You can save it from there.`,
                        });
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" /> Download
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDeleteClick(photo)}
                      className="text-red-600 focus:text-red-600"
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

// --- 4. Gallery View ---
interface GalleryViewProps {
  photos: Photo[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (direction: "next" | "prev") => void;
  onNavigateToIndex: (index: number) => void;
  onEdit: (photo: Photo) => void;
  onDelete: (photo: Photo) => void;
}

function GalleryView({
  photos,
  currentIndex,
  onClose,
  onNavigate,
  onEdit,
  onDelete,
  onNavigateToIndex,
}: GalleryViewProps) {
  const currentPhoto = photos[currentIndex];
  if (!currentPhoto) return null; // Should not happen if index is valid

  // Don't load image for failed photos to prevent infinite error loops
  const imgSrc =
    currentPhoto.processingStatus === "failed"
      ? "/placeholder.svg"
      : currentPhoto.imageUrl;

  // Touch/swipe navigation state
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(
    null,
  );

  // Handle touch events for swipe navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
    setTouchEnd(null);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setTouchEnd({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const deltaX = touchStart.x - touchEnd.x;
    const deltaY = touchStart.y - touchEnd.y;

    // Only trigger swipe if horizontal movement is greater than vertical (to avoid conflicts with scrolling)
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      const minSwipeDistance = 50;

      if (deltaX > minSwipeDistance) {
        // Swiped left - go to next photo
        onNavigate("next");
      } else if (deltaX < -minSwipeDistance) {
        // Swiped right - go to previous photo
        onNavigate("prev");
      }
    }

    setTouchStart(null);
    setTouchEnd(null);
  };

  // Simple thumbnail strip logic (can be enhanced)
  const getThumbIndices = () => {
    const total = photos.length;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i);
    const start = Math.max(0, currentIndex - 3);
    const end = Math.min(total, start + 7);
    const indices = Array.from({ length: end - start }, (_, i) => start + i);
    // Adjust if we are near the end
    while (indices.length < 7 && indices[0] > 0) {
      indices.unshift(indices[0] - 1);
    }
    return indices;
  };
  const thumbIndices = getThumbIndices();

  return (
    <div
      className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Close Button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 md:top-4 md:right-4 text-white hover:bg-white/20 hover:text-white z-50 h-10 w-10 md:h-12 md:w-12"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <X className="h-5 w-5 md:h-6 md:w-6" />
      </Button>

      {/* Action Buttons (Edit/Delete) */}
      <div className="absolute top-2 left-2 md:top-4 md:left-4 flex gap-1 md:gap-2 z-50">
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/20 hover:text-white h-10 w-10 md:h-12 md:w-12"
          title="Edit Metadata (Enter)"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(currentPhoto);
          }}
        >
          <Edit className="h-4 w-4 md:h-5 md:w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-red-500/50 hover:text-white h-10 w-10 md:h-12 md:w-12"
          title="Delete Photo (Delete/Backspace)"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(currentPhoto);
          }}
        >
          <Trash2 className="h-4 w-4 md:h-5 md:w-5" />
        </Button>
      </div>

      {/* Main Image Area */}
      <div
        className="relative flex-1 flex items-center justify-center w-full max-h-[calc(100vh-120px)] md:max-h-[calc(100vh-150px)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Prev Button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-1 md:left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 hover:text-white h-10 w-10 md:h-12 md:w-12 rounded-full z-10"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate("prev");
          }}
          title="Previous (Left Arrow)"
        >
          <ChevronLeft className="h-6 w-6 md:h-8 md:w-8" />
        </Button>

        <img
          src={imgSrc}
          alt={currentPhoto.title}
          className="max-w-full max-h-full object-contain block"
          onError={(e) => {
            (e.target as HTMLImageElement).src = "/placeholder.svg";
          }}
        />

        {/* Next Button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 md:right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 hover:text-white h-10 w-10 md:h-12 md:w-12 rounded-full z-10"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate("next");
          }}
          title="Next (Right Arrow or Space)"
        >
          <ChevronRight className="h-6 w-6 md:h-8 md:w-8" />
        </Button>
      </div>

      {/* Info Overlay & Thumbnail Strip */}
      <div
        className="w-full max-w-4xl mt-2 md:mt-4 text-center text-white/80 px-2"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-base md:text-lg font-medium truncate mb-1">
          {currentPhoto.title}
        </p>
        <p className="text-sm mb-2 md:mb-3">
          {currentIndex + 1} of {photos.length}
        </p>

        {/* Thumbnail Strip */}
        {photos.length > 1 && (
          <div className="flex justify-center gap-1 md:gap-2 overflow-x-auto pb-2 md:pb-4">
            {thumbIndices.map((idx) => {
              const thumbPhoto = photos[idx];
              // Don't load image for failed photos to prevent infinite error loops
              const thumbSrc =
                thumbPhoto.processingStatus === "failed"
                  ? "/placeholder.svg"
                  : thumbPhoto.imageUrl;
              return (
                <div
                  key={thumbPhoto.id}
                  className={`w-12 h-12 md:w-16 md:h-16 rounded overflow-hidden cursor-pointer flex-shrink-0 bg-black/50 touch-manipulation ${idx === currentIndex ? "ring-2 ring-white" : "opacity-60 hover:opacity-100"}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigateToIndex(idx); // Call the new prop
                  }}
                >
                  <img
                    src={thumbSrc}
                    alt={`Thumbnail ${idx + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      // Prevent infinite error loops by tracking retry count
                      const retryCount = parseInt(
                        img.dataset.retryCount || "0",
                        10,
                      );
                      if (retryCount < 1) {
                        img.dataset.retryCount = String(retryCount + 1);
                        img.src = "/placeholder.svg";
                      }
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// --- 5. Upload Progress List ---
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
  const showClearButton =
    completedCount > 0 && uploads.length === completedCount;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg">Uploads</CardTitle>
          {showClearButton && (
            <Button variant="ghost" size="sm" onClick={onClearComplete}>
              <X className="h-4 w-4 mr-1" /> Clear Completed
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-3 max-h-60 overflow-y-auto">
        {uploads.map((upload) => (
          <div key={upload.id} className="flex items-center gap-3">
            <div className="flex-shrink-0">
              {upload.status === "pending" && (
                <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
              )}
              {upload.status === "uploading" && (
                <UploadCloud className="h-4 w-4 text-blue-500 animate-pulse" />
              )}
              {upload.status === "success" && (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
              {upload.status === "error" && (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{upload.file.name}</p>
              {upload.status === "uploading" && (
                <Progress value={upload.progress} className="h-1 mt-1" />
              )}
              {upload.status === "error" && (
                <p className="text-xs text-red-600 truncate">{upload.error}</p>
              )}
              {upload.status === "success" && (
                <p className="text-xs text-green-600">Upload complete</p>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatFileSize(upload.file.size)}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
