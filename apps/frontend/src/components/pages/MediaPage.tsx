import { useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  AudioWaveform,
  LayoutGrid,
  Link2,
  List,
  Loader2,
  UploadCloud,
} from "lucide-react";
import { nanoid } from "nanoid";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import type { ViewModeDef } from "@/components/list-page";
import { GroupedItemList, ListPageLayout } from "@/components/list-page";
import { TagEditor } from "@/components/shared/TagEditor";
import type { UploadingFile } from "@/components/shared/UploadProgressList";
import { UploadProgressList } from "@/components/shared/UploadProgressList";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import type { ListParams } from "@/hooks/create-crud-hooks";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useListKeyboardNavigation } from "@/hooks/use-list-keyboard-navigation";
import { useListPageState } from "@/hooks/use-list-page-state";
import { useMedia } from "@/hooks/use-media";
import { useTags } from "@/hooks/use-tags";
import { apiFetch } from "@/lib/api-client";
import type { EditMediaState, Media } from "@/types/media";
import { ImportUrlDialog } from "./media/ImportUrlDialog";
import { MediaListItem } from "./media/MediaListItem";
import { MediaTileItem } from "./media/MediaTileItem";
import { mediaConfig } from "./media/media-config";

// ---------------------------------------------------------------------------
// Upload constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE_MB = 500;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = {
  // Audio
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "audio/flac": [".flac"],
  "audio/ogg": [".ogg"],
  "audio/aac": [".aac"],
  "audio/mp4": [".m4a"],
  "audio/x-m4a": [".m4a"],
  "audio/webm": [".webm"],
  "audio/aiff": [".aiff", ".aif"],
  // Video
  "video/mp4": [".mp4"],
  "video/quicktime": [".mov"],
  "video/x-msvideo": [".avi"],
  "video/x-matroska": [".mkv"],
  "video/webm": [".webm"],
  "video/ogg": [".ogv"],
  "video/mpeg": [".mpeg", ".mpg"],
};

// ---------------------------------------------------------------------------
// View mode definitions (Media has 2 modes: tile + list)
// ---------------------------------------------------------------------------

