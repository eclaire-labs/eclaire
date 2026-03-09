import { useNavigate } from "@tanstack/react-router";
import {
  Download,
  Edit,
  File as FileIconGeneric,
  FileText,
  Loader2,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { nanoid } from "nanoid";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { GroupedItemList, ListPageLayout } from "@/components/list-page";
import { TagEditor } from "@/components/shared/TagEditor";
import type { UploadingFile } from "@/components/shared/UploadProgressList";
import { UploadProgressList } from "@/components/shared/UploadProgressList";
import { Badge } from "@/components/ui/badge";
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
import { useDocuments } from "@/hooks/use-documents";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useListKeyboardNavigation } from "@/hooks/use-list-keyboard-navigation";
import { useListPageState } from "@/hooks/use-list-page-state";
import { useTags } from "@/hooks/use-tags";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/list-page-utils";
import type { Document } from "@/types/document";
import { DocumentListItem } from "./documents/DocumentListItem";
import { DocumentTileItem } from "./documents/DocumentTileItem";
import {
  documentsConfig,
  formatFileSize,
  getDocumentTypeLabel,
} from "./documents/documents-config";

// ---------------------------------------------------------------------------
// Upload types & constants
// ---------------------------------------------------------------------------

interface DocumentUploadingFile extends UploadingFile {
  documentId?: string;
}

interface EditDocumentState {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  tags: string[];
}

