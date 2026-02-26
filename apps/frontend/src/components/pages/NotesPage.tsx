import { useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  FileText,
  Loader2,
  Plus,
  Upload,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { GroupedItemList, ListPageLayout } from "@/components/list-page";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useListKeyboardNavigation } from "@/hooks/use-list-keyboard-navigation";
import { useListPageState } from "@/hooks/use-list-page-state";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNotes } from "@/hooks/use-notes";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/list-page-utils";
import type { NoteEntry } from "@/types/note";
import { NoteListItem } from "./notes/NoteListItem";
import { NoteTileItem } from "./notes/NoteTileItem";
import { notesConfig } from "./notes/notes-config";

// ---------------------------------------------------------------------------
// Upload types & constants
// ---------------------------------------------------------------------------

interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
  noteId?: string;
}

const MAX_FILE_SIZE_MB = 1;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = {
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "application/json": [".json"],
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function NotesPage() {
  const _isMobile = useIsMobile();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Data
  const {
    notes: entries,
    isLoading,
    error,
    createNote,
    updateNote,
    deleteNote,
    uploadNote,
    refresh,
    isDeleting,
    isUploading,
  } = useNotes();

  // Shared list page state
  const state = useListPageState(entries, notesConfig, {
    refresh,
    deleteItem: deleteNote,
  });

  // Page-specific state
  const [selectedEntry, setSelectedEntry] = useState<NoteEntry | null>(null);
  const [isEntryDialogOpen, setIsEntryDialogOpen] = useState(false);
  const [isNewEntryDialogOpen, setIsNewEntryDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [newEntry, setNewEntry] = useState({
    title: "",
    content: "",
    dueDate: null as string | null,
    tags: [] as string[],
  });
  const [tagInput, setTagInput] = useState("");
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);

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

  // Navigation
  const handleEntryClick = useCallback(
    (entry: NoteEntry) => {
      navigate({ to: `/notes/${entry.id}` });
    },
    [navigate],
  );

  const openEditDialog = useCallback((entry: NoteEntry) => {
    setSelectedEntry(entry);
    setIsEditMode(true);
    setIsEntryDialogOpen(true);
  }, []);

  // Create / Update handlers
  const handleCreateEntry = async () => {
    try {
      await createNote({
        title: newEntry.title,
        content: newEntry.content || "",
        dueDate: newEntry.dueDate || undefined,
        tags: newEntry.tags,
      });
      setNewEntry({ title: "", content: "", dueDate: null, tags: [] });
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

  // Tags
  const handleAddTag = () => {
    if (!tagInput.trim()) return;
    const tag = tagInput.trim().toLowerCase();
    if (isNewEntryDialogOpen && !newEntry.tags.includes(tag)) {
      setNewEntry({ ...newEntry, tags: [...newEntry.tags, tag] });
    } else if (isEditMode && selectedEntry && !selectedEntry.tags.includes(tag)) {
      setSelectedEntry({ ...selectedEntry, tags: [...selectedEntry.tags, tag] });
    }
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    if (isNewEntryDialogOpen) {
      setNewEntry({ ...newEntry, tags: newEntry.tags.filter((t) => t !== tag) });
    } else if (isEditMode && selectedEntry) {
      setSelectedEntry({
        ...selectedEntry,
        tags: selectedEntry.tags.filter((t) => t !== tag),
      });
    }
  };

  // File upload
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
        const metadata = {
          title: upload.file.name.replace(/\.[^/.]+$/, ""),
          tags: [],
        };
        formData.append("metadata", JSON.stringify(metadata));
        formData.append("content", upload.file);

        try {
          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.id === upload.id ? { ...f, progress: 30 } : f,
            ),
          );
          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.id === upload.id ? { ...f, progress: 70 } : f,
            ),
          );

          const createdNote = await uploadNote(formData);

          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.id === upload.id
                ? { ...f, status: "success", progress: 100, noteId: createdNote.id }
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
              message = "Invalid file type. Supported types: TXT, MD, JSON";
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
    (entry: NoteEntry, index: number) => (
      <NoteTileItem
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

  // Tag editor used in both create and edit dialogs
  const tagEditor = (
    tags: string[],
  ) => (
    <div className="space-y-2">
      <Label>Tags</Label>
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="flex items-center gap-1">
            {tag}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-4 w-4 ml-1"
              onClick={() => handleRemoveTag(tag)}
            >
              <span className="sr-only">Remove tag</span>&times;
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
  );

  return (
    <ListPageLayout
      state={state}
      title="Notes"
      emptyIcon={FileText}
      emptyMessage="Your notes collection is empty."
      emptyFilterMessage="No notes found matching your criteria."
      searchPlaceholder="Search notes..."
      totalCount={entries.length}
      filteredCount={state.sortedItems.length}
      isLoading={isLoading}
      error={error instanceof Error ? error : error ? new Error(String(error)) : null}
      onRetry={refresh}
      sortOptions={notesConfig.sortOptions.map((o) => ({
        value: o.value,
        label: o.label,
      }))}
      headerAction={
        <Button onClick={() => setIsNewEntryDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Note
        </Button>
      }
      dropzoneRootProps={getRootProps()}
      dropzoneInputProps={getInputProps()}
      isDragActive={isDragActive}
      dragOverlay={
        (isDragActive || isUploading) ? (
          <div className="absolute inset-0 bg-black/10 dark:bg-white/10 flex items-center justify-center z-50 pointer-events-none">
            <div className="text-center p-6 bg-background rounded-lg shadow-xl">
              {isUploading ? (
                <>
                  <Loader2 className="h-16 w-16 text-blue-500 mx-auto mb-4 animate-spin" />
                  <p className="text-xl font-semibold mb-2">Uploading notes...</p>
                  <p className="text-sm text-muted-foreground">Processing your files</p>
                </>
              ) : isDragReject ? (
                <>
                  <AlertCircle className="h-16 w-16 mx-auto mb-4 text-red-500" />
                  <p className="text-xl font-semibold mb-2">Invalid file type</p>
                  <p className="text-sm text-muted-foreground">
                    Please drop TXT, MD, or JSON files only
                  </p>
                </>
              ) : (
                <>
                  <Upload className="h-16 w-16 text-blue-500 mx-auto mb-4" />
                  <p className="text-xl font-semibold mb-2">Drop files to create notes</p>
                  <p className="text-sm text-muted-foreground">
                    Supports TXT, MD, and JSON files
                  </p>
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
                prev.filter((f) => f.status !== "success" && f.status !== "error"),
              )
            }
          />
        ) : undefined
      }
      deleteEntityName="note"
      isDeleting={isDeleting}
      dialogs={
        <>
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
                            setSelectedEntry({ ...selectedEntry, title: e.target.value })
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
                            setSelectedEntry({ ...selectedEntry, content: e.target.value })
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
                              ? new Date(selectedEntry.dueDate).toISOString().slice(0, 16)
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
                      {tagEditor(selectedEntry.tags)}
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
                        <p className="whitespace-pre-line">{selectedEntry.content}</p>
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
                    <Button variant="ghost" onClick={() => setIsEditMode(false)}>
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
                          state.openDeleteDialog(selectedEntry.id, selectedEntry.title);
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
          <Dialog open={isNewEntryDialogOpen} onOpenChange={setIsNewEntryDialogOpen}>
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
                {tagEditor(newEntry.tags)}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setIsNewEntryDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateEntry} disabled={!newEntry.title.trim()}>
                  Create Entry
                </Button>
              </DialogFooter>
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
          getGroupDate={(item) => notesConfig.getGroupDate(item, state.sortBy)}
          className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
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
              <div className="w-32 hidden md:block mr-4">Date</div>
              <div className="w-20 hidden sm:block mr-4">Length</div>
              <div className="w-32 hidden lg:block mr-4">Tags</div>
              <div className="w-16 flex-shrink-0 mr-3">Actions</div>
              <div className="w-10 flex-shrink-0" />
            </div>
            {/* Data Rows */}
            {state.sortedItems.map((entry, index) => (
              <NoteListItem
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

// ---------------------------------------------------------------------------
// Upload Progress List (page-specific)
// ---------------------------------------------------------------------------

function UploadProgressList({
  uploads,
  onClearComplete,
}: { uploads: UploadingFile[]; onClearComplete: () => void }) {
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
              <p className="text-sm font-medium truncate" title={upload.file.name}>
                {upload.file.name}
              </p>
              {upload.status === "error" && (
                <p className="text-xs text-red-600 truncate" title={upload.error}>
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
