import { useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  BookOpen,
  Download,
  Globe,
  Loader2,
  Monitor,
  Plus,
  Smartphone,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { GroupedItemList, ListPageLayout } from "@/components/list-page";
import { useTags } from "@/hooks/use-tags";
import { TagEditor } from "@/components/shared/TagEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/list-page-utils";
import { normalizeApiUrl } from "@/lib/api-client";
import type { Bookmark } from "@/types/bookmark";
import { BookmarkListItem } from "./bookmarks/BookmarkListItem";
import { BookmarkTileItem } from "./bookmarks/BookmarkTileItem";
import { CreateBookmarkDialog } from "./bookmarks/CreateBookmarkDialog";
import { Favicon } from "./bookmarks/Favicon";
import { bookmarksConfig } from "./bookmarks/bookmarks-config";

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function BookmarksPage() {
  const { toast } = useToast();
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
  const [isEditMode, setIsEditMode] = useState(false);

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
    setIsEditMode(true);
    setIsBookmarkDialogOpen(true);
  }, []);

  // Create / Update handlers
  const handleCreateBookmark = async (url: string) => {
    try {
      await createBookmark({ url });
      setIsNewBookmarkDialogOpen(false);
      toast({
        title: "Bookmark Added",
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
      setIsEditMode(false);
      toast({
        title: "Bookmark updated",
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
        console.error("Import bookmarks error:", err);
      }
    },
    [toast, importBookmarks],
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
          toast({
            title: "File too large",
            description: "Please upload a file smaller than 5MB.",
            variant: "destructive",
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
      error={error instanceof Error ? error : error ? new Error(String(error)) : null}
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
            bookmark={bookmarks.find((b) => b.id === state.itemToDelete?.id) ?? null}
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

          {/* View/Edit Bookmark Dialog */}
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
                    {isEditMode ? (
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
                    ) : (
                      <>
                        <Label>Tags</Label>
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
                      </>
                    )}
                  </div>

                  {/* Details section (view mode only) */}
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
                                href={normalizeApiUrl(
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
                                href={normalizeApiUrl(
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
                                href={normalizeApiUrl(
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
                                href={normalizeApiUrl(
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
          className="grid gap-4 md:gap-6"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}
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
}: { bookmark: Bookmark | null }) {
  if (!bookmark) return null;
  return (
    <div className="flex items-center gap-2 px-3 pb-2">
      <Favicon
        bookmark={bookmark}
        className="h-4 w-4 flex-shrink-0"
      />
      <p className="text-sm text-muted-foreground truncate">
        {bookmark.url}
      </p>
    </div>
  );
}
