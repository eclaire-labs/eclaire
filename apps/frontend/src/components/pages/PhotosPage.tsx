import { useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  Camera,
  GalleryHorizontalEnd,
  LayoutGrid,
  List,
  Loader2,
  UploadCloud,
} from "lucide-react";
import { nanoid } from "nanoid";
import type React from "react";
import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import type { ViewModeDef } from "@/components/list-page";
import { GroupedItemList, ListPageLayout } from "@/components/list-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useListKeyboardNavigation } from "@/hooks/use-list-keyboard-navigation";
import { useListPageState } from "@/hooks/use-list-page-state";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePhotos } from "@/hooks/use-photos";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/frontend-api";
import { formatDate } from "@/lib/list-page-utils";
import type { EditPhotoState, Photo, UploadingFile } from "@/types/photo";
import { PhotoGalleryView } from "./photos/PhotoGalleryView";
import { PhotoListItem } from "./photos/PhotoListItem";
import { PhotoTileItem } from "./photos/PhotoTileItem";
import {
  formatDimensions,
  formatExposureTime,
  formatFileSize,
  formatFNumber,
  formatLocation,
} from "./photos/photo-utils";
import { photosConfig } from "./photos/photos-config";

// ---------------------------------------------------------------------------
// Upload constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE_MB = 25;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
  "image/avif": [".avif"],
  "image/svg+xml": [".svg"],
  "image/tiff": [".tiff", ".tif"],
  "image/bmp": [".bmp"],
};

// ---------------------------------------------------------------------------
// View mode definitions (Photos has 3 modes: tile, list, gallery)
// ---------------------------------------------------------------------------

