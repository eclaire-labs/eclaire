
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  Download,
  Edit,
  File as FileIconGeneric, // Renamed generic File icon
  FileText,
  Filter,
  LayoutGrid,
  List,
  Loader2,
  MessageSquare, // Chat icon
  MoreHorizontal,
  Search,
  Trash2,
  UploadCloud, // UI Icons
  X,
  XCircle, // Upload status icons
} from "lucide-react";
import { nanoid } from "nanoid";
import { useRouter } from "@/lib/navigation";
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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose, // Added
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
  DropdownMenuSeparator, // Added
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PinFlagControls } from "@/components/ui/pin-flag-controls";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useDocuments } from "@/hooks/use-documents";
import { useIsMobile } from "@/hooks/use-mobile";
import { useProcessingEvents } from "@/hooks/use-processing-status";
import { useToast } from "@/hooks/use-toast";
import { useViewPreferences } from "@/hooks/use-view-preferences";
import { apiFetch, setFlagColor, togglePin } from "@/lib/frontend-api";
import type { Document } from "@/types/document";

// --- Type Definitions ---

// State for editing document metadata
interface EditDocumentState {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  tags: string[];
}

// Type for tracking uploads (reused from PhotosPage)
interface UploadingFile {
  id: string; // Unique ID for the upload item
  file: File;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
  documentId?: string; // ID of the created document on success
}

// --- Constants ---
const MAX_FILE_SIZE_MB = 50; // Example limit for documents
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
// Define allowed document MIME types (matching backend DOCUMENT_MIMES)
const ALLOWED_UPLOAD_TYPES = {
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    ".pptx",
  ],
  "text/plain": [".txt"],
  "text/rtf": [".rtf"],
  "application/rtf": [".rtf"],
  "text/markdown": [".md"],
  "text/html": [".html", ".htm"],
  "text/csv": [".csv"],
  "application/json": [".json"],
  "application/xml": [".xml"],
  // Apple iWork formats
  "application/vnd.apple.pages": [".pages"],
  "application/vnd.apple.numbers": [".numbers"],
  "application/vnd.apple.keynote": [".keynote"],
};
const ALLOWED_UPLOAD_TYPES_STRING = Object.keys(ALLOWED_UPLOAD_TYPES).join(",");

// --- Helper Functions ---

// Reused formatDate - handles both string dates and number timestamps
const formatDate = (dateInput: string | number | null | undefined): string => {
  if (!dateInput) return "Unknown date";
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return "Invalid Date";
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      // hour: "2-digit", // Optional: Add time if needed
      // minute: "2-digit",
    });
  } catch (error) {
    console.error("Error formatting date:", dateInput, error);
    return String(dateInput); // Fallback
  }
};

// Reused formatFileSize
const formatFileSize = (bytes: number | null | undefined): string => {
  if (bytes === null || bytes === undefined || isNaN(bytes) || bytes < 0)
    return "N/A";
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Number.parseFloat((bytes / k ** i).toFixed(1)) + " " + sizes[i];
};

// Get simplified document type from MIME type
const getDocumentTypeLabel = (mimeType: string | null | undefined): string => {
  if (!mimeType) return "File";
  const lowerMime = mimeType.toLowerCase();
  if (lowerMime.includes("pdf")) return "PDF";
  if (lowerMime.includes("word")) return "Word";
  if (lowerMime.includes("excel") || lowerMime.includes("spreadsheet"))
    return "Excel";
  if (lowerMime.includes("powerpoint") || lowerMime.includes("presentation"))
    return "PowerPoint";
  if (lowerMime.includes("rtf")) return "RTF";
  if (lowerMime.includes("markdown")) return "Markdown";
  if (lowerMime.includes("html")) return "HTML";
  if (lowerMime.includes("csv")) return "CSV";
  if (lowerMime.includes("json")) return "JSON";
  if (lowerMime.includes("xml")) return "XML";
  if (lowerMime.includes("apple.pages")) return "Pages";
  if (lowerMime.includes("apple.numbers")) return "Numbers";
  if (lowerMime.includes("apple.keynote")) return "Keynote";
  if (lowerMime.includes("text")) return "Text";
  if (lowerMime.includes("zip")) return "Archive";
  // Add more specific types or fallbacks
  const parts = lowerMime.split("/");
  return parts[parts.length - 1].toUpperCase() || "File";
};

const getFileIcon = (
  mimeType: string | null | undefined,
  // Add an optional className parameter
  className = "h-10 w-10", // Default size if not provided
): React.ReactElement => {
  const typeLabel = getDocumentTypeLabel(mimeType).toLowerCase();
  // Base color - can still be adjusted if needed, but size comes from className
  const baseColorClass = "text-muted-foreground";

  // Apply the passed className directly
  if (typeLabel === "pdf")
    return <FileText className={`text-red-500 ${className}`} />;
  if (typeLabel === "word")
    return <FileText className={`text-blue-500 ${className}`} />;
  if (typeLabel === "excel")
    return <FileText className={`text-green-500 ${className}`} />;
  if (typeLabel === "powerpoint")
    return <FileText className={`text-orange-500 ${className}`} />;
  if (typeLabel === "rtf")
    return <FileText className={`text-blue-600 ${className}`} />;
  if (typeLabel === "markdown")
    return <FileText className={`text-indigo-500 ${className}`} />;
  if (typeLabel === "html")
    return <FileText className={`text-orange-600 ${className}`} />;
  if (typeLabel === "csv")
    return <FileText className={`text-emerald-500 ${className}`} />;
  if (typeLabel === "json")
    return <FileText className={`text-yellow-600 ${className}`} />;
  if (typeLabel === "xml")
    return <FileText className={`text-teal-500 ${className}`} />;
  if (typeLabel === "pages")
    return <FileText className={`text-blue-400 ${className}`} />;
  if (typeLabel === "numbers")
    return <FileText className={`text-green-400 ${className}`} />;
  if (typeLabel === "keynote")
    return <FileText className={`text-orange-400 ${className}`} />;
  if (typeLabel === "text")
    return <FileText className={`${baseColorClass} ${className}`} />;

  // Default generic icon with the passed className
  return <FileIconGeneric className={`${baseColorClass} ${className}`} />;
};

