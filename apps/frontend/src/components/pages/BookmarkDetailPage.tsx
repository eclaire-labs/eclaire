import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Calendar,
  Clock,
  Code,
  Download,
  Edit,
  ExternalLink,
  Eye,
  FileText,
  GitFork,
  Github,
  Globe,
  Heart,
  Languages,
  Link,
  Loader2,
  MessageCircle,
  Monitor,
  Package,
  Repeat,
  Shield,
  Smartphone,
  Star,
  Save,
  Tag,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";

const routeApi = getRouteApi("/_authenticated/bookmarks/$id");

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ContentViewer } from "@/components/detail-page/ContentViewer";
import { DeleteConfirmDialog } from "@/components/detail-page/DeleteConfirmDialog";
import { ProcessingStatusBadge } from "@/components/detail-page/ProcessingStatusBadge";
import { ReprocessDialog } from "@/components/detail-page/ReprocessDialog";
import { DueDatePicker } from "@/components/shared/due-date-picker";
import { PinFlagControls } from "@/components/shared/pin-flag-controls";
import { TagEditor } from "@/components/shared/TagEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useBookmark } from "@/hooks/use-bookmarks";
import { useDetailPageActions } from "@/hooks/use-detail-page-actions";
import { apiFetch, normalizeApiUrl } from "@/lib/api-client";
import { formatDate } from "@/lib/date-utils";
import type {
  Bookmark,
  GitHubMetadata,
  RedditMetadata,
  TwitterMetadata,
} from "@/types/bookmark";

const getDomainFromUrl = (url: string) => {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch (_e) {
    return url;
  }
};

const formatCount = (count: number) => {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  } else if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
};

const isGitHubRepository = (
  bookmark: Bookmark,
): bookmark is Bookmark & {
  rawMetadata: { github: GitHubMetadata };
} => {
  return !!(
    bookmark.rawMetadata?.github &&
    bookmark.url.toLowerCase().includes("github.com")
  );
};

const isTwitterBookmark = (
  bookmark: Bookmark,
): bookmark is Bookmark & {
  rawMetadata: { twitter: TwitterMetadata };
} => {
  return !!(
    bookmark.rawMetadata?.twitter &&
    (bookmark.url.toLowerCase().includes("twitter.com") ||
      bookmark.url.toLowerCase().includes("x.com"))
  );
};

const isRedditBookmark = (
  bookmark: Bookmark,
): bookmark is Bookmark & {
  rawMetadata: { reddit: RedditMetadata };
} => {
  return !!(
    bookmark.rawMetadata?.reddit &&
    bookmark.url.toLowerCase().includes("reddit.com")
  );
};