const photosViewModes: ViewModeDef[] = [
  { value: "tile", label: "Tiles", icon: LayoutGrid },
  { value: "list", label: "List", icon: List },
  { value: "gallery", label: "Gallery", icon: GalleryHorizontalEnd },
];

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function PhotosPage() {
  const _isMobile = useIsMobile();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Data
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

  // Shared list page state
  const state = useListPageState(photos, photosConfig, {
    refresh,
    deleteItem: deletePhoto,
  });

  // Page-specific state
  const [isViewPhotoDialogOpen, setIsViewPhotoDialogOpen] = useState(false);
  const [isEditPhotoDialogOpen, setIsEditPhotoDialogOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [editingPhoto, setEditingPhoto] = useState<EditPhotoState | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);

  const containerRef = useRef<HTMLElement | null>(null);

  // Keyboard navigation (not for gallery -- gallery handles its own)
  const { handleKeyDown } = useListKeyboardNavigation(
    state.focusedIndex,
    state.setFocusedIndex,
    containerRef,
    {
      itemCount: state.sortedItems.length,
      viewMode: state.viewMode,
      onSelect: (idx) => {
        const item = state.sortedItems[idx];
        if (item) handlePhotoClick(item);
      },
      onEdit: (idx) => {
        const item = state.sortedItems[idx];
        if (item) openEditDialog(item);
      },
      onDelete: (idx) => {
        const item = state.sortedItems[idx];
        if (item) state.openDeleteDialog(item.id, item.title);
      },
    },
  );

  // Navigation
  const handlePhotoClick = useCallback(
    (photo: Photo) => {
      navigate({ to: `/photos/${photo.id}` });
    },
    [navigate],
  );

  const openEditDialog = useCallback((photo: Photo) => {
    setEditingPhoto({
      id: photo.id,
      title: photo.title,
      description: photo.description,
      tags: photo.tags,
      deviceId: photo.deviceId,
    });
    setIsEditPhotoDialogOpen(true);
  }, []);

  // Gallery helpers
  const openGalleryView = useCallback(
    (index: number) => {
      if (index >= 0 && index < state.sortedItems.length) {
        setGalleryIndex(index);
        state.handleViewModeChange("gallery");
      }
    },
    [state],
  );

  const closeGalleryView = useCallback(() => {
    setGalleryIndex(null);
    state.handleViewModeChange("tile");
  }, [state]);

  const navigateGallery = useCallback(
    (direction: "next" | "prev") => {
      if (galleryIndex === null) return;
      const total = state.sortedItems.length;
      let nextIndex: number;
      if (direction === "next") {
        nextIndex = (galleryIndex + 1) % total;
      } else {
        nextIndex = (galleryIndex - 1 + total) % total;
      }
      setGalleryIndex(nextIndex);
    },
    [galleryIndex, state.sortedItems.length],
  );

  // Override view mode change to handle gallery-specific logic
  const handleViewModeChange = useCallback(
    (value: string) => {
      if (!value) return;
      if (value === "gallery" && state.sortedItems.length > 0) {
        openGalleryView(0);
      } else {
        if (value !== "gallery") {
          setGalleryIndex(null);
        }
        state.handleViewModeChange(value);
      }
    },
    [state, openGalleryView],
  );

  // Wrap state with overridden handleViewModeChange for ListPageLayout
  const stateWithGallery = {
    ...state,
    handleViewModeChange,
  };

  // --- Form Input Handlers (Edit Dialog) ---

  const handleEditingPhotoChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setEditingPhoto((prev) =>
      prev ? { ...prev, [name]: value === null ? null : value } : null,
    );
  };

  const handleAddTag = () => {
    if (!tagInput.trim()) return;
    const tag = tagInput.trim().toLowerCase();
    if (editingPhoto && !editingPhoto.tags.includes(tag)) {
      setEditingPhoto({
        ...editingPhoto,
        tags: [...editingPhoto.tags, tag],
      });
    }
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    if (editingPhoto) {
      setEditingPhoto({
        ...editingPhoto,
        tags: editingPhoto.tags.filter((t) => t !== tag),
      });
    }
  };

  // --- API Action Handlers ---

  const handleUpdatePhoto = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingPhoto) return;

    try {
      const updateData: Partial<Photo> = {
        title: editingPhoto.title,
        description: editingPhoto.description,
        tags: editingPhoto.tags,
        deviceId: editingPhoto.deviceId,
      };

      await updatePhoto(editingPhoto.id, updateData);

      setIsEditPhotoDialogOpen(false);
      setEditingPhoto(null);
      setSelectedPhoto(null);
      toast({
        title: "Photo Updated",
        description: `"${editingPhoto.title}" updated.`,
      });
    } catch (err) {
      console.error("Update photo error:", err);
    }
  };

  // --- Upload Handling ---
  const handleUpload = useCallback(
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
        const metadata = {
          title: upload.file.name.replace(/\.[^/.]+$/, ""),
          description: "",
          tags: [],
          originalFilename: upload.file.name,
        };
        formData.append("metadata", JSON.stringify(metadata));
        formData.append("content", upload.file);

        try {
          setUploadingFiles((prev) =>
            prev.map((f) => (f.id === upload.id ? { ...f, progress: 50 } : f)),
          );

          const response = await apiFetch("/api/photos", {
            method: "POST",
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
          refresh();

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
    [toast, refresh],
  );

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject,
    open: openFileDialog,
  } = useDropzone({
    onDrop: handleUpload,
    accept: ALLOWED_UPLOAD_TYPES,
    maxSize: MAX_FILE_SIZE_BYTES,
    multiple: true,
    noClick: true,
    noKeyboard: true,
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

  // Render item for GroupedItemList
  const renderTileItem = useCallback(
    (photo: Photo, index: number) => (
      <PhotoTileItem
        key={photo.id}
        photo={photo}
        index={index}
        isFocused={index === state.focusedIndex}
        onClick={() => handlePhotoClick(photo)}
        onEditClick={openEditDialog}
        onDeleteClick={(p) => state.openDeleteDialog(p.id, p.title)}
        onPinToggle={state.handlePinToggle}
        onFlagColorChange={state.handleFlagColorChange}
        onChatClick={state.handleChatClick}
      />
    ),
    [state, handlePhotoClick, openEditDialog],
  );

  // Gallery view is active when viewMode is gallery and galleryIndex is set
  const isGalleryActive =
    state.viewMode === "gallery" &&
    galleryIndex !== null &&
    state.sortedItems[galleryIndex];

  return (
    <ListPageLayout
      state={stateWithGallery}
      title="Photos"
      emptyIcon={Camera}
      emptyMessage="Your photo collection is empty."
      emptyFilterMessage="No photos found matching your criteria."
      searchPlaceholder="Search photos..."
      totalCount={photos.length}
      filteredCount={state.sortedItems.length}
      isLoading={isLoading}
      error={
        error instanceof Error ? error : error ? new Error(String(error)) : null
      }
      onRetry={refresh}
      sortOptions={photosConfig.sortOptions.map((o) => ({
        value: o.value,
        label: o.label,
      }))}
      viewModes={photosViewModes}
      headerAction={
        <Button onClick={openFileDialog}>
          <UploadCloud className="mr-2 h-4 w-4" />
          Upload Photos
        </Button>
      }
      dropzoneRootProps={getRootProps()}
      dropzoneInputProps={getInputProps()}
      isDragActive={isDragActive}
      dragOverlay={
        isDragActive ? (
          <div className="absolute inset-0 bg-black/10 dark:bg-white/10 flex items-center justify-center z-50 pointer-events-none">
            <div className="text-center p-6 bg-background rounded-lg shadow-xl">
              {isDragReject ? (
                <>
                  <AlertCircle className="h-16 w-16 mx-auto mb-4 text-red-500" />
                  <p className="text-xl font-semibold mb-2">
                    Invalid file type
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Please drop image files only
                  </p>
                </>
              ) : (
                <>
                  <UploadCloud className="h-16 w-16 text-blue-500 mx-auto mb-4" />
                  <p className="text-xl font-semibold">Drop photos to upload</p>
                </>
              )}
            </div>
          </div>
        ) : undefined
      }
      uploadProgress={
        uploadingFiles.length > 0 ? (
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
        ) : undefined
      }
      deleteEntityName="photo"
      isDeleting={isDeleting}
      dialogs={
        <>
          {/* View Photo Details Dialog */}
          <Dialog
            open={isViewPhotoDialogOpen}
            onOpenChange={setIsViewPhotoDialogOpen}
          >
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
                  <div className="md:col-span-2 aspect-video overflow-hidden rounded-md bg-muted flex items-center justify-center">
                    <img
                      src={selectedPhoto.thumbnailUrl || "/placeholder.svg"}
                      alt={selectedPhoto.title}
                      className="object-contain max-w-full max-h-[70vh]"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
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
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${selectedPhoto.latitude},${selectedPhoto.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline mt-0.5"
                          >
                            <span>
                              {selectedPhoto.latitude.toFixed(5)},{" "}
                              {selectedPhoto.longitude.toFixed(5)}
                            </span>
                          </a>
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
                    if (selectedPhoto)
                      state.openDeleteDialog(
                        selectedPhoto.id,
                        selectedPhoto.title,
                      );
                  }}
                >
                  Delete
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
                    Edit Metadata
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit Photo Metadata Dialog */}
          <Dialog
            open={isEditPhotoDialogOpen}
            onOpenChange={setIsEditPhotoDialogOpen}
          >
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
                              <span className="sr-only">Remove tag</span>
                              &times;
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
        </>
      }
    >
      {/* Gallery view (full screen overlay) */}
      {isGalleryActive && galleryIndex !== null && (
        <PhotoGalleryView
          photos={state.sortedItems}
          currentIndex={galleryIndex}
          onClose={closeGalleryView}
          onNavigate={navigateGallery}
          onEdit={openEditDialog}
          onDelete={(p) => state.openDeleteDialog(p.id, p.title)}
          onNavigateToIndex={setGalleryIndex}
        />
      )}

      {/* Content area: Tile or List view (hidden when gallery is active) */}
      {!isGalleryActive && state.viewMode === "tile" && (
        <GroupedItemList
          items={state.sortedItems}
          isGrouped={state.isGrouped}
          getGroupDate={(item) => photosConfig.getGroupDate(item, state.sortBy)}
          className="grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
          containerRef={containerRef}
          onKeyDown={handleKeyDown}
          renderItem={renderTileItem}
        />
      )}

      {!isGalleryActive && state.viewMode === "list" && (
        <div className="border rounded-md overflow-hidden">
          <div className="divide-y divide-border">
            {/* Header Row */}
            <div className="flex items-center px-4 py-2 bg-muted/50 text-sm font-medium text-muted-foreground">
              <div className="w-16 flex-shrink-0 mr-4" />
              <div className="flex-1 min-w-0 mr-4">Title</div>
              <div className="w-32 hidden md:block mr-4">Date Taken</div>
              <div className="w-32 hidden lg:block mr-4">Date Added</div>
              <div className="w-40 hidden md:block mr-4">Location</div>
              <div className="w-24 hidden sm:block mr-4">Size</div>
              <div className="w-16 flex-shrink-0 mr-3">Actions</div>
            </div>
            {/* Data Rows */}
            {state.sortedItems.map((photo, index) => (
              <PhotoListItem
                key={photo.id}
                photo={photo}
                index={index}
                isFocused={index === state.focusedIndex}
                onClick={() => handlePhotoClick(photo)}
                onEditClick={openEditDialog}
                onDeleteClick={(p) => state.openDeleteDialog(p.id, p.title)}
                onPinToggle={state.handlePinToggle}
                onFlagColorChange={state.handleFlagColorChange}
                onChatClick={state.handleChatClick}
              />
            ))}
          </div>
        </div>
      )}
    </ListPageLayout>
  );
}

// ---------------------------------------------------------------------------
// Upload Progress List (page-specific)
// ---------------------------------------------------------------------------

function UploadProgressList({
  uploads,
  onClearComplete,
}: {
  uploads: UploadingFile[];
  onClearComplete: () => void;
}) {
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
              Clear Completed
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
