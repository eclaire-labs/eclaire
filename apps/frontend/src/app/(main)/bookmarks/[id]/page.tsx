"use client";

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
  MessageSquare,
  Monitor,
  Package,
  RefreshCw,
  Repeat,
  Shield,
  Smartphone,
  Star,
  Tag,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DueDatePicker } from "@/components/ui/due-date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PinFlagControls } from "@/components/ui/pin-flag-controls";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useBookmark } from "@/hooks/use-bookmarks";
import { useProcessingEvents } from "@/hooks/use-processing-status";
import { useToast } from "@/hooks/use-toast";
import {
  apiFetch,
  getAbsoluteApiUrl,
  setFlagColor,
  togglePin,
} from "@/lib/frontend-api";
import type {
  Bookmark,
  GitHubMetadata,
  RedditMetadata,
  TwitterMetadata,
} from "@/types/bookmark";

const formatDate = (date: number | string | null | undefined) => {
  if (!date) return "N/A";
  try {
    let dateObj: Date;
    if (typeof date === "string") {
      // Handle ISO date strings
      dateObj = new Date(date);
    } else {
      // Handle Unix timestamps
      dateObj = new Date(date * 1000);
    }

    if (isNaN(dateObj.getTime())) {
      return "Invalid Date";
    }

    return dateObj.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (error) {
    console.error("Error formatting date:", date, error);
    return "Invalid Date";
  }
};

const getDomainFromUrl = (url: string) => {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch (e) {
    return url;
  }
};

const formatCount = (count: number) => {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + "M";
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + "K";
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

export default function BookmarkDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [localBookmark, setLocalBookmark] = useState<Bookmark | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [showReprocessDialog, setShowReprocessDialog] = useState(false);
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] =
    useState(false);
  const [bookmarkToDelete, setBookmarkToDelete] = useState<Bookmark | null>(
    null,
  );

  const bookmarkId = params.id as string;

  // Use React Query hook for data fetching
  const { bookmark, isLoading, error, refresh } = useBookmark(bookmarkId);

  // Initialize SSE for real-time updates
  useProcessingEvents();

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
        toast({
          title: "Bookmark updated",
          description: "Your bookmark has been updated successfully.",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to update bookmark",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error updating bookmark:", error);
      toast({
        title: "Error",
        description: "Failed to update bookmark",
        variant: "destructive",
      });
    }
  };

  const handleAddTag = () => {
    if (!tagInput.trim() || !localBookmark) return;
    const tag = tagInput.trim().toLowerCase();
    if (isEditMode && !localBookmark.tags.includes(tag)) {
      setLocalBookmark({
        ...localBookmark,
        tags: [...localBookmark.tags, tag],
      });
    }
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    if (isEditMode && localBookmark) {
      setLocalBookmark({
        ...localBookmark,
        tags: localBookmark.tags.filter((t) => t !== tag),
      });
    }
  };

  const handlePinToggle = async () => {
    if (!bookmark) return;

    try {
      const response = await togglePin(
        "bookmarks",
        bookmark.id,
        !bookmark.isPinned,
      );
      if (response.ok) {
        const updatedBookmark = await response.json();
        // Refresh to get latest data from server
        refresh();
        toast({
          title: updatedBookmark.isPinned ? "Pinned" : "Unpinned",
          description: `Bookmark has been ${updatedBookmark.isPinned ? "pinned" : "unpinned"}.`,
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to update pin status",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error toggling pin:", error);
      toast({
        title: "Error",
        description: "Failed to update pin status",
        variant: "destructive",
      });
    }
  };

  const handleFlagToggle = async () => {
    if (!bookmark) return;
    await handleFlagColorChange(bookmark.flagColor ? null : "orange");
  };

  const handleDelete = () => {
    if (!bookmark) return;
    setBookmarkToDelete(bookmark);
    setIsConfirmDeleteDialogOpen(true);
  };

  const handleDeleteConfirmed = async () => {
    if (!bookmarkToDelete) return;

    try {
      const response = await apiFetch(`/api/bookmarks/${bookmarkToDelete.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setIsConfirmDeleteDialogOpen(false);
        setBookmarkToDelete(null);
        toast({
          title: "Bookmark deleted",
          description: "Your bookmark has been deleted.",
        });
        router.push("/bookmarks");
      } else {
        toast({
          title: "Error",
          description: "Failed to delete bookmark",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error deleting bookmark:", error);
      toast({
        title: "Error",
        description: "Failed to delete bookmark",
        variant: "destructive",
      });
    }
  };

  const handleChatClick = () => {
    if (!bookmark) return;

    // Use the global function to open assistant with pre-attached assets
    if (
      typeof window !== "undefined" &&
      (window as any).openAssistantWithAssets
    ) {
      (window as any).openAssistantWithAssets([
        {
          type: "bookmark",
          id: bookmark.id,
          title: bookmark.title,
        },
      ]);
    }
  };

  const handleFlagColorChange = async (
    color: "red" | "yellow" | "orange" | "green" | "blue" | null,
  ) => {
    if (!bookmark) return;

    try {
      const response = await setFlagColor("bookmarks", bookmark.id, color);
      if (response.ok) {
        // Refresh to get latest data from server
        refresh();
        toast({
          title: color ? "Flag Updated" : "Flag Removed",
          description: color
            ? `Bookmark flag changed to ${color}.`
            : "Flag removed from bookmark.",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to update flag color",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error changing flag color:", error);
      toast({
        title: "Error",
        description: "Failed to update flag color",
        variant: "destructive",
      });
    }
  };

  // Helper function to detect stuck processing jobs
  const isJobStuck = (bookmark: Bookmark) => {
    if (!bookmark.processingStatus) return false;

    const now = Date.now();
    const fifteenMinutesAgo = now - 15 * 60 * 1000;

    // Job is stuck if:
    // 1. Status is "pending" and created >15 minutes ago, OR
    // 2. Status is "processing" and not updated >15 minutes ago
    return (
      (bookmark.processingStatus === "pending" &&
        new Date(bookmark.createdAt).getTime() < fifteenMinutesAgo) ||
      (bookmark.processingStatus === "processing" &&
        new Date(bookmark.updatedAt).getTime() < fifteenMinutesAgo)
    );
  };

  const handleReprocess = async () => {
    if (!bookmark) return;

    try {
      setIsReprocessing(true);
      setShowReprocessDialog(false);

      const isStuck = isJobStuck(bookmark);
      const response = await apiFetch(
        `/api/bookmarks/${bookmark.id}/reprocess`,
        {
          method: "POST",
          ...(isStuck && {
            body: JSON.stringify({ force: true }),
            headers: { "Content-Type": "application/json" },
          }),
        },
      );

      if (response.ok) {
        toast({
          title: "Reprocessing Started",
          description:
            "Your bookmark has been queued for reprocessing. This may take a few minutes.",
        });

        // SSE events will automatically update the processing status
        // No need to manually update state
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.error || "Failed to reprocess bookmark",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error reprocessing bookmark:", error);
      toast({
        title: "Error",
        description: "Failed to reprocess bookmark",
        variant: "destructive",
      });
    } finally {
      setIsReprocessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
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
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
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
          <Button onClick={() => router.push("/bookmarks")}>
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
    ? getAbsoluteApiUrl(bookmark.faviconUrl)
    : null;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
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
              onPinToggle={handlePinToggle}
              onFlagToggle={handleFlagToggle}
              onFlagColorChange={handleFlagColorChange}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleChatClick}
              title="Chat about this bookmark"
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
            {isEditMode ? (
              <>
                <Button variant="outline" onClick={() => setIsEditMode(false)}>
                  Cancel
                </Button>
                <Button onClick={handleUpdateBookmark}>Save Changes</Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={handleDelete}
                  className="text-red-600 hover:text-red-700"
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

            {/* Screenshot Section */}
            {mainScreenshotUrl && (
              <Card>
                <CardHeader>
                  <CardTitle>Screenshot</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="aspect-video w-full bg-muted overflow-hidden rounded-lg">
                    <img
                      src={mainScreenshotUrl}
                      alt={`Screenshot of ${bookmark.title}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </CardContent>
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
                    <div className="mt-1">
                      <div className="flex flex-wrap gap-2 mb-2">
                        {(localBookmark?.tags || []).map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="flex items-center gap-1"
                          >
                            {tag}
                            <button
                              type="button"
                              className="h-4 w-4 ml-1 hover:bg-muted-foreground/20 rounded"
                              onClick={() => handleRemoveTag(tag)}
                            >
                              ×
                            </button>
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
                  ) : (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {bookmark.tags.length > 0 ? (
                        bookmark.tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
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
                  <div className="mt-1 flex items-center gap-2">
                    <Badge
                      variant={
                        bookmark.enabled === false
                          ? "outline"
                          : bookmark.processingStatus === "completed"
                            ? "default"
                            : bookmark.processingStatus === "failed"
                              ? "destructive"
                              : "secondary"
                      }
                      className={`${bookmark.enabled !== false ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
                      onClick={
                        bookmark.enabled !== false
                          ? () => {
                              router.push(
                                `/processing?assetType=bookmarks&assetId=${bookmark.id}`,
                              );
                            }
                          : undefined
                      }
                      title={
                        bookmark.enabled !== false
                          ? "Click to view processing details"
                          : "Processing is disabled for this bookmark"
                      }
                    >
                      {bookmark.enabled === false
                        ? "disabled"
                        : bookmark.processingStatus || "unknown"}
                    </Badge>

                    {/* Show reprocess button for completed, failed, or stuck jobs but not disabled */}
                    {bookmark.enabled !== false &&
                      (bookmark.processingStatus === "completed" ||
                        bookmark.processingStatus === "failed" ||
                        isJobStuck(bookmark)) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowReprocessDialog(true)}
                          disabled={isReprocessing}
                          title="Reprocess bookmark"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      )}
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
                        <User className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-sm">
                            {bookmark.rawMetadata.twitter.author_name}
                          </span>
                          {bookmark.rawMetadata.twitter.author_verified && (
                            <Shield className="h-3 w-3 text-blue-500" />
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          @{bookmark.rawMetadata.twitter.author_screen_name}
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
                            "viral"
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
                        Views
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {bookmark.rawMetadata.twitter.views > 0
                          ? formatCount(bookmark.rawMetadata.twitter.views)
                          : "N/A"}
                      </p>
                    </div>
                  </div>

                  {/* Thread Information */}
                  {bookmark.rawMetadata.twitter.is_thread && (
                    <div>
                      <Label>Thread Information</Label>
                      <div className="mt-1 space-y-1">
                        <p className="text-sm text-muted-foreground">
                          This is part of a thread with{" "}
                          {bookmark.rawMetadata.twitter.reply_count_actual}{" "}
                          replies
                        </p>
                        {bookmark.rawMetadata.twitter.has_author_replies && (
                          <p className="text-xs text-muted-foreground">
                            • Author replied to their own tweet
                          </p>
                        )}
                      </div>
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
                    <MessageSquare className="h-4 w-4" />
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
                    {bookmark.thumbnailUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        asChild
                      >
                        <a
                          href={getAbsoluteApiUrl(bookmark.thumbnailUrl)}
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
                          href={getAbsoluteApiUrl(bookmark.screenshotMobileUrl)}
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
                          href={getAbsoluteApiUrl(
                            bookmark.screenshotFullPageUrl,
                          )}
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
                          href={getAbsoluteApiUrl(bookmark.pdfUrl)}
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
                          href={getAbsoluteApiUrl(bookmark.contentUrl)}
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
                          href={getAbsoluteApiUrl(bookmark.readableUrl)}
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
                          href={getAbsoluteApiUrl(bookmark.readmeUrl)}
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
        <Dialog
          open={isConfirmDeleteDialogOpen}
          onOpenChange={setIsConfirmDeleteDialogOpen}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm Deletion</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this bookmark? This action
                cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {bookmarkToDelete && (
              <div className="my-4 flex items-start gap-3 p-3 border rounded-md bg-muted/50">
                <Favicon
                  bookmark={bookmarkToDelete}
                  className="h-6 w-6 flex-shrink-0 mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words line-clamp-2 leading-tight">
                    {bookmarkToDelete.title || "Untitled"}
                  </p>
                  <p className="text-sm text-muted-foreground truncate mt-1">
                    {bookmarkToDelete.url}
                  </p>
                </div>
              </div>
            )}
            <DialogFooter className="sm:justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setIsConfirmDeleteDialogOpen(false);
                  setBookmarkToDelete(null);
                }}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteConfirmed}>
                Delete Bookmark
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reprocess Confirmation Dialog */}
        <Dialog
          open={showReprocessDialog}
          onOpenChange={setShowReprocessDialog}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reprocess Bookmark</DialogTitle>
              <DialogDescription>
                This will re-extract content, generate new tags, take fresh
                screenshots, and reprocess all AI-generated data for this
                bookmark. This may take a few minutes.
                <br />
                <br />
                Are you sure you want to continue?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowReprocessDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleReprocess}
                disabled={isReprocessing}
                className="flex items-center gap-2"
              >
                {isReprocessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Reprocessing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Reprocess
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
    ? getAbsoluteApiUrl(bookmark.faviconUrl)
    : null;

  useEffect(() => {
    setError(false); // Reset error state when bookmark changes
  }, [bookmark.id]);

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
