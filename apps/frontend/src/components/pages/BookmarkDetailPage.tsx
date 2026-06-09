import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Calendar,
  Edit,
  ExternalLink,
  FileText,
  Globe,
  Languages,
  MessageCircle,
  Save,
  Trash2,
  User,
  X,
} from "lucide-react";

const routeApi = getRouteApi("/_authenticated/bookmarks/$id");

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { BookmarkAssetsCard } from "@/components/bookmarks/detail/BookmarkAssetsCard";
import { GitHubMetadataCard } from "@/components/bookmarks/detail/GitHubMetadataCard";
import { RedditMetadataCard } from "@/components/bookmarks/detail/RedditMetadataCard";
import { TwitterMetadataCard } from "@/components/bookmarks/detail/TwitterMetadataCard";
import { Favicon } from "@/components/bookmarks/Favicon";
import { ContentViewer } from "@/components/detail-page/ContentViewer";
import { DeleteConfirmDialog } from "@/components/detail-page/DeleteConfirmDialog";
import { ProcessingStatusBadge } from "@/components/detail-page/ProcessingStatusBadge";
import { ReprocessDialog } from "@/components/detail-page/ReprocessDialog";
import { DueDatePicker } from "@/components/shared/due-date-picker";
import { PageError, PageLoading } from "@/components/shared/page-state";
import { PinFlagControls } from "@/components/shared/pin-flag-controls";
import { TagEditor } from "@/components/shared/TagEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useBookmark } from "@/hooks/use-bookmarks";
import { useDetailPageActions } from "@/hooks/use-detail-page-actions";
import { normalizeApiUrl } from "@/lib/api-client";
import { formatDate } from "@/lib/date-utils";
import type { Bookmark } from "@/types/bookmark";

const getDomainFromUrl = (url: string) => {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch (_e) {
    return url;
  }
};