export function BookmarkDetailClient() {
  const { id: bookmarkId } = routeApi.useParams();
  const navigate = useNavigate();
  const [localBookmark, setLocalBookmark] = useState<Bookmark | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState("screenshot");

  // Use React Query hook for data fetching
  const { bookmark, isLoading, error, refresh } = useBookmark(bookmarkId);

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
      const response = await apiFetch(`/api/bookmarks/${localBookmark.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: localBookmark.title,
          description: localBookmark.description,
          tags: localBookmark.tags,
          dueDate: localBookmark.dueDate,
        }),
      });

      if (response.ok) {
        setIsEditMode(false);
        // Refresh to get the latest data from server
        refresh();
        toast.success("Bookmark updated", {
          description: "Your bookmark has been updated successfully.",
        });
      } else {
        toast.error("Error", {
          description: "Failed to update bookmark",
        });
      }
    } catch (error) {
      console.error("Error updating bookmark:", error);
      toast.error("Error", {
        description: "Failed to update bookmark",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate({ to: "/bookmarks" })}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="h-8 w-48 bg-muted rounded animate-pulse"></div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-muted rounded animate-pulse"></div>
            <div className="h-8 w-8 bg-muted rounded animate-pulse"></div>
            <div className="h-8 w-8 bg-muted rounded animate-pulse"></div>
            <div className="h-8 w-16 bg-muted rounded animate-pulse"></div>
          </div>
        </div>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || (!isLoading && !bookmark)) {
    const errorMessage =
      error instanceof Error ? error.message : "Bookmark not found";
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: "/bookmarks" })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Bookmark not found</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">{errorMessage}</h2>
          <p className="text-muted-foreground mb-4">
            The bookmark you're looking for doesn't exist or couldn't be loaded.
          </p>
          <Button onClick={() => navigate({ to: "/bookmarks" })}>
            Go to Bookmarks
          </Button>
        </div>
      </div>
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
            {bookmark && isGitHubRepository(bookmark) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Github className="h-4 w-4" />
                    GitHub Repository
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Repository Name */}
                  <div>
                    <Label>Repository</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        asChild
                      >
                        <a
                          href={
                            bookmark.rawMetadata.github.repositoryData.html_url
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2"
                        >
                          <Github className="h-4 w-4" />
                          {bookmark.rawMetadata.github.owner}/
                          {bookmark.rawMetadata.github.repo}
                          <ExternalLink className="h-3 w-3 ml-auto" />
                        </a>
                      </Button>
                    </div>
                  </div>

                  {/* Stars and Forks */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="flex items-center gap-2">
                        <Star className="h-4 w-4" />
                        Stars
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formatCount(bookmark.rawMetadata.github.stars)}
                      </p>
                    </div>
                    <div>
                      <Label className="flex items-center gap-2">
                        <GitFork className="h-4 w-4" />
                        Forks
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formatCount(bookmark.rawMetadata.github.forks)}
                      </p>
                    </div>
                  </div>

                  {/* Language */}
                  {bookmark.rawMetadata.github.language && (
                    <div>
                      <Label className="flex items-center gap-2">
                        <Code className="h-4 w-4" />
                        Language
                      </Label>
                      <Badge variant="outline" className="mt-1">
                        {bookmark.rawMetadata.github.language}
                      </Badge>
                    </div>
                  )}

                  {/* Topics */}
                  {bookmark.rawMetadata.github.topics &&
                    bookmark.rawMetadata.github.topics.length > 0 && (
                      <div>
                        <Label className="flex items-center gap-2">
                          <Tag className="h-4 w-4" />
                          Topics
                        </Label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {bookmark.rawMetadata.github.topics
                            .slice(0, 6)
                            .map((topic: string) => (
                              <Badge
                                key={topic}
                                variant="secondary"
                                className="text-xs"
                              >
                                {topic}
                              </Badge>
                            ))}
                          {bookmark.rawMetadata.github.topics.length > 6 && (
                            <Badge variant="secondary" className="text-xs">
                              +{bookmark.rawMetadata.github.topics.length - 6}{" "}
                              more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                  {/* Latest Release */}
                  {bookmark.rawMetadata.github.latestRelease && (
                    <div>
                      <Label className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Latest Release
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {bookmark.rawMetadata.github.latestRelease.version} -{" "}
                        {formatDate(
                          bookmark.rawMetadata.github.latestRelease.date,
                        )}
                      </p>
                    </div>
                  )}

                  {/* Last Commit */}
                  {bookmark.rawMetadata.github.lastCommitDate && (
                    <div>
                      <Label className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Last Commit
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formatDate(bookmark.rawMetadata.github.lastCommitDate)}
                      </p>
                    </div>
                  )}

                  {/* License */}
                  {bookmark.rawMetadata.github.license && (
                    <div>
                      <Label>License</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {bookmark.rawMetadata.github.license}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Twitter Tweet Section */}
            {bookmark && isTwitterBookmark(bookmark) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" />
                    Tweet Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Author Information */}
                  <div>
                    <Label>Author</Label>
                    <div className="flex items-center gap-3 mt-1">
                      {bookmark.rawMetadata.twitter.author_profile_image ? (
                        <img
                          src={
                            bookmark.rawMetadata.twitter.author_profile_image
                          }
                          alt={bookmark.rawMetadata.twitter.author_name}
                          className="h-8 w-8 rounded-full"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = "none";
                            const fallback =
                              target.nextElementSibling as HTMLElement;
                            if (fallback) fallback.style.display = "flex";
                          }}
                        />
                      ) : null}
                      <div
                        className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center"
                        style={{
                          display: bookmark.rawMetadata.twitter
                            .author_profile_image
                            ? "none"
                            : "flex",
                        }}
                      >
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-sm">
                            {bookmark.rawMetadata.twitter.author_name}
                          </span>
                          {bookmark.rawMetadata.twitter
                            .author_verified_type && (
                            <Shield className="h-3 w-3 text-blue-500" />
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          @{bookmark.rawMetadata.twitter.author_username}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tweet Type and Content Stats */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Tweet Type</Label>
                      <div className="mt-1">
                        <Badge variant="outline" className="capitalize">
                          {bookmark.rawMetadata.twitter.tweet_type}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <Label>Age Category</Label>
                      <div className="mt-1">
                        <Badge
                          variant={
                            bookmark.rawMetadata.twitter.age_category ===
                            "older"
                              ? "default"
                              : bookmark.rawMetadata.twitter.age_category ===
                                  "fresh"
                                ? "secondary"
                                : "outline"
                          }
                          className="capitalize"
                        >
                          {bookmark.rawMetadata.twitter.age_category}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Engagement Stats */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="flex items-center gap-2">
                        <Heart className="h-4 w-4" />
                        Likes
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formatCount(bookmark.rawMetadata.twitter.likes)}
                      </p>
                    </div>
                    <div>
                      <Label className="flex items-center gap-2">
                        <Repeat className="h-4 w-4" />
                        Retweets
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formatCount(bookmark.rawMetadata.twitter.retweets)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="flex items-center gap-2">
                        <MessageCircle className="h-4 w-4" />
                        Replies
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formatCount(bookmark.rawMetadata.twitter.replies)}
                      </p>
                    </div>
                    <div>
                      <Label className="flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        Impressions
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {bookmark.rawMetadata.twitter.impressions > 0
                          ? formatCount(
                              bookmark.rawMetadata.twitter.impressions,
                            )
                          : "N/A"}
                      </p>
                    </div>
                  </div>

                  {/* Quotes */}
                  {bookmark.rawMetadata.twitter.quotes > 0 && (
                    <div>
                      <Label className="flex items-center gap-2">Quotes</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formatCount(bookmark.rawMetadata.twitter.quotes)}
                      </p>
                    </div>
                  )}

                  {/* Media and Links */}
                  {(bookmark.rawMetadata.twitter.has_media ||
                    bookmark.rawMetadata.twitter.has_links) && (
                    <div className="grid grid-cols-2 gap-4">
                      {bookmark.rawMetadata.twitter.has_media && (
                        <div>
                          <Label>Media</Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            {bookmark.rawMetadata.twitter.media_count} media
                            item(s)
                          </p>
                        </div>
                      )}
                      {bookmark.rawMetadata.twitter.has_links && (
                        <div>
                          <Label>Links</Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            {bookmark.rawMetadata.twitter.link_count} external
                            link(s)
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Content Stats */}
                  <div>
                    <Label>Content Length</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {bookmark.rawMetadata.twitter.text_length} characters
                    </p>
                  </div>

                  {/* Posted Date */}
                  <div>
                    <Label className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Posted
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatDate(bookmark.rawMetadata.twitter.created_at)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Reddit Post Section */}
            {bookmark && isRedditBookmark(bookmark) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" />
                    Reddit Post Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Subreddit Information */}
                  <div>
                    <Label>Subreddit</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            r/{bookmark.rawMetadata.reddit.subreddit_name}
                          </span>
                          {bookmark.rawMetadata.reddit
                            .subreddit_subscribers && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Users className="h-3 w-3" />
                              {formatCount(
                                bookmark.rawMetadata.reddit
                                  .subreddit_subscribers,
                              )}{" "}
                              members
                            </div>
                          )}
                        </div>
                        {bookmark.rawMetadata.reddit.subreddit_description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {bookmark.rawMetadata.reddit.subreddit_description.slice(
                              0,
                              100,
                            )}
                            {bookmark.rawMetadata.reddit.subreddit_description
                              .length > 100
                              ? "..."
                              : ""}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Post Type and Age */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Post Type</Label>
                      <div className="mt-1">
                        <Badge variant="outline" className="capitalize">
                          {bookmark.rawMetadata.reddit.post_type}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <Label>Age Category</Label>
                      <div className="mt-1">
                        <Badge
                          variant={
                            bookmark.rawMetadata.reddit.age_category === "fresh"
                              ? "default"
                              : bookmark.rawMetadata.reddit.age_category ===
                                  "recent"
                                ? "secondary"
                                : "outline"
                          }
                          className="capitalize"
                        >
                          {bookmark.rawMetadata.reddit.age_category}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Engagement Stats */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="flex items-center gap-2">
                        <ArrowUp className="h-4 w-4" />
                        Score
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formatCount(bookmark.rawMetadata.reddit.score)} points
                      </p>
                    </div>
                    <div>
                      <Label className="flex items-center gap-2">
                        <MessageCircle className="h-4 w-4" />
                        Comments
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formatCount(bookmark.rawMetadata.reddit.num_comments)}
                      </p>
                    </div>
                  </div>

                  {/* Upvote Ratio */}
                  <div>
                    <Label>Upvote Ratio</Label>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-sm text-muted-foreground">
                        {Math.round(
                          bookmark.rawMetadata.reddit.upvote_ratio * 100,
                        )}
                        % upvoted
                      </p>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-orange-500 transition-all duration-300"
                          style={{
                            width: `${bookmark.rawMetadata.reddit.upvote_ratio * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* External Domain (for link posts) */}
                  {bookmark.rawMetadata.reddit.external_domain && (
                    <div>
                      <Label className="flex items-center gap-2">
                        <Link className="h-4 w-4" />
                        External Link
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {bookmark.rawMetadata.reddit.external_domain}
                      </p>
                    </div>
                  )}

                  {/* Content Stats */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Content Length</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {bookmark.rawMetadata.reddit.text_length} characters
                      </p>
                    </div>
                    {bookmark.rawMetadata.reddit.has_media && (
                      <div>
                        <Label>Media</Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Contains media content
                        </p>
                      </div>
                    )}
                  </div>

                  {/* View Count (if available) */}
                  {bookmark.rawMetadata.reddit.view_count && (
                    <div>
                      <Label className="flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        Views
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formatCount(bookmark.rawMetadata.reddit.view_count)}
                      </p>
                    </div>
                  )}

                  {/* Posted Date */}
                  <div>
                    <Label className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Posted
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatDate(bookmark.rawMetadata.reddit.created_utc)}
                    </p>
                  </div>

                  {/* Edited Date (if available) */}
                  {bookmark.rawMetadata.reddit.edited_utc && (
                    <div>
                      <Label className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Last Edited
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formatDate(bookmark.rawMetadata.reddit.edited_utc)}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Assets Section */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                {/* Screenshots */}
                <div>
                  <Label>Screenshots</Label>
                  <div className="space-y-2 mt-1">
                    {bookmark.screenshotUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        asChild
                      >
                        <a
                          href={normalizeApiUrl(bookmark.screenshotUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Monitor className="mr-2 h-4 w-4" />
                          Desktop View
                        </a>
                      </Button>
                    )}
                    {bookmark.screenshotMobileUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        asChild
                      >
                        <a
                          href={normalizeApiUrl(bookmark.screenshotMobileUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Smartphone className="mr-2 h-4 w-4" />
                          Mobile View
                        </a>
                      </Button>
                    )}
                    {bookmark.screenshotFullPageUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        asChild
                      >
                        <a
                          href={normalizeApiUrl(bookmark.screenshotFullPageUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Globe className="mr-2 h-4 w-4" />
                          Full Page View
                        </a>
                      </Button>
                    )}
                    {!bookmark.thumbnailUrl &&
                      !bookmark.screenshotMobileUrl &&
                      !bookmark.screenshotFullPageUrl && (
                        <p className="text-sm text-muted-foreground">
                          No screenshots available yet.
                        </p>
                      )}
                  </div>
                </div>

                {/* Content */}
                <div>
                  <Label>Content</Label>
                  <div className="space-y-2 mt-1">
                    {bookmark.pdfUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        asChild
                      >
                        <a
                          href={normalizeApiUrl(bookmark.pdfUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Download className="mr-2 h-4 w-4" />
                          PDF Version
                        </a>
                      </Button>
                    )}
                    {bookmark.contentUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        asChild
                      >
                        <a
                          href={normalizeApiUrl(bookmark.contentUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          Extracted Markdown
                        </a>
                      </Button>
                    )}
                    {bookmark.readableUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        asChild
                      >
                        <a
                          href={normalizeApiUrl(bookmark.readableUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Globe className="mr-2 h-4 w-4" />
                          Readable Version
                        </a>
                      </Button>
                    )}
                    {bookmark.readmeUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        asChild
                      >
                        <a
                          href={normalizeApiUrl(bookmark.readmeUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <BookOpen className="mr-2 h-4 w-4" />
                          README.md
                        </a>
                      </Button>
                    )}
                    {!bookmark.pdfUrl &&
                      !bookmark.contentUrl &&
                      !bookmark.readableUrl &&
                      !bookmark.readmeUrl && (
                        <p className="text-sm text-muted-foreground">
                          No content available yet.
                        </p>
                      )}
                  </div>
                </div>
              </CardContent>
            </Card>
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

// Reusable Favicon component with fallback
function Favicon({
  bookmark,
  className,
}: {
  bookmark: Bookmark;
  className?: string;
}) {
  const [error, setError] = useState(false);
  const faviconUrl = bookmark.faviconUrl
    ? normalizeApiUrl(bookmark.faviconUrl)
    : null;

  useEffect(() => {
    setError(false); // Reset error state when bookmark changes
  }, []);

  if (error || !faviconUrl) {
    return <Link className={className} />;
  }

  return (
    <img
      src={faviconUrl}
      alt="favicon"
      className={className}
      onError={() => setError(true)}
    />
  );
}