const mediaViewModes: ViewModeDef[] = [
  { value: "tile", label: "Tiles", icon: LayoutGrid },
  { value: "list", label: "List", icon: List },
];

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function MediaPage() {
  const navigate = useNavigate();
  const [params, setParams] = useState<ListParams>({});

  // Data
  const {
    media,
    isLoading,
    error,
    updateMedia,
    deleteMedia,
    refresh,
    isUpdating,
    isDeleting,
    totalCount,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useMedia(params);

  const { data: allTags = [] } = useTags("media");

  // Shared list page state
  const state = useListPageState(media, allTags, mediaConfig, {
    refresh,
    deleteItem: deleteMedia,
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
  const [isEditMediaDialogOpen, setIsEditMediaDialogOpen] = useState(false);
  const [editingMedia, setEditingMedia] = useState<EditMediaState | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);

  const [isImportUrlDialogOpen, setIsImportUrlDialogOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importUrlDefault, setImportUrlDefault] = useState<string | undefined>(
    undefined,
  );

  const containerRef = useRef<HTMLElement | null>(null);

  // Keyboard navigation
  const { handleKeyDown } = useListKeyboardNavigation(
    state.focusedIndex,
    state.setFocusedIndex,
    containerRef,
    {
      itemCount: state.sortedItems.length,
      viewMode: state.viewMode,
      onSelect: (idx) => {
        const item = state.sortedItems[idx];
        if (item) handleMediaClick(item);
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
  const handleMediaClick = useCallback(
    (item: Media) => {
      navigate({ to: `/media/${item.id}` });
    },
    [navigate],
  );

  const openEditDialog = useCallback((item: Media) => {
    setEditingMedia({
      id: item.id,
      title: item.title,
      description: item.description,
      tags: item.tags,
    });
    setIsEditMediaDialogOpen(true);
  }, []);

  // --- Form Input Handlers (Edit Dialog) ---

  const handleEditingMediaChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setEditingMedia((prev) =>
      prev ? { ...prev, [name]: value === null ? null : value } : null,
    );
  };

  // --- API Action Handlers ---

  const handleUpdateMedia = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingMedia) return;

    try {
      const updateData: Partial<Media> = {
        title: editingMedia.title,
        description: editingMedia.description,
        tags: editingMedia.tags,
      };

      await updateMedia(editingMedia.id, updateData);

      setIsEditMediaDialogOpen(false);
      setEditingMedia(null);
      toast.success("Media Updated", {
        description: `"${editingMedia.title}" updated.`,
      });
    } catch (err) {
      console.error("Update media error:", err);
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

          const response = await apiFetch("/api/media", {
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

          const createdMedia = (await response.json()) as Media;
          refresh();

          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.id === upload.id
                ? {
                    ...f,
                    status: "success",
                    progress: 100,
                    mediaId: createdMedia.id,
                  }
                : f,
            ),
          );

          toast.success("Upload Successful", {
            description: `"${createdMedia.title}" added.`,
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
          toast.error("Upload Error", {
            description: `Failed to upload ${upload.file.name}: ${message}`,
          });
        }
      }
    },
    [refresh],
  );

  const handleImportUrl = useCallback(
    async (data: {
      url: string;
      title?: string;
      description?: string;
      tags: string[];
    }) => {
      setIsImporting(true);
      try {
        const response = await apiFetch("/api/media/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: "Import failed" }));
          throw new Error(errorData.error || "Failed to import media from URL");
        }
        const createdMedia = (await response.json()) as Media;
        refresh();
        setIsImportUrlDialogOpen(false);
        toast.success("Import Started", {
          description: `"${createdMedia.title}" is being downloaded and processed.`,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "An unknown error occurred.";
        toast.error("Import Error", { description: message });
      } finally {
        setIsImporting(false);
      }
    },
    [refresh],
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
          toast.error("Upload Rejected", {
            description: `${file.name}: ${message}`,
          });
        });
      });
    },
  });

  // Render item for GroupedItemList
  const renderTileItem = useCallback(
    (item: Media, index: number) => (
      <MediaTileItem
        key={item.id}
        media={item}
        index={index}
        isFocused={index === state.focusedIndex}
        onClick={() => handleMediaClick(item)}
        onEditClick={openEditDialog}
        onDeleteClick={(m) => state.openDeleteDialog(m.id, m.title)}
        onPinToggle={state.handlePinToggle}
        onFlagColorChange={state.handleFlagColorChange}
        onChatClick={state.handleChatClick}
      />
    ),
    [state, handleMediaClick, openEditDialog],
  );

  return (
    <ListPageLayout
      state={state}
      title="Media"
      emptyIcon={AudioWaveform}
      emptyMessage="No media yet"
      emptyFilterMessage="No media found matching your criteria."
      searchPlaceholder="Search media..."
      totalCount={totalCount ?? media.length}
      filteredCount={state.sortedItems.length}
      isLoading={isLoading}
      error={
        error instanceof Error ? error : error ? new Error(String(error)) : null
      }
      onRetry={refresh}
      sortOptions={mediaConfig.sortOptions.map((o) => ({
        value: o.value,
        label: o.label,
      }))}
      viewModes={mediaViewModes}
      headerAction={
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setImportUrlDefault(undefined);
              setIsImportUrlDialogOpen(true);
            }}
          >
            <Link2 className="mr-2 h-4 w-4" />
            Import URL
          </Button>
          <Button onClick={openFileDialog}>
            <UploadCloud className="mr-2 h-4 w-4" />
            Upload File
          </Button>
        </div>
      }
      dropzoneRootProps={{
        ...getRootProps(),
        onDrop: (e: React.DragEvent<HTMLElement>) => {
          // Intercept URL drops before react-dropzone handles them as files
          const uriList = e.dataTransfer?.getData("text/uri-list");
          const plainText = e.dataTransfer?.getData("text/plain");
          const droppedUrl = uriList || plainText;
          if (droppedUrl && /^https?:\/\//i.test(droppedUrl.trim())) {
            e.preventDefault();
            e.stopPropagation();
            setImportUrlDefault(droppedUrl.trim());
            setIsImportUrlDialogOpen(true);
            return;
          }
          // Otherwise let react-dropzone handle it
          getRootProps().onDrop?.(e);
        },
      }}
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
                    Please drop audio or video files only
                  </p>
                </>
              ) : (
                <>
                  <UploadCloud className="h-16 w-16 text-blue-500 mx-auto mb-4" />
                  <p className="text-xl font-semibold">Drop media to upload</p>
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
      loadMoreSentinel={
        hasNextPage ? (
          <div ref={sentinelRef} className="flex justify-center py-4">
            {isFetchingNextPage && (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            )}
          </div>
        ) : undefined
      }
      deleteEntityName="media"
      isDeleting={isDeleting}
      dialogs={
        <>
          {/* Import URL Dialog */}
          <ImportUrlDialog
            open={isImportUrlDialogOpen}
            onOpenChange={setIsImportUrlDialogOpen}
            onSubmit={handleImportUrl}
            isSubmitting={isImporting}
            defaultUrl={importUrlDefault}
          />

          {/* Edit Media Metadata Dialog */}
          <Dialog
            open={isEditMediaDialogOpen}
            onOpenChange={setIsEditMediaDialogOpen}
          >
            <DialogContent className="sm:max-w-lg">
              <form onSubmit={handleUpdateMedia}>
                <DialogHeader>
                  <DialogTitle>Edit Media Metadata</DialogTitle>
                  <DialogDescription>
                    Make changes to the details of "{editingMedia?.title}".
                  </DialogDescription>
                </DialogHeader>
                {editingMedia && (
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-title">
                        Title <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="edit-title"
                        name="title"
                        value={editingMedia.title}
                        onChange={handleEditingMediaChange}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-description">Description</Label>
                      <Textarea
                        id="edit-description"
                        name="description"
                        rows={3}
                        value={editingMedia.description ?? ""}
                        onChange={handleEditingMediaChange}
                      />
                    </div>
                    <TagEditor
                      tags={editingMedia.tags}
                      onAddTag={(tag) =>
                        setEditingMedia({
                          ...editingMedia,
                          tags: [...editingMedia.tags, tag],
                        })
                      }
                      onRemoveTag={(tag) =>
                        setEditingMedia({
                          ...editingMedia,
                          tags: editingMedia.tags.filter((t) => t !== tag),
                        })
                      }
                    />
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
                    disabled={isUpdating || !editingMedia?.title}
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
      {/* Content area: Tile or List view */}
      {state.viewMode === "tile" && (
        <GroupedItemList
          items={state.sortedItems}
          isGrouped={state.isGrouped}
          getGroupDate={(item) => mediaConfig.getGroupDate(item, state.sortBy)}
          className="grid gap-4 md:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
          containerRef={containerRef}
          onKeyDown={handleKeyDown}
          renderItem={renderTileItem}
        />
      )}

      {state.viewMode === "list" && (
        <div className="border rounded-md overflow-hidden">
          <div className="divide-y divide-border">
            {/* Header Row */}
            <div className="flex items-center px-4 py-2 bg-muted/50 text-sm font-medium text-muted-foreground">
              <div className="w-16 flex-shrink-0 mr-4" />
              <div className="flex-1 min-w-0 mr-4">Title</div>
              <div className="w-32 hidden md:block mr-4">Duration</div>
              <div className="w-32 hidden lg:block mr-4">Date Added</div>
              <div className="w-24 hidden sm:block mr-4">Size</div>
              <div className="w-16 flex-shrink-0 mr-3">Actions</div>
            </div>
            {/* Data Rows */}
            {state.sortedItems.map((item, index) => (
              <MediaListItem
                key={item.id}
                media={item}
                index={index}
                isFocused={index === state.focusedIndex}
                onClick={() => handleMediaClick(item)}
                onEditClick={openEditDialog}
                onDeleteClick={(m) => state.openDeleteDialog(m.id, m.title)}
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