// Reused getGroupDateLabel - handles both string dates and number timestamps
const getGroupDateLabel = (
  dateInput: string | number | null | undefined,
): string => {
  if (!dateInput) return "Unknown Date";
  try {
    const date = new Date(dateInput);
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
export default function DocumentsPage() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const router = useRouter();

  // --- React Query Hook ---
  const {
    documents,
    isLoading,
    error,
    updateDocument,
    deleteDocument,
    refresh,
    isUpdating,
    isDeleting,
  } = useDocuments();

  // --- Initialize SSE for real-time updates ---
  const { isConnected } = useProcessingEvents();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTag, setFilterTag] = useState("all");
  const [tagInput, setTagInput] = useState("");
  const [isViewDocumentDialogOpen, setIsViewDocumentDialogOpen] =
    useState(false);
  const [isEditDocumentDialogOpen, setIsEditDocumentDialogOpen] =
    useState(false);
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] =
    useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(
    null,
  ); // For view/edit/delete dialogs
  const [editingDocument, setEditingDocument] =
    useState<EditDocumentState | null>(null);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(
    null,
  );
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);

  // Use view preferences hook instead of individual state variables
  const [viewPreferences, updateViewPreference, isPreferencesLoaded] =
    useViewPreferences("documents");
  const { viewMode, sortBy, sortDir } = viewPreferences;
  const [focusedIndex, setFocusedIndex] = useState<number>(-1); // For keyboard nav

  // Mobile filter dialog state
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);

  const docsContainerRef = useRef<HTMLDivElement>(null); // Ref for keyboard nav container

  // SSE is now connected for real-time query invalidation when processing completes

  // --- Error Handling ---
  useEffect(() => {
    if (error) {
      toast({
        title: "Error Loading Documents",
        description:
          error instanceof Error ? error.message : "Failed to load documents",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  // --- Computed Values ---
  const allTags = useMemo(
    () => Array.from(new Set(documents.flatMap((doc) => doc.tags))),
    [documents],
  );

  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const lowerSearch = searchQuery.toLowerCase();
      const matchesSearch =
        doc.title.toLowerCase().includes(lowerSearch) ||
        (doc.description &&
          doc.description.toLowerCase().includes(lowerSearch)) ||
        (doc.originalFilename || "").toLowerCase().includes(lowerSearch) ||
        (doc.extractedText || "").toLowerCase().includes(lowerSearch) || // ADD THIS LINE
        getDocumentTypeLabel(doc.mimeType)
          .toLowerCase()
          .includes(lowerSearch) ||
        doc.tags.some((tag) => tag.toLowerCase().includes(lowerSearch));
      const matchesTag = filterTag === "all" || doc.tags.includes(filterTag);
      return matchesSearch && matchesTag;
    });
  }, [documents, searchQuery, filterTag]);

  const sortedAndFilteredDocuments = useMemo(() => {
    const sorted = [...filteredDocuments].sort((a, b) => {
      let compareResult = 0;

      switch (sortBy) {
        case "title":
          compareResult = a.title
            .toLowerCase()
            .localeCompare(b.title.toLowerCase());
          break;
        case "mimeType": {
          const typeA = getDocumentTypeLabel(a.mimeType).toLowerCase();
          const typeB = getDocumentTypeLabel(b.mimeType).toLowerCase();
          compareResult = typeA.localeCompare(typeB);
          if (compareResult === 0) {
            // Fallback to title if types are same
            compareResult = a.title
              .toLowerCase()
              .localeCompare(b.title.toLowerCase());
          }
          break;
        }
        case "createdAt":
        default: {
          const dateA = new Date(a.createdAt || 0).getTime();
          const dateB = new Date(b.createdAt || 0).getTime();
          // Handle invalid dates gracefully
          compareResult =
            (isNaN(dateA) ? 0 : dateA) - (isNaN(dateB) ? 0 : dateB);
          // Secondary sort by title if dates are identical
          if (compareResult === 0) {
            compareResult = a.title
              .toLowerCase()
              .localeCompare(b.title.toLowerCase());
          }
          break;
        }
      }

      // Apply direction
      const directionMultiplier =
        sortBy === "title" || sortBy === "mimeType"
          ? sortDir === "asc"
            ? 1
            : -1 // Text ascending by default
          : sortDir === "desc"
            ? -1
            : 1; // Dates descending by default

      return compareResult * directionMultiplier;
    });
    return sorted;
  }, [filteredDocuments, sortBy, sortDir]);

  // --- Event Handlers ---

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
    setFocusedIndex(-1);
  };

  const handleTagFilterChange = (value: string) => {
    setFilterTag(value);
    setFocusedIndex(-1);
  };

  const handleSortByChange = (value: string) => {
    const newSortBy = value as "createdAt" | "title" | "mimeType";
    updateViewPreference("sortBy", newSortBy);
    // Sensible default sort directions
    if (newSortBy === "title" || newSortBy === "mimeType") {
      updateViewPreference("sortDir", "asc");
    } else {
      updateViewPreference("sortDir", "desc");
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
      'input[placeholder="Search documents..."]',
    ) as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
    }
  };

  const handleViewModeChange = (value: string) => {
    if (value) {
      // ToggleGroup can return empty string if deselected
      const newMode = value as "tile" | "list";
      updateViewPreference("viewMode", newMode);
      setFocusedIndex(-1);
    }
  };

  // --- Dialog Open/Close Handlers ---

  const openViewDialog = (doc: Document) => {
    // Navigate to the dedicated document page instead of opening modal
    router.push(`/documents/${doc.id}`);
  };

  const openEditDialog = (doc: Document) => {
    // Pre-fill editing state
    setEditingDocument({
      id: doc.id,
      title: doc.title,
      description: doc.description,
      dueDate: doc.dueDate,
      tags: doc.tags,
    });
    setSelectedDocument(doc); // Keep selectedDoc for context if needed
    setIsEditDocumentDialogOpen(true);
  };

  const openConfirmDeleteDialog = (doc: Document) => {
    setDocumentToDelete(doc);
    setIsConfirmDeleteDialogOpen(true);
  };

  // --- Form Input Handlers (Only for Edit Dialog) ---

  const handleEditingDocChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setEditingDocument((prev) =>
      prev
        ? {
            ...prev,
            [name]:
              value === "" && (name === "description" || name === "dueDate")
                ? null
                : value,
          }
        : null,
    );
  };

  const handleEditingDocTagsChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const tags = e.target.value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    setEditingDocument((prev) => (prev ? { ...prev, tags } : null));
  };

  // Handle adding tags to documents
  const handleAddTag = () => {
    if (!tagInput.trim()) return;

    const tag = tagInput.trim().toLowerCase();

    // Add tag to editing document if it doesn't already exist
    if (editingDocument && !editingDocument.tags.includes(tag)) {
      setEditingDocument({
        ...editingDocument,
        tags: [...editingDocument.tags, tag],
      });
    }

    setTagInput("");
  };

  // Handle removing tags
  const handleRemoveTag = (tag: string) => {
    if (editingDocument) {
      setEditingDocument({
        ...editingDocument,
        tags: editingDocument.tags.filter((t) => t !== tag),
      });
    }
  };

  // Handle pin toggle for documents
  const handlePinToggle = async (doc: Document) => {
    const newPinned = !doc.isPinned;

    try {
      const response = await togglePin("documents", doc.id, newPinned);

      if (!response.ok) {
        throw new Error(`Failed to ${newPinned ? "pin" : "unpin"} document`);
      }

      // Refresh data to reflect changes
      refresh();

      toast({
        title: newPinned ? "Document pinned" : "Document unpinned",
        description: `"${doc.title}" has been ${newPinned ? "pinned" : "unpinned"}.`,
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

  // Handle flag color change for documents
  const handleFlagColorChange = async (
    doc: Document,
    color: "red" | "yellow" | "orange" | "green" | "blue" | null,
  ) => {
    const previousColor = doc.flagColor;

    try {
      const response = await setFlagColor("documents", doc.id, color);

      if (!response.ok) {
        throw new Error("Failed to update flag color");
      }

      // Refresh data to reflect changes
      refresh();

      toast({
        title: color ? "Document flagged" : "Flag removed",
        description: color
          ? `"${doc.title}" has been flagged as ${color}.`
          : `Flag removed from "${doc.title}".`,
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

  // --- API Action Handlers (Update, Delete) ---

  const handleUpdateDocument = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingDocument) return;

    try {
      // Prepare only the data that needs updating
      const updateData: Partial<Document> = {
        title: editingDocument.title,
        description: editingDocument.description,
        dueDate: editingDocument.dueDate,
        tags: editingDocument.tags,
      };

      await updateDocument(editingDocument.id, updateData);

      setIsEditDocumentDialogOpen(false);
      setEditingDocument(null); // Clear editing state
      setSelectedDocument(null); // Clear selected state
      toast({
        title: "Document Updated",
        description: `"${editingDocument.title}" updated.`,
      });
    } catch (err) {
      // Error handling is done in the mutation
      console.error("Update document error:", err);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!documentToDelete) return;

    try {
      await deleteDocument(documentToDelete.id);

      setIsConfirmDeleteDialogOpen(false);
      setDocumentToDelete(null); // Clear delete state
      toast({
        title: "Document Deleted",
        description: `"${documentToDelete.title}" deleted.`,
      });
    } catch (err) {
      // Error handling is done in the mutation
      console.error("Delete document error:", err);
    }
  };

  // Handle chat button click
  const handleChatClick = (doc: Document) => {
    // Use the global function to open assistant with pre-attached assets
    if (
      typeof window !== "undefined" &&
      (window as any).openAssistantWithAssets
    ) {
      (window as any).openAssistantWithAssets([
        {
          type: "document",
          id: doc.id,
          title: doc.title,
        },
      ]);
    }
  };

  // --- Upload Handling (Adapted from PhotosPage) ---
  const handleUpload = useCallback(
    async (acceptedFiles: File[]) => {
      const newUploads: UploadingFile[] = acceptedFiles.map((file) => ({
        id: nanoid(),
        file,
        progress: 0,
        status: "pending",
      }));

      setUploadingFiles((prev) => [...newUploads, ...prev]); // Add to the top

      for (const upload of newUploads) {
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

        // Add file content (renamed from documentFile to content)
        formData.append("content", upload.file);

        try {
          // Simulate some progress visually
          setUploadingFiles((prev) =>
            prev.map((f) => (f.id === upload.id ? { ...f, progress: 30 } : f)),
          );

          const response = await apiFetch("/api/documents", {
            method: "POST",
            body: formData,
            headers: {
              // Don't set Content-Type for FormData, let browser handle it
            },
          });

          // Simulate more progress
          setUploadingFiles((prev) =>
            prev.map((f) => (f.id === upload.id ? { ...f, progress: 70 } : f)),
          );

          if (!response.ok) {
            const errorData = await response
              .json()
              .catch(() => ({ error: `Upload failed (${response.status})` }));
            throw new Error(
              errorData.error || `Failed to upload ${upload.file.name}`,
            );
          }

          const createdDocument = (await response.json()) as Document;

          // Refresh the documents list to show the new upload
          refresh();

          // Update upload status to success
          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.id === upload.id
                ? {
                    ...f,
                    status: "success",
                    progress: 100,
                    documentId: createdDocument.id,
                  }
                : f,
            ),
          );

          toast({
            title: "Upload Successful",
            description: `"${createdDocument.title}" added.`,
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
    noClick: true, // We'll trigger this manually via button/label
    noKeyboard: true,
    onDropRejected: (fileRejections) => {
      fileRejections.forEach(({ file, errors }) => {
        errors.forEach((error) => {
          let message = error.message;
          if (error.code === "file-too-large") {
            message = `File is larger than ${MAX_FILE_SIZE_MB} MB`;
          } else if (error.code === "file-invalid-type") {
            message = `Invalid file type. Allowed types: ${Object.values(ALLOWED_UPLOAD_TYPES).flat().join(", ")}`;
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
      const items = sortedAndFilteredDocuments;
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
        return; // Allow default behavior in inputs/selects
      }

      let newIndex = focusedIndex;
      // Estimate items per row for tile view (adjust based on your grid classes)
      const itemsPerRow =
        viewMode === "tile"
          ? Number.parseInt(
              getComputedStyle(docsContainerRef.current!)
                .gridTemplateColumns.split(" ")
                .length.toString(),
            ) || 3
          : 1;

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
          if (focusedIndex < 0)
            newIndex = 0; // Start at first item if none focused
          else newIndex = Math.min(items.length - 1, focusedIndex + 1);
          break;
        case "ArrowLeft":
          event.preventDefault();
          if (focusedIndex < 0)
            newIndex = 0; // Start at first item if none focused
          else newIndex = Math.max(0, focusedIndex - 1);
          break;
        case "Enter":
        case " ": // Space key
          if (focusedIndex >= 0 && focusedIndex < items.length) {
            event.preventDefault();
            openViewDialog(items[focusedIndex]); // Navigate to document page on Enter/Space
          }
          break;
        case "e": // 'e' for Edit
          if (
            !isInputFocused &&
            focusedIndex >= 0 &&
            focusedIndex < items.length
          ) {
            event.preventDefault();
            openEditDialog(items[focusedIndex]);
          }
          break;
        case "Delete": // Delete key
        case "Backspace":
          if (
            !isInputFocused &&
            focusedIndex >= 0 &&
            focusedIndex < items.length
          ) {
            event.preventDefault();
            openConfirmDeleteDialog(items[focusedIndex]);
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
          (event.target as HTMLElement).blur(); // Remove focus from container
          break;
        default:
          return; // Don't interfere with other keys
      }

      if (newIndex !== focusedIndex && newIndex >= 0) {
        setFocusedIndex(newIndex);
        // Focus the item visually
        const itemElement = docsContainerRef.current?.querySelector(
          `[data-index="${newIndex}"]`,
        ) as HTMLElement;
        itemElement?.focus();
      } else if (newIndex === -1) {
        // If escape was pressed or index became invalid, remove focus
        setFocusedIndex(-1);
        (event.target as HTMLElement).blur();
      }
    },
    [
      focusedIndex,
      sortedAndFilteredDocuments,
      viewMode,
      openViewDialog,
      openEditDialog,
      openConfirmDeleteDialog,
    ],
  );

  // --- Render Logic ---

  const renderContent = () => {
    if (isLoading && documents.length === 0) {
      return (
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-medium mb-2">Loading Documents...</h2>
          </div>
        </div>
      );
    }

    if (error && documents.length === 0) {
      return (
        <div className="container mx-auto py-10 text-center">
          <Alert variant="destructive" className="max-w-md mx-auto">
            <AlertTitle>Error Loading Documents</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
          <Button onClick={refresh} className="mt-6">
            Try Again
          </Button>
        </div>
      );
    }

    // Note: No Gallery View for documents

    if (
      sortedAndFilteredDocuments.length === 0 &&
      uploadingFiles.length === 0 &&
      !isLoading
    ) {
      return (
        <div className="text-center py-16 text-muted-foreground">
          <FileIconGeneric className="h-16 w-16 mx-auto mb-4 text-gray-400" />
          <p className="mb-4">
            {documents.length === 0
              ? "Your document collection is empty."
              : "No documents found matching your criteria."}
          </p>
          {documents.length === 0 && (
            <p>Drag and drop documents here or use the upload button.</p>
          )}
        </div>
      );
    }

    // Conditionally render Tile or List view
    return (
      <div
        ref={docsContainerRef}
        onKeyDown={handleKeyDown} // Attach keydown listener here
        tabIndex={0} // Make the container focusable
        className="outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md" // Show focus outline on container when navigated to
      >
        {viewMode === "tile" && (
          <TileView
            documents={sortedAndFilteredDocuments}
            focusedIndex={focusedIndex}
            sortBy={sortBy}
            onDocumentClick={openViewDialog}
            onEditClick={openEditDialog}
            onDeleteClick={openConfirmDeleteDialog}
            onPinToggle={handlePinToggle}
            onFlagColorChange={handleFlagColorChange}
            onChatClick={handleChatClick}
          />
        )}
        {viewMode === "list" && (
          <ListView
            documents={sortedAndFilteredDocuments}
            focusedIndex={focusedIndex}
            onDocumentClick={openViewDialog}
            onEditClick={openEditDialog}
            onDeleteClick={openConfirmDeleteDialog}
            onPinToggle={handlePinToggle}
            onFlagColorChange={handleFlagColorChange}
            onChatClick={handleChatClick}
          />
        )}
      </div>
    );
  };

  // Helper function to count active filters for Documents
  const getActiveFilterCount = () => {
    let count = 0;
    if (filterTag !== "all") count++;
    return count;
  };

  // Helper function to clear all filters for Documents
  const clearAllFilters = () => {
    setFilterTag("all");
  };

  // FilterSortDialog component for Documents
  const FilterSortDialog = () => (
    <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Filter & Sort Documents</DialogTitle>
          <DialogDescription>
            Customize how you view and organize your documents.
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
                  {allTags.map((tag: string) => (
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
                  <SelectItem value="mimeType">Type</SelectItem>
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
      {/* The root div is now just for the dropzone functionality and relative positioning.
       The `space-y-6` class has been removed from here. */}
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
              <p className="text-xl font-semibold">Drop documents to upload</p>
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
                  Documents
                  {documents.length > 0 && (
                    <span className="ml-2 text-sm md:text-base font-normal text-muted-foreground">
                      {sortedAndFilteredDocuments.length === documents.length
                        ? `(${documents.length})`
                        : `(${sortedAndFilteredDocuments.length} of ${documents.length})`}
                    </span>
                  )}
                </h1>
              </div>
            </div>
            {/* Button to trigger the file dialog */}
            <Button onClick={openFileDialog}>
              <UploadCloud className="mr-2 h-4 w-4" />
              Upload Documents
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
                  placeholder="Search documents..."
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
                title="Filter and sort documents"
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
                  <SelectItem value="createdAt">Date Added</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="mimeType">Type</SelectItem>
                  {/* Add other relevant sort options if needed */}
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
                {/* No Gallery view button */}
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

          {/* Error Indicators (Inline if content already exists) */}
          {error && documents.length > 0 && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Update Error</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}

          {/* Main Content Area (Tiles or List) */}
          {renderContent()}
        </div>

        {/* --- Dialogs --- */}

        {/* View Document Details Dialog */}
        <Dialog
          open={isViewDocumentDialogOpen}
          onOpenChange={setIsViewDocumentDialogOpen}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="truncate">
                {selectedDocument?.title ?? "Document Details"}
              </DialogTitle>
              <DialogDescription>
                Added on{" "}
                {selectedDocument
                  ? formatDate(selectedDocument.createdAt)
                  : "N/A"}
              </DialogDescription>
            </DialogHeader>
            {selectedDocument && (
              <div className="space-y-6 py-4 max-h-[70vh] overflow-y-auto pr-2">
                {/* Thumbnail Preview */}
                {selectedDocument.thumbnailUrl && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground font-medium">
                      Preview
                    </Label>
                    <div className="border rounded-lg overflow-hidden bg-muted/30">
                      <img
                        src={selectedDocument.thumbnailUrl}
                        alt={`Preview of ${selectedDocument.title}`}
                        className="w-full h-auto max-h-48 object-contain"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = "none";
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Basic Info */}
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground font-medium">
                      Description
                    </Label>
                    <p className="mt-0.5">
                      {selectedDocument.description || (
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
                    {selectedDocument.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {selectedDocument.tags.map((tag) => (
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
                </div>

                {/* File Details */}
                <h3 className="font-semibold mb-2 border-b pb-1 text-base">
                  File Information
                </h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground font-medium">
                      Original Filename
                    </Label>
                    <p className="mt-0.5 truncate">
                      {selectedDocument.originalFilename}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground font-medium">
                      Document Type
                    </Label>
                    <p className="mt-0.5">
                      {getDocumentTypeLabel(selectedDocument.mimeType)}{" "}
                      <span className="text-xs text-muted-foreground">
                        ({selectedDocument.mimeType})
                      </span>
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground font-medium">
                      File Size
                    </Label>
                    <p className="mt-0.5">
                      {formatFileSize(selectedDocument.fileSize)}
                    </p>
                  </div>
                </div>

                {/* Timestamps */}
                <h3 className="font-semibold mb-2 border-b pb-1 pt-3 text-base">
                  Timestamps
                </h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground font-medium">
                      Date Added
                    </Label>
                    <p className="mt-0.5">
                      {formatDate(selectedDocument.createdAt)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground font-medium">
                      Last Updated
                    </Label>
                    <p className="mt-0.5">
                      {formatDate(selectedDocument.updatedAt)}
                    </p>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter className="sm:justify-between gap-2 pt-4 border-t mt-2">
              {/* Actions */}
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setIsViewDocumentDialogOpen(false);
                  if (selectedDocument)
                    openConfirmDeleteDialog(selectedDocument);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
              <div className="flex gap-2">
                {/* Download Original File */}
                {selectedDocument?.fileUrl && (
                  <Button asChild variant="secondary" size="sm">
                    <a
                      href={selectedDocument.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={selectedDocument.originalFilename}
                    >
                      <Download className="mr-2 h-4 w-4" /> Download
                    </a>
                  </Button>
                )}

                {/* View PDF if available */}
                {selectedDocument?.pdfUrl && (
                  <Button asChild variant="secondary" size="sm">
                    <a
                      href={selectedDocument.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FileText className="mr-2 h-4 w-4" /> View PDF
                    </a>
                  </Button>
                )}

                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    setIsViewDocumentDialogOpen(false);
                    if (selectedDocument) openEditDialog(selectedDocument);
                  }}
                >
                  <Edit className="mr-2 h-4 w-4" /> Edit Details
                </Button>
                <DialogClose asChild>
                  <Button variant="outline" size="sm">
                    Close
                  </Button>
                </DialogClose>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Document Metadata Dialog */}
        <Dialog
          open={isEditDocumentDialogOpen}
          onOpenChange={setIsEditDocumentDialogOpen}
        >
          <DialogContent className="sm:max-w-lg">
            <form onSubmit={handleUpdateDocument}>
              <DialogHeader>
                <DialogTitle>Edit Document Details</DialogTitle>
                <DialogDescription>
                  Make changes to the details of "
                  {editingDocument?.title ?? selectedDocument?.title}". The file
                  content cannot be changed here.
                </DialogDescription>
              </DialogHeader>
              {editingDocument && ( // Use editingDocument state for controlled inputs
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-title">
                      Title <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="edit-title"
                      name="title"
                      value={editingDocument.title}
                      onChange={handleEditingDocChange}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-description">Description</Label>
                    <Textarea
                      id="edit-description"
                      name="description"
                      rows={3}
                      value={editingDocument.description ?? ""}
                      onChange={handleEditingDocChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-due-date">Due Date</Label>
                    <Input
                      id="edit-due-date"
                      name="dueDate"
                      type="date"
                      value={
                        editingDocument.dueDate
                          ? editingDocument.dueDate.split("T")[0]
                          : ""
                      }
                      onChange={handleEditingDocChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tags</Label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {editingDocument.tags.map((tag) => (
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
                  {/* Display non-editable info */}
                  <div className="space-y-2 pt-2 border-t mt-4">
                    <Label className="text-xs text-muted-foreground font-medium">
                      Original Filename
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {selectedDocument?.originalFilename}
                    </p>
                    <Label className="text-xs text-muted-foreground font-medium">
                      File Type / Size
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {getDocumentTypeLabel(selectedDocument?.mimeType)} (
                      {formatFileSize(selectedDocument?.fileSize)})
                    </p>
                  </div>
                </div>
              )}
              <DialogFooter>
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingDocument(null);
                      setSelectedDocument(null);
                    }}
                  >
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  disabled={isUpdating || !editingDocument?.title}
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

        {/* Confirm Delete Dialog (Similar to PhotosPage) */}
        <Dialog
          open={isConfirmDeleteDialogOpen}
          onOpenChange={setIsConfirmDeleteDialogOpen}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm Deletion</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete the document "
                {documentToDelete?.title}"? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {documentToDelete && (
              <div className="my-4 flex items-center gap-3 p-3 border rounded-md bg-muted/50">
                {getFileIcon(documentToDelete.mimeType)}
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {documentToDelete.title}
                  </p>
                  <p className="text-sm text-muted-foreground truncate">
                    {documentToDelete.originalFilename}
                  </p>
                </div>
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
                Delete Document
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Filter & Sort Dialog */}
        <FilterSortDialog />
      </div>{" "}
    </TooltipProvider>
  );
}

// --- Child Components for Views ---

// --- 1. Tile View for Documents ---
interface TileViewProps {
  documents: Document[];
  focusedIndex: number;
  sortBy: string;
  onDocumentClick: (doc: Document) => void;
  onEditClick: (doc: Document) => void;
  onDeleteClick: (doc: Document) => void;
  onPinToggle: (doc: Document) => void;
  onFlagColorChange: (
    doc: Document,
    color: "red" | "yellow" | "orange" | "green" | "blue" | null,
  ) => void;
  onChatClick: (doc: Document) => void;
}

function TileView({
  documents,
  focusedIndex,
  sortBy,
  onDocumentClick,
  onEditClick,
  onDeleteClick,
  onPinToggle,
  onFlagColorChange,
  onChatClick,
}: TileViewProps) {
  let lastGroupLabel = "";

  // Grouping only makes sense for 'createdAt' sort
  const isGrouped = sortBy === "createdAt";

  return (
    // Adjust grid columns as needed
    <div className="grid gap-4 md:gap-5 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {documents.map((doc, index) => {
        const currentGroupLabel = isGrouped
          ? getGroupDateLabel(doc.createdAt)
          : "";
        const showGroupHeader =
          isGrouped && currentGroupLabel !== lastGroupLabel;
        if (showGroupHeader) {
          lastGroupLabel = currentGroupLabel;
        }

        return (
          <React.Fragment key={doc.id}>
            {showGroupHeader && (
              <h2 className="col-span-full text-lg font-semibold mt-6 mb-2 pl-1 border-b pb-1">
                {currentGroupLabel}
              </h2>
            )}
            <DocumentTileItem
              document={doc}
              index={index}
              isFocused={index === focusedIndex}
              onClick={() => onDocumentClick(doc)} // Click navigates to document page
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

// --- 2. Document Tile Item ---
interface DocumentTileItemProps {
  document: Document;
  index: number;
  isFocused: boolean;
  onClick: () => void;
  onEditClick: (doc: Document) => void;
  onDeleteClick: (doc: Document) => void;
  onPinToggle: (doc: Document) => void;
  onFlagColorChange: (
    doc: Document,
    color: "red" | "yellow" | "orange" | "green" | "blue" | null,
  ) => void;
  onChatClick: (doc: Document) => void;
}

function DocumentTileItem({
  document: doc,
  index,
  isFocused,
  onClick,
  onEditClick,
  onDeleteClick,
  onPinToggle,
  onFlagColorChange,
  onChatClick,
}: DocumentTileItemProps) {
  const { toast } = useToast(); // Needed for download toast
  const docTypeLabel = getDocumentTypeLabel(doc.mimeType);

  return (
    <Card
      data-index={index} // For keyboard navigation targeting
      tabIndex={-1} // Make it programmatically focusable but not via Tab key
      className={`group cursor-pointer overflow-hidden transition-all duration-200 ease-in-out hover:shadow-lg flex flex-col bg-card outline-none relative ${isFocused ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""}`}
      onClick={onClick}
      onDoubleClick={() => onEditClick(doc)} // Double click to edit
    >
      {/* Thumbnail Section */}
      {doc.thumbnailUrl ? (
        <div className="aspect-[4/3] bg-muted/30 overflow-hidden relative">
          <img
            src={doc.thumbnailUrl}
            alt={`Thumbnail for ${doc.title}`}
            className="w-full h-full object-contain transition-transform group-hover:scale-105"
            onError={(e) => {
              // Fallback to icon if thumbnail fails to load
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
              const iconContainer = target.nextElementSibling as HTMLElement;
              if (iconContainer) {
                iconContainer.style.display = "flex";
              }
            }}
          />
          {/* Fallback icon container */}
          <div className="hidden w-full h-full items-center justify-center bg-muted/50">
            {getFileIcon(doc.mimeType, "h-12 w-12")}
          </div>
          {/* Processing Status Icon */}
          <div className="absolute top-2 left-2">
            <SimpleProcessingStatusIcon
              status={doc.processingStatus}
              enabled={doc.enabled}
              className="bg-white/90 dark:bg-black/90 rounded-full p-1"
            />
          </div>
        </div>
      ) : (
        <div className="aspect-[4/3] bg-muted/30 flex items-center justify-center relative">
          {getFileIcon(doc.mimeType, "h-12 w-12")}
          {/* Processing Status Icon */}
          <div className="absolute top-2 left-2">
            <SimpleProcessingStatusIcon
              status={doc.processingStatus}
              enabled={doc.enabled}
              className="bg-white/90 dark:bg-black/90 rounded-full p-1"
            />
          </div>
        </div>
      )}

      {/* Content */}
      <CardHeader className="flex flex-row items-center gap-3 p-4 pb-2">
        {/* Title & Meta */}
        <div className="flex-1 overflow-hidden">
          <CardTitle
            className="text-sm font-semibold line-clamp-1"
            title={doc.title}
          >
            {doc.title}
          </CardTitle>
          <CardDescription
            className="text-xs text-muted-foreground mt-0.5"
            title={`Type: ${docTypeLabel}, Size: ${formatFileSize(doc.fileSize)}`}
          >
            {docTypeLabel} • {formatFileSize(doc.fileSize)}
          </CardDescription>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <PinFlagControls
            isPinned={doc.isPinned || false}
            flagColor={doc.flagColor}
            onPinToggle={() => onPinToggle(doc)}
            onFlagToggle={() =>
              onFlagColorChange(doc, doc.flagColor ? null : "orange")
            }
            onFlagColorChange={(color) => onFlagColorChange(doc, color)}
            size="sm"
          />
          {/* Chat Icon */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onChatClick(doc);
            }}
            title="Chat about this document"
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
              <DropdownMenuItem onClick={() => onClick()}>
                <FileText className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEditClick(doc)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              {doc.fileUrl && (
                <DropdownMenuItem asChild>
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={doc.originalFilename}
                    onClick={() =>
                      toast({
                        title: "Download Started",
                        description: `Downloading ${doc.originalFilename}`,
                      })
                    }
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDeleteClick(doc)}
                className="text-red-500"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-1 space-y-1.5 flex-grow">
        {/* Description */}
        {doc.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {doc.description}
          </p>
        )}
        {/* Date Added */}
        <div
          className="text-xs flex items-center gap-1 text-muted-foreground"
          title={`Added: ${formatDate(doc.createdAt)}`}
        >
          <CalendarDays className="h-3 w-3 flex-shrink-0" />
          <span>{formatDate(doc.createdAt)}</span>
        </div>
        {/* Tags */}
        {doc.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {doc.tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs px-1.5 py-0.5 font-normal"
              >
                {tag}
              </Badge>
            ))}
            {doc.tags.length > 3 && (
              <Badge
                variant="outline"
                className="text-xs px-1.5 py-0.5 font-normal"
              >
                +{doc.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
        {!doc.description && doc.tags.length === 0 && (
          <p className="text-xs italic text-muted-foreground/60 pt-1">
            No description or tags.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// --- 3. List View for Documents ---
interface ListViewProps {
  documents: Document[];
  focusedIndex: number;
  onDocumentClick: (doc: Document) => void;
  onEditClick: (doc: Document) => void;
  onDeleteClick: (doc: Document) => void;
  onPinToggle: (doc: Document) => void;
  onFlagColorChange: (
    doc: Document,
    color: "red" | "yellow" | "orange" | "green" | "blue" | null,
  ) => void;
  onChatClick: (doc: Document) => void;
}

function ListView({
  documents,
  focusedIndex,
  onDocumentClick,
  onEditClick,
  onDeleteClick,
  onPinToggle,
  onFlagColorChange,
  onChatClick,
}: ListViewProps) {
  const { toast } = useToast(); // For download toast

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="divide-y divide-border">
        {/* Header Row */}
        <div className="flex items-center px-4 py-2 bg-muted/50 text-sm font-medium text-muted-foreground">
          <div className="w-10 flex-shrink-0 mr-3"></div> {/* Icon space */}
          <div className="flex-1 min-w-0 mr-4">Title</div>
          <div className="w-32 hidden md:block mr-4">Date Added</div>
          <div className="w-28 hidden sm:block mr-4">Type</div>
          <div className="w-24 hidden sm:block mr-4">Size</div>
          <div className="w-40 hidden lg:block mr-4">Tags</div>
          <div className="w-20 flex-shrink-0 mr-3">Actions</div>
        </div>

        {/* Data Rows */}
        {documents.map((doc, index) => {
          const docTypeLabel = getDocumentTypeLabel(doc.mimeType);
          const isFocused = index === focusedIndex;

          return (
            <div
              key={doc.id}
              data-index={index} // For keyboard navigation targeting
              tabIndex={-1} // Make it programmatically focusable
              className={`flex items-center px-4 py-2.5 hover:bg-muted/50 cursor-pointer outline-none ${isFocused ? "ring-2 ring-ring ring-offset-0 bg-muted/50" : ""}`} // Offset 0 for list view looks better
              onClick={() => onDocumentClick(doc)}
              onDoubleClick={() => onEditClick(doc)}
            >
              {/* Icon/Thumbnail */}
              <div className="w-10 flex-shrink-0 mr-3 flex items-center justify-center">
                {doc.thumbnailUrl ? (
                  <div className="relative w-8 h-8">
                    <img
                      src={doc.thumbnailUrl}
                      alt={`Thumbnail for ${doc.title}`}
                      className="w-8 h-8 object-cover rounded border"
                      onError={(e) => {
                        // Fallback to icon if thumbnail fails to load
                        const target = e.target as HTMLImageElement;
                        target.style.display = "none";
                        const iconContainer =
                          target.nextElementSibling as HTMLElement;
                        if (iconContainer) {
                          iconContainer.style.display = "block";
                        }
                      }}
                    />
                    <div className="hidden">
                      {getFileIcon(doc.mimeType, "h-8 w-8")}
                    </div>
                    {/* Processing Status Icon */}
                    <div className="absolute top-0 right-0">
                      <SimpleProcessingStatusIcon
                        status={doc.processingStatus}
                        enabled={doc.enabled}
                        className="bg-white/90 dark:bg-black/90 rounded-full p-0.5"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    {getFileIcon(doc.mimeType, "h-8 w-8")}
                    {/* Processing Status Icon */}
                    <div className="absolute -top-1 -right-1">
                      <SimpleProcessingStatusIcon
                        status={doc.processingStatus}
                        enabled={doc.enabled}
                        className="bg-white/90 dark:bg-black/90 rounded-full p-0.5"
                      />
                    </div>
                  </div>
                )}
              </div>
              {/* Title & Description (Tooltip?) */}
              <div className="flex-1 min-w-0 mr-4">
                <p className="text-sm font-medium truncate" title={doc.title}>
                  {doc.title}
                </p>
                {doc.description && (
                  <p
                    className="text-xs text-muted-foreground truncate"
                    title={doc.description}
                  >
                    {doc.description}
                  </p>
                )}
              </div>
              {/* Date Added */}
              <div className="w-32 hidden md:block mr-4 text-sm text-muted-foreground">
                {formatDate(doc.createdAt)}
              </div>
              {/* Type */}
              <div
                className="w-28 hidden sm:block mr-4 text-sm text-muted-foreground"
                title={doc.mimeType || undefined}
              >
                {docTypeLabel}
              </div>
              {/* Size */}
              <div className="w-24 hidden sm:block mr-4 text-sm text-muted-foreground">
                {formatFileSize(doc.fileSize)}
              </div>
              {/* Tags */}
              <div className="w-40 hidden lg:flex flex-wrap gap-1 items-center mr-4">
                {doc.tags.slice(0, 2).map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-xs px-1 py-0 font-normal"
                  >
                    {tag}
                  </Badge>
                ))}
                {doc.tags.length > 2 && (
                  <Badge
                    variant="outline"
                    className="text-xs px-1 py-0 font-normal"
                  >
                    +{doc.tags.length - 2}
                  </Badge>
                )}
                {doc.tags.length === 0 && (
                  <span className="text-xs text-muted-foreground italic">
                    No tags
                  </span>
                )}
              </div>
              {/* Pin/Flag Controls & Actions */}
              <div className="w-20 flex items-center justify-end gap-1 flex-shrink-0 mr-3">
                <PinFlagControls
                  isPinned={doc.isPinned || false}
                  flagColor={doc.flagColor}
                  onPinToggle={() => onPinToggle(doc)}
                  onFlagToggle={() =>
                    onFlagColorChange(doc, doc.flagColor ? null : "orange")
                  }
                  onFlagColorChange={(color) => onFlagColorChange(doc, color)}
                  size="sm"
                />
                {/* Chat Icon */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChatClick(doc);
                  }}
                  title="Chat about this document"
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
                    <DropdownMenuItem onClick={() => onDocumentClick(doc)}>
                      <FileText className="mr-2 h-4 w-4" /> View Details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEditClick(doc)}>
                      <Edit className="mr-2 h-4 w-4" /> Edit Details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onChatClick(doc)}>
                      <MessageSquare className="mr-2 h-4 w-4" /> Chat with AI
                    </DropdownMenuItem>
                    {doc.fileUrl && (
                      <DropdownMenuItem asChild>
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          {...(doc.originalFilename && {
                            download: doc.originalFilename as string,
                          })}
                          onClick={() => toast({ title: "Download Started" })}
                        >
                          <Download className="mr-2 h-4 w-4" /> Download File
                        </a>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDeleteClick(doc)}
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

// --- 4. Upload Progress List (Can reuse from PhotosPage, maybe minor text changes) ---
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
  // Show clear button only if there are *any* completed uploads
  const showClearButton = completedCount > 0;
  // Optional: Calculate overall progress
  // const totalProgress = uploads.reduce((sum, u) => sum + u.progress, 0) / uploads.length;

  return (
    <Card className="mb-4 shadow-sm">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex justify-between items-center">
          <CardTitle className="text-base font-semibold">Uploads</CardTitle>
          {showClearButton && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={onClearComplete}
            >
              <X className="h-3.5 w-3.5 mr-1" /> Clear Completed
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-3 max-h-60 overflow-y-auto">
        {uploads.map((upload) => (
          <div
            key={upload.id}
            className={`flex items-center gap-3 p-2 rounded-md transition-opacity ${upload.status === "success" || upload.status === "error" ? "opacity-70" : ""}`}
          >
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
              <p
                className="text-sm font-medium truncate"
                title={upload.file.name}
              >
                {upload.file.name}
              </p>
              {(upload.status === "pending" ||
                upload.status === "uploading") && (
                <Progress value={upload.progress} className="h-1 mt-1" />
              )}
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
              {formatFileSize(upload.file.size)}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
