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
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";

import type { ViewModeDef } from "@/components/list-page";
import { GroupedItemList, ListPageLayout } from "@/components/list-page";
import { PhotoEditDialog } from "@/components/photos/PhotoEditDialog";
import { PhotoViewDialog } from "@/components/photos/PhotoViewDialog";
import { UploadProgressList } from "@/components/shared/UploadProgressList";
import { Button } from "@/components/ui/button";
import type { ListParams } from "@/hooks/create-crud-hooks";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useListKeyboardNavigation } from "@/hooks/use-list-keyboard-navigation";
import { useListPageState } from "@/hooks/use-list-page-state";
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  usePhotoUpload,
} from "@/hooks/use-photo-upload";
import { usePhotos } from "@/hooks/use-photos";
import { useTags } from "@/hooks/use-tags";
import type { EditPhotoState, Photo } from "@/types/photo";

import { PhotoGalleryView } from "./photos/PhotoGalleryView";
import { PhotoListItem } from "./photos/PhotoListItem";
import { photosConfig } from "./photos/photos-config";
import { PhotoTileItem } from "./photos/PhotoTileItem";

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
  const navigate = useNavigate();
  const [params, setParams] = useState<ListParams>({});

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
    totalCount,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = usePhotos(params);

  const { data: allTags = [] } = useTags("photos");

  // Shared list page state
  const state = useListPageState(photos, allTags, photosConfig, {
    refresh,
    deleteItem: deletePhoto,
  });

  useEffect(() => {
    setParams(state.serverParams);
  }, [state.serverParams]);

  const { sentinelRef } = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  });

  // Page-specific state
  const [isViewPhotoDialogOpen, setIsViewPhotoDialogOpen] = useState(false);
  const [isEditPhotoDialogOpen, setIsEditPhotoDialogOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [editingPhoto, setEditingPhoto] = useState<EditPhotoState | null>(null);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);

  const { uploadingFiles, handleUpload, clearCompleted } = usePhotoUpload({
    refresh,
  });

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
      toast.success("Photo Updated", {
        description: `"${editingPhoto.title}" updated.`,
      });
    } catch (err) {
      console.error("Update photo error:", err);
    }
  };

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
          toast.error("Upload Rejected", {
            description: `${file.name}: ${message}`,
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
      totalCount={totalCount ?? photos.length}
      filteredCount={state.sortedItems.length}
      isLoading={isLoading}
      error={
        error instanceof Error ? error : error ? new Error(String(error)) : null
      }
      onRetry={refresh}
      sortOptions={state.sortOptions}
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
            onClearComplete={clearCompleted}
          />
        ) : undefined
      }
      loadMoreSentinel={
        hasNextPage ? (
          <div ref={sentinelRef} className="flex justify-center py-4">
            {isFetchingNextPage && (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            )}
          </div>
        ) : undefined
      }
      deleteEntityName="photo"
      isDeleting={isDeleting}
      dialogs={
        <>
          {/* View Photo Details Dialog */}
          <PhotoViewDialog
            open={isViewPhotoDialogOpen}
            onOpenChange={setIsViewPhotoDialogOpen}
            photo={selectedPhoto}
            onDelete={(p) => state.openDeleteDialog(p.id, p.title)}
            onEdit={openEditDialog}
          />

          {/* Edit Photo Metadata Dialog */}
          <PhotoEditDialog
            open={isEditPhotoDialogOpen}
            onOpenChange={setIsEditPhotoDialogOpen}
            editingPhoto={editingPhoto}
            setEditingPhoto={setEditingPhoto}
            onSubmit={handleUpdatePhoto}
            isUpdating={isUpdating}
          />
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
          className="grid gap-4 md:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
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
