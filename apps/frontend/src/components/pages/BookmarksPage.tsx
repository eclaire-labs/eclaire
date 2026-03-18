import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, Globe, Loader2, Plus, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { GroupedItemList, ListPageLayout } from "@/components/list-page";
import { TagEditor } from "@/components/shared/TagEditor";
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
import { useBookmarks } from "@/hooks/use-bookmarks";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useListKeyboardNavigation } from "@/hooks/use-list-keyboard-navigation";
import { useListPageState } from "@/hooks/use-list-page-state";
import { useTags } from "@/hooks/use-tags";
import type { Bookmark } from "@/types/bookmark";
import { BookmarkListItem } from "./bookmarks/BookmarkListItem";
import { BookmarkTileItem } from "./bookmarks/BookmarkTileItem";
import { bookmarksConfig } from "./bookmarks/bookmarks-config";
import { CreateBookmarkDialog } from "./bookmarks/CreateBookmarkDialog";
import { Favicon } from "./bookmarks/Favicon";

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function BookmarksPage() {
  const navigate = useNavigate();
  const [params, setParams] = useState<ListParams>({});

  // Data
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
    totalCount,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useBookmarks(params);

  const { data: allTags = [] } = useTags("bookmarks");

  // Shared list page state
  const state = useListPageState(bookmarks, allTags, bookmarksConfig, {
    refresh,
    deleteItem: deleteBookmark,
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
  const [selectedBookmark, setSelectedBookmark] = useState<Bookmark | null>(
    null,
  );
  const [isBookmarkDialogOpen, setIsBookmarkDialogOpen] = useState(false);
  const [isNewBookmarkDialogOpen, setIsNewBookmarkDialogOpen] = useState(false);

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
        if (item) handleBookmarkClick(item);
      },
      onEdit: (idx) => {
        const item = state.sortedItems[idx];
        if (item) openEditDialog(item);
      },
      onDelete: (idx) => {
        const item = state.sortedItems[idx];
        if (item) state.openDeleteDialog(item.id, item.title ?? "Untitled");
      },
    },
  );

  // Navigation
  const handleBookmarkClick = useCallback(
    (bookmark: Bookmark) => {
      navigate({ to: `/bookmarks/${bookmark.id}` });
    },
    [navigate],
  );

  const openEditDialog = useCallback((bookmark: Bookmark) => {
    setSelectedBookmark(bookmark);
    setIsBookmarkDialogOpen(true);
  }, []);

  // Create / Update handlers
  const handleCreateBookmark = async (url: string) => {
    try {
      await createBookmark({ url });
      setIsNewBookmarkDialogOpen(false);
      toast.success("Bookmark Added", {
        description: "We've started processing your bookmark.",
      });
    } catch (err) {
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
      setIsBookmarkDialogOpen(false);
      toast.success("Bookmark updated", {
        description: "Your bookmark has been updated successfully.",
      });
    } catch (err) {
      console.error("Update bookmark error:", err);
    }
  };

  // File upload (bookmark import)
  const handleFileUpload = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;

      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        toast.error("File too large", {
          description: "Please upload a file smaller than 5MB.",
        });
        return;
      }

      try {
        const formData = new FormData();
        formData.append("file", file);

        const result = await importBookmarks(formData);
        toast.success("Import successful", {
          description: `Imported ${result.imported} bookmarks. ${result.queued} queued for processing.`,
        });
      } catch (err) {
        console.error("Import bookmarks error:", err);
      }
    },
    [importBookmarks],
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop: handleFileUpload,
      maxSize: 5 * 1024 * 1024, // 5MB
      multiple: false,
      noClick: true,
      noKeyboard: true,
      onDropRejected: (rejectedFiles) => {
        const file = rejectedFiles[0];
        if (file?.errors.some((e) => e.code === "file-too-large")) {
          toast.error("File too large", {
            description: "Please upload a file smaller than 5MB.",
          });
        }
      },
    });

  // Render item for GroupedItemList
  const renderTileItem = useCallback(
    (entry: Bookmark, index: number) => (
      <BookmarkTileItem
        key={entry.id}
        entry={entry}
        index={index}
        isFocused={index === state.focusedIndex}
        onClick={() => handleBookmarkClick(entry)}
        onEditClick={openEditDialog}
        onDeleteClick={(e) =>
          state.openDeleteDialog(e.id, e.title ?? "Untitled")
        }
        onPinToggle={state.handlePinToggle}
        onFlagColorChange={state.handleFlagColorChange}
        onChatClick={state.handleChatClick}
      />
    ),
    [state, handleBookmarkClick, openEditDialog],
  );

  return (
    <ListPageLayout
      state={state}
      title="Bookmarks"
      emptyIcon={Globe}
      emptyMessage="Your bookmark collection is empty."
      emptyFilterMessage="No bookmarks found matching your criteria."
      searchPlaceholder="Search bookmarks..."
      totalCount={totalCount ?? bookmarks.length}
      filteredCount={state.sortedItems.length}
      loadMoreSentinel={
        hasNextPage ? (
          <div ref={sentinelRef} className="flex justify-center py-4">
            {isFetchingNextPage && (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            )}
          </div>
        ) : undefined
      }
      isLoading={isLoading}
      error={
        error instanceof Error ? error : error ? new Error(String(error)) : null
      }
      onRetry={refresh}
      sortOptions={bookmarksConfig.sortOptions.map((o) => ({
        value: o.value,
        label: o.label,
      }))}
      headerAction={
        <Button onClick={() => setIsNewBookmarkDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Bookmark
        </Button>
      }
      dropzoneRootProps={getRootProps()}
      dropzoneInputProps={getInputProps()}
      isDragActive={isDragActive}
      dragOverlay={
        isDragActive || isImporting ? (
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
        ) : undefined
      }
      deleteEntityName="bookmark"
      isDeleting={isDeleting}
      deleteDialogExtra={
        state.itemToDelete ? (
          <DeleteDialogBookmarkPreview
            bookmark={
              bookmarks.find((b) => b.id === state.itemToDelete?.id) ?? null
            }
          />
        ) : undefined
      }
      dialogs={
        <>
          {/* New Bookmark Dialog */}
          <CreateBookmarkDialog
            open={isNewBookmarkDialogOpen}
            onOpenChange={setIsNewBookmarkDialogOpen}
            onCreateBookmark={handleCreateBookmark}
            isCreating={isCreating}
          />

          {/* Edit Bookmark Dialog */}
          {selectedBookmark && (
            <Dialog
              open={isBookmarkDialogOpen}
              onOpenChange={setIsBookmarkDialogOpen}
            >
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Edit Bookmark</DialogTitle>
                  <DialogDescription>
                    Make changes to your bookmark.
                  </DialogDescription>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleUpdateBookmark();
                  }}
                >
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
                      />
                    </div>
                    <TagEditor
                      tags={selectedBookmark.tags}
                      onAddTag={(tag) =>
                        setSelectedBookmark({
                          ...selectedBookmark,
                          tags: [...selectedBookmark.tags, tag],
                        })
                      }
                      onRemoveTag={(tag) =>
                        setSelectedBookmark({
                          ...selectedBookmark,
                          tags: selectedBookmark.tags.filter((t) => t !== tag),
                        })
                      }
                    />
                  </div>
                  <DialogFooter className="sm:justify-between gap-2 pt-4 border-t mt-2">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => {
                        setIsBookmarkDialogOpen(false);
                        state.openDeleteDialog(
                          selectedBookmark.id,
                          selectedBookmark.title ?? "Untitled",
                        );
                      }}
                    >
                      Delete
                    </Button>
                    <div className="flex gap-2">
                      <DialogClose asChild>
                        <Button type="button" variant="outline">
                          Cancel
                        </Button>
                      </DialogClose>
                      <Button type="submit" disabled={isUpdating}>
                        {isUpdating && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Save Changes
                      </Button>
                    </div>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </>
      }
    >
      {/* Content area: Tile or List view */}
      {state.viewMode === "tile" ? (
        <GroupedItemList
          items={state.sortedItems}
          isGrouped={state.isGrouped}
          getGroupDate={(item) =>
            bookmarksConfig.getGroupDate(item, state.sortBy)
          }
          className="grid gap-4 md:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
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
              <div className="w-40 hidden md:block mr-4">Domain</div>
              <div className="w-32 hidden sm:block mr-4">Date Added</div>
              <div className="w-32 hidden lg:block mr-4">Tags</div>
              <div className="w-16 flex-shrink-0 mr-3">Actions</div>
              <div className="w-10 flex-shrink-0" />
            </div>
            {/* Data Rows */}
            {state.sortedItems.map((entry, index) => (
              <BookmarkListItem
                key={entry.id}
                entry={entry}
                index={index}
                isFocused={index === state.focusedIndex}
                onClick={() => handleBookmarkClick(entry)}
                onEditClick={openEditDialog}
                onDeleteClick={(e) =>
                  state.openDeleteDialog(e.id, e.title ?? "Untitled")
                }
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
// Delete dialog bookmark preview (page-specific)
// ---------------------------------------------------------------------------

function DeleteDialogBookmarkPreview({
  bookmark,
}: {
  bookmark: Bookmark | null;
}) {
  if (!bookmark) return null;
  return (
    <div className="flex items-center gap-2 px-3 pb-2">
      <Favicon bookmark={bookmark} className="h-4 w-4 flex-shrink-0" />
      <p className="text-sm text-muted-foreground truncate">{bookmark.url}</p>
    </div>
  );
}