const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
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
  "application/vnd.apple.pages": [".pages"],
  "application/vnd.apple.numbers": [".numbers"],
  "application/vnd.apple.keynote": [".keynote"],
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function DocumentsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useState<ListParams>({});

  // Data
  const {
    documents: entries,
    isLoading,
    error,
    updateDocument,
    deleteDocument,
    refresh,
    isUpdating,
    isDeleting,
    totalCount,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useDocuments(params);

  const { data: allTags = [] } = useTags("documents");

  // Shared list page state
  const state = useListPageState(entries, allTags, documentsConfig, {
    refresh,
    deleteItem: deleteDocument,
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
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(
    null,
  );
  const [isViewDocumentDialogOpen, setIsViewDocumentDialogOpen] =
    useState(false);
  const [isEditDocumentDialogOpen, setIsEditDocumentDialogOpen] =
    useState(false);
  const [editingDocument, setEditingDocument] =
    useState<EditDocumentState | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<DocumentUploadingFile[]>(
    [],
  );

  const containerRef = useRef<HTMLElement | null>(null);

  // Navigation
  const handleEntryClick = useCallback(
    (doc: Document) => {
      navigate({ to: `/documents/${doc.id}` });
    },
    [navigate],
  );

  const openEditDialog = useCallback((doc: Document) => {
    setEditingDocument({
      id: doc.id,
      title: doc.title,
      description: doc.description,
      dueDate: doc.dueDate,
      tags: doc.tags,
    });
    setSelectedDocument(doc);
    setIsEditDocumentDialogOpen(true);
  }, []);

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
        if (item) handleEntryClick(item);
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

  // --- Form Input Handlers (Edit Dialog) ---

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

  // --- API Action Handlers ---

  const handleUpdateDocument = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingDocument) return;

    try {
      const updateData: Partial<Document> = {
        title: editingDocument.title,
        description: editingDocument.description,
        dueDate: editingDocument.dueDate,
        tags: editingDocument.tags,
      };

      await updateDocument(editingDocument.id, updateData);

      setIsEditDocumentDialogOpen(false);
      setEditingDocument(null);
      setSelectedDocument(null);
      toast.success("Document Updated", {
        description: `"${editingDocument.title}" updated.`,
      });
    } catch (err) {
      console.error("Update document error:", err);
    }
  };

  // --- Upload Handling ---
  const handleUpload = useCallback(
    async (acceptedFiles: File[]) => {
      const newUploads: DocumentUploadingFile[] = acceptedFiles.map((file) => ({
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
            prev.map((f) => (f.id === upload.id ? { ...f, progress: 30 } : f)),
          );

          const response = await apiFetch("/api/documents", {
            method: "POST",
            body: formData,
            headers: {},
          });

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

          refresh();

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

          toast.success("Upload Successful", {
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
          toast.error("Upload Error", {
            description: `Failed to upload ${upload.file.name}: ${message}`,
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
            message = `Invalid file type. Allowed types: ${Object.values(ALLOWED_UPLOAD_TYPES).flat().join(", ")}`;
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
    (entry: Document, index: number) => (
      <DocumentTileItem
        key={entry.id}
        entry={entry}
        index={index}
        isFocused={index === state.focusedIndex}
        onClick={() => handleEntryClick(entry)}
        onEditClick={openEditDialog}
        onDeleteClick={(e) => state.openDeleteDialog(e.id, e.title)}
        onPinToggle={state.handlePinToggle}
        onFlagColorChange={state.handleFlagColorChange}
        onChatClick={state.handleChatClick}
      />
    ),
    [state, handleEntryClick, openEditDialog],
  );

  return (
    <ListPageLayout
      state={state}
      title="Documents"
      emptyIcon={FileIconGeneric}
      emptyMessage="Your document collection is empty."
      emptyFilterMessage="No documents found matching your criteria."
      searchPlaceholder="Search documents..."
      totalCount={totalCount ?? entries.length}
      filteredCount={state.sortedItems.length}
      isLoading={isLoading}
      error={
        error instanceof Error ? error : error ? new Error(String(error)) : null
      }
      onRetry={refresh}
      sortOptions={documentsConfig.sortOptions.map((o) => ({
        value: o.value,
        label: o.label,
      }))}
      headerAction={
        <Button onClick={openFileDialog}>
          <UploadCloud className="mr-2 h-4 w-4" /> Upload Documents
        </Button>
      }
      dropzoneRootProps={getRootProps()}
      dropzoneInputProps={getInputProps()}
      isDragActive={isDragActive}
      dragOverlay={
        isDragActive ? (
          <div className="absolute inset-0 bg-black/10 dark:bg-white/10 flex items-center justify-center z-50 pointer-events-none">
            <div className="text-center p-6 bg-background rounded-lg shadow-xl">
              <UploadCloud className="h-16 w-16 text-blue-500 mx-auto mb-4" />
              <p className="text-xl font-semibold">Drop documents to upload</p>
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
      deleteEntityName="document"
      isDeleting={isDeleting}
      dialogs={
        <>
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
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setIsViewDocumentDialogOpen(false);
                    if (selectedDocument)
                      state.openDeleteDialog(
                        selectedDocument.id,
                        selectedDocument.title,
                      );
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </Button>
                <div className="flex gap-2">
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
                    {editingDocument?.title ?? selectedDocument?.title}". The
                    file content cannot be changed here.
                  </DialogDescription>
                </DialogHeader>
                {editingDocument && (
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
                    <TagEditor
                      tags={editingDocument.tags}
                      onAddTag={(tag) =>
                        setEditingDocument({
                          ...editingDocument,
                          tags: [...editingDocument.tags, tag],
                        })
                      }
                      onRemoveTag={(tag) =>
                        setEditingDocument({
                          ...editingDocument,
                          tags: editingDocument.tags.filter((t) => t !== tag),
                        })
                      }
                    />
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
        </>
      }
    >
      {/* Content area: Tile or List view */}
      {state.viewMode === "tile" ? (
        <GroupedItemList
          items={state.sortedItems}
          isGrouped={state.isGrouped}
          getGroupDate={(item) =>
            documentsConfig.getGroupDate(item, state.sortBy)
          }
          className="grid gap-4 md:gap-5 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          containerRef={containerRef}
          onKeyDown={handleKeyDown}
          renderItem={renderTileItem}
        />
      ) : (
        <div className="border rounded-md overflow-hidden">
          <div className="divide-y divide-border">
            {/* Header Row */}
            <div className="flex items-center px-4 py-2 bg-muted/50 text-sm font-medium text-muted-foreground">
              <div className="w-10 flex-shrink-0 mr-3" />
              <div className="flex-1 min-w-0 mr-4">Title</div>
              <div className="w-32 hidden md:block mr-4">Date Added</div>
              <div className="w-28 hidden sm:block mr-4">Type</div>
              <div className="w-24 hidden sm:block mr-4">Size</div>
              <div className="w-40 hidden lg:block mr-4">Tags</div>
              <div className="w-20 flex-shrink-0 mr-3">Actions</div>
            </div>
            {/* Data Rows */}
            {state.sortedItems.map((entry, index) => (
              <DocumentListItem
                key={entry.id}
                entry={entry}
                index={index}
                isFocused={index === state.focusedIndex}
                onClick={() => handleEntryClick(entry)}
                onEditClick={openEditDialog}
                onDeleteClick={(e) => state.openDeleteDialog(e.id, e.title)}
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