export function BookmarkDetailClient() {
  const { id: bookmarkId } = routeApi.useParams();
  const navigate = useNavigate();
  const [localBookmark, setLocalBookmark] = useState<Bookmark | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState("screenshot");

  // Use React Query hook for data fetching
  const { bookmark, isLoading, error, refresh, update } =
    useBookmark(bookmarkId);

  // Shared detail page actions (pin, flag, chat, delete, reprocess)
  const actions = useDetailPageActions({
    contentType: "bookmarks",
    item: bookmark,
    refresh,
    onDeleted: () => navigate({ to: "/bookmarks" }),
  });

  // Initialize local bookmark state for editing
  useEffect(() => {
    if (bookmark && !isEditMode) {
      setLocalBookmark(bookmark);
    }
  }, [bookmark, isEditMode]);

  const handleUpdateBookmark = async () => {
    if (!localBookmark) return;
    try {
      await update({
        title: localBookmark.title,
        description: localBookmark.description,
        tags: localBookmark.tags,
        dueDate: localBookmark.dueDate,
      });
      setIsEditMode(false);
      toast.success("Bookmark updated", {
        description: "Your bookmark has been updated successfully.",
      });
    } catch {
      // Error toast is shown by the hook.
    }
  };

  if (isLoading) {
    return <PageLoading variant="detail" backTo="/bookmarks" />;
  }

  if (error || (!isLoading && !bookmark)) {
    const errorMessage =
      error instanceof Error ? error.message : "Bookmark not found";
    return (
      <PageError
        title={errorMessage}
        message="The bookmark you're looking for doesn't exist or couldn't be loaded."
        backTo="/bookmarks"
        backLabel="Go to Bookmarks"
      />
    );
  }

  // At this point bookmark should be defined since we checked for loading/error above
  if (!bookmark) return null;

  const mainScreenshotUrl = bookmark.screenshotUrl || bookmark.thumbnailUrl;

  const faviconUrl = bookmark.faviconUrl
    ? normalizeApiUrl(bookmark.faviconUrl)
    : null;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate({ to: "/bookmarks" })}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              {isEditMode ? (
                <Input
                  value={localBookmark?.title || ""}
                  onChange={(e) =>
                    setLocalBookmark(
                      localBookmark
                        ? { ...localBookmark, title: e.target.value }
                        : null,
                    )
                  }
                  placeholder="Enter bookmark title..."
                  className="text-2xl font-bold h-auto py-2 px-3 border-dashed"
                />
              ) : (
                <h1 className="text-2xl font-bold">
                  {bookmark.title || "Untitled Bookmark"}
                </h1>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PinFlagControls
              size="md"
              isPinned={bookmark.isPinned || false}
              flagColor={bookmark.flagColor}
              onPinToggle={actions.handlePinToggle}
              onFlagToggle={actions.handleFlagToggle}
              onFlagColorChange={actions.handleFlagColorChange}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={actions.handleChatClick}
              title="Chat about this bookmark"
            >
              <MessageCircle className="h-4 w-4" />
            </Button>
            {isEditMode ? (
              <>
                <Button variant="outline" onClick={() => setIsEditMode(false)}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button onClick={handleUpdateBookmark}>
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="destructive"
                  onClick={actions.openDeleteDialog}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.open(bookmark.url, "_blank")}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Visit
                </Button>
                <Button onClick={() => setIsEditMode(true)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-12rem)]">
          {/* Main Content */}
          <div className="flex-1 flex flex-col space-y-6">
            {/* URL and Description Section */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <Label>URL</Label>
                  <div className="flex items-center gap-2 mt-1">
                    {faviconUrl && (
                      <img
                        src={faviconUrl}
                        alt="Favicon"
                        className="h-4 w-4 flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    )}
                    <p className="text-sm text-muted-foreground break-all">
                      {bookmark.url}
                    </p>
                  </div>
                </div>

                <div>
                  <Label>Description</Label>
                  <div className="mt-1">
                    {isEditMode ? (
                      <Textarea
                        value={localBookmark?.description || ""}
                        onChange={(e) =>
                          setLocalBookmark(
                            localBookmark
                              ? {
                                  ...localBookmark,
                                  description: e.target.value,
                                }
                              : null,
                          )
                        }
                        placeholder="Enter description..."
                        className="min-h-[100px]"
                      />
                    ) : (
                      <p className="text-muted-foreground">
                        {bookmark.description || "No description available."}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Screenshot / Content Section */}
            {(bookmark.pdfUrl || mainScreenshotUrl || bookmark.contentUrl) && (
              <Card>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <CardHeader>
                    <TabsList>
                      <TabsTrigger
                        value="screenshot"
                        disabled={!bookmark.pdfUrl && !mainScreenshotUrl}
                      >
                        Preview
                      </TabsTrigger>
                      <TabsTrigger
                        value="content"
                        disabled={!bookmark.contentUrl}
                      >
                        Content
                      </TabsTrigger>
                    </TabsList>
                  </CardHeader>
                  <CardContent>
                    <TabsContent value="screenshot" className="mt-0">
                      {bookmark.pdfUrl ? (
                        <object
                          data={`${normalizeApiUrl(bookmark.pdfUrl)}?view=inline`}
                          type="application/pdf"
                          className="w-full h-[60vh] rounded-lg"
                        >
                          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <FileText className="h-8 w-8 mb-2" />
                            <p className="text-sm mb-2">
                              PDF preview not supported in this browser.
                            </p>
                            <Button variant="outline" asChild>
                              <a
                                href={normalizeApiUrl(bookmark.pdfUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Open PDF
                              </a>
                            </Button>
                          </div>
                        </object>
                      ) : mainScreenshotUrl ? (
                        <div className="aspect-video w-full bg-muted overflow-hidden rounded-lg">
                          <img
                            src={mainScreenshotUrl}
                            alt={`Screenshot of ${bookmark.title}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : null}
                    </TabsContent>
                    <TabsContent value="content" className="mt-0">
                      <ContentViewer
                        contentUrl={bookmark.contentUrl}
                        isActive={activeTab === "content"}
                      />
                    </TabsContent>
                  </CardContent>
                </Tabs>
              </Card>
            )}
          </div>

          {/* Right Sidebar */}
          <div className="w-full lg:w-80 space-y-6">
            {/* Details Section */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <Label className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Created
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatDate(bookmark.createdAt)}
                  </p>
                </div>

                <div>
                  <Label className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Updated
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatDate(bookmark.updatedAt)}
                  </p>
                </div>

                <div>
                  <Label className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Due Date
                  </Label>
                  {isEditMode ? (
                    <div className="mt-1">
                      <DueDatePicker
                        value={localBookmark?.dueDate || null}
                        onChange={(value) =>
                          setLocalBookmark(
                            localBookmark
                              ? {
                                  ...localBookmark,
                                  dueDate: value,
                                }
                              : null,
                          )
                        }
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">
                      {bookmark.dueDate
                        ? formatDate(bookmark.dueDate)
                        : "No due date set"}
                    </p>
                  )}
                </div>

                <div>
                  <Label className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Domain
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {getDomainFromUrl(bookmark.url)}
                  </p>
                </div>

                {bookmark.author && (
                  <div>
                    <Label className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Author
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {bookmark.author}
                    </p>
                  </div>
                )}

                <div>
                  <Label>Tags</Label>
                  {isEditMode ? (
                    <TagEditor
                      tags={localBookmark?.tags || []}
                      onAddTag={(tag) =>
                        setLocalBookmark(
                          localBookmark
                            ? {
                                ...localBookmark,
                                tags: [...localBookmark.tags, tag],
                              }
                            : null,
                        )
                      }
                      onRemoveTag={(tag) =>
                        setLocalBookmark(
                          localBookmark
                            ? {
                                ...localBookmark,
                                tags: localBookmark.tags.filter(
                                  (t) => t !== tag,
                                ),
                              }
                            : null,
                        )
                      }
                    />
                  ) : (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {bookmark.tags.length > 0 ? (
                        bookmark.tags.map((tag) => (
                          <Badge key={tag} variant="outline">
                            {tag}
                          </Badge>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No tags</p>
                      )}
                    </div>
                  )}
                </div>

                {bookmark.lang && (
                  <div>
                    <Label className="flex items-center gap-2">
                      <Languages className="h-4 w-4" />
                      Language
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {bookmark.lang}
                    </p>
                  </div>
                )}

                <div>
                  <Label>Processing Status</Label>
                  <div className="mt-1">
                    <ProcessingStatusBadge
                      contentType="bookmarks"
                      itemId={bookmark.id}
                      processingStatus={bookmark.processingStatus}
                      processingEnabled={bookmark.processingEnabled}
                      isJobStuck={actions.isJobStuck}
                      isReprocessing={actions.isReprocessing}
                      onReprocessClick={() =>
                        actions.setShowReprocessDialog(true)
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* GitHub Repository Section */}
            <GitHubMetadataCard bookmark={bookmark} />

            {/* Twitter Tweet Section */}
            <TwitterMetadataCard bookmark={bookmark} />

            {/* Reddit Post Section */}
            <RedditMetadataCard bookmark={bookmark} />

            {/* Assets Section */}
            <BookmarkAssetsCard bookmark={bookmark} />
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          open={actions.isDeleteDialogOpen}
          onOpenChange={actions.setIsDeleteDialogOpen}
          label="Bookmark"
          onConfirm={actions.confirmDelete}
          isDeleting={actions.isDeleting}
        >
          {bookmark && (
            <div className="my-4 flex items-start gap-3 p-3 border rounded-md bg-muted/50">
              <Favicon
                bookmark={bookmark}
                className="h-6 w-6 flex-shrink-0 mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium break-words line-clamp-2 leading-tight">
                  {bookmark.title || "Untitled"}
                </p>
                <p className="text-sm text-muted-foreground truncate mt-1">
                  {bookmark.url}
                </p>
              </div>
            </div>
          )}
        </DeleteConfirmDialog>

        {/* Reprocess Confirmation Dialog */}
        <ReprocessDialog
          open={actions.showReprocessDialog}
          onOpenChange={actions.setShowReprocessDialog}
          label="Bookmark"
          description="This will re-scrape the URL, take new screenshots, and reprocess all data for this bookmark. This may take a few minutes."
          isReprocessing={actions.isReprocessing}
          onConfirm={actions.handleReprocess}
        />
      </div>
    </TooltipProvider>
  );
}
