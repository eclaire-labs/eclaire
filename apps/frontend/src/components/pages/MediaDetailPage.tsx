import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  AudioWaveform,
  Calendar,
  Download,
  Edit,
  Loader2,
  MessageCircle,
  Save,
  Trash2,
  Video,
  X,
} from "lucide-react";

const routeApi = getRouteApi("/_authenticated/media/$id");

import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { useDetailPageActions } from "@/hooks/use-detail-page-actions";
import { useMediaItem } from "@/hooks/use-media";
import { apiFetch, normalizeApiUrl } from "@/lib/api-client";
import { formatDate } from "@/lib/date-utils";
import {
  formatBitrate,
  formatChannels,
  formatCodec,
  formatDuration,
  formatFileSize,
  formatFrameRate,
  formatResolution,
  formatSampleRate,
  formatVideoCodec,
} from "./media/media-utils";

export function MediaDetailClient() {
  const { id: mediaId } = routeApi.useParams();
  const navigate = useNavigate();

  // Use React Query hook for data fetching
  const { media, isLoading, error, refresh } = useMediaItem(mediaId);

  // Shared detail page actions (pin, flag, chat, delete, reprocess)
  const actions = useDetailPageActions({
    contentType: "media" as Parameters<
      typeof useDetailPageActions
    >[0]["contentType"],
    item: media,
    refresh,
    onDeleted: () => navigate({ to: "/media" }),
  });

  const [activeTab, setActiveTab] = useState("player");
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editDueDate, setEditDueDate] = useState<string | null>(null);

  // Initialize editing state when media loads
  useEffect(() => {
    if (media && !isEditing) {
      setEditTitle(media.title || "");
      setEditDescription(media.description || "");
      setEditTags(media.tags || []);
      setEditDueDate(media.dueDate || null);
    }
  }, [media, isEditing]);

  // Handle errors
  useEffect(() => {
    if (error) {
      toast.error("Error", {
        description:
          error instanceof Error
            ? error.message
            : "Failed to load media details.",
      });
      if (error.message.includes("not found")) {
        navigate({ to: "/media" });
      }
    }
  }, [error, navigate]);

  // Handle save changes
  const handleSave = async () => {
    if (!media) return;

    try {
      setIsSubmitting(true);
      const response = await apiFetch(`/api/media/${mediaId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editTitle,
          description: editDescription || null,
          tags: editTags,
          dueDate: editDueDate,
        }),
      });

      if (response.ok) {
        setIsEditing(false);
        refresh();
        toast.success("Media updated", {
          description: "Your changes have been saved successfully.",
        });
      } else {
        throw new Error("Failed to update media");
      }
    } catch (err) {
      console.error("Error updating media:", err);
      toast.error("Error", {
        description: "Failed to save changes.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cancel editing
  const handleCancel = () => {
    if (!media) return;
    setEditTitle(media.title || "");
    setEditDescription(media.description || "");
    setEditTags(media.tags || []);
    setEditDueDate(media.dueDate || null);
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate({ to: "/media" })}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-muted rounded animate-pulse" />
            <div className="h-8 w-8 bg-muted rounded animate-pulse" />
            <div className="h-8 w-8 bg-muted rounded animate-pulse" />
            <div className="h-8 w-16 bg-muted rounded animate-pulse" />
          </div>
        </div>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || (!isLoading && !media)) {
    const errorMessage =
      error instanceof Error ? error.message : "Media not found";
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: "/media" })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Media not found</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">{errorMessage}</h2>
          <p className="text-muted-foreground mb-4">
            The media you're looking for doesn't exist or couldn't be loaded.
          </p>
          <Button onClick={() => navigate({ to: "/media" })}>
            Go to Media
          </Button>
        </div>
      </div>
    );
  }

  // At this point media should be defined since we checked for loading/error above
  if (!media) return null;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate({ to: "/media" })}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              {isEditing ? (
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Enter media title..."
                  className="text-2xl font-bold h-auto py-2 px-3 border-dashed"
                />
              ) : (
                <h1 className="text-2xl font-bold">
                  {media.title || "Untitled Media"}
                </h1>
              )}
              <p className="text-muted-foreground mt-1">
                {media.originalFilename}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <PinFlagControls
              isPinned={media.isPinned || false}
              flagColor={media.flagColor}
              onPinToggle={actions.handlePinToggle}
              onFlagToggle={actions.handleFlagToggle}
              onFlagColorChange={actions.handleFlagColorChange}
              size="md"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={actions.handleChatClick}
              title="Chat about this media"
            >
              <MessageCircle className="h-4 w-4" />
            </Button>

            {isEditing ? (
              <>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isSubmitting}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={isSubmitting}>
                  <Save className="mr-2 h-4 w-4" />
                  {isSubmitting ? "Saving..." : "Save"}
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
                <Button variant="outline" asChild>
                  <a
                    href={normalizeApiUrl(media.mediaUrl)}
                    download
                    title="Download media"
                    aria-label="Download media"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </a>
                </Button>
                <Button onClick={() => setIsEditing(true)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-12rem)]">
          {/* Main Content */}
          <div className="flex-1 flex flex-col space-y-6">
            <Card>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <CardHeader>
                  <TabsList>
                    <TabsTrigger value="player">Player</TabsTrigger>
                    <TabsTrigger value="info">Info</TabsTrigger>
                  </TabsList>
                </CardHeader>
                <CardContent>
                  <TabsContent value="player" className="mt-0">
                    {media.mediaType === "video" ? (
                      <div className="flex flex-col items-center justify-center py-6 space-y-4">
                        <video
                          controls
                          className="w-full max-h-[500px] rounded-md"
                        >
                          <source src={media.mediaUrl} />
                          <track kind="captions" />
                        </video>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 space-y-6">
                        <AudioWaveform className="h-16 w-16 text-muted-foreground" />
                        <audio controls className="w-full">
                          <source src={media.mediaUrl} />
                          <track kind="captions" />
                        </audio>
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="info" className="mt-0">
                    <div className="space-y-6">
                      {/* Metadata Card */}
                      <Card>
                        <CardHeader>
                          <CardTitle>
                            {media.mediaType === "video"
                              ? "Video Metadata"
                              : "Audio Metadata"}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <Label className="text-xs text-muted-foreground font-medium">
                                Duration
                              </Label>
                              <p className="mt-0.5">
                                {formatDuration(media.duration)}
                              </p>
                            </div>
                            {media.mediaType === "video" ? (
                              <>
                                <div>
                                  <Label className="text-xs text-muted-foreground font-medium">
                                    Resolution
                                  </Label>
                                  <p className="mt-0.5">
                                    {formatResolution(
                                      media.width,
                                      media.height,
                                    )}
                                  </p>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground font-medium">
                                    Frame Rate
                                  </Label>
                                  <p className="mt-0.5">
                                    {formatFrameRate(media.frameRate)}
                                  </p>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground font-medium">
                                    Video Codec
                                  </Label>
                                  <p className="mt-0.5">
                                    {formatVideoCodec(media.videoCodec)}
                                  </p>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground font-medium">
                                    Audio Codec
                                  </Label>
                                  <p className="mt-0.5">
                                    {formatCodec(media.codec)}
                                  </p>
                                </div>
                              </>
                            ) : (
                              <>
                                <div>
                                  <Label className="text-xs text-muted-foreground font-medium">
                                    Codec
                                  </Label>
                                  <p className="mt-0.5">
                                    {formatCodec(media.codec)}
                                  </p>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground font-medium">
                                    Sample Rate
                                  </Label>
                                  <p className="mt-0.5">
                                    {formatSampleRate(media.sampleRate)}
                                  </p>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground font-medium">
                                    Channels
                                  </Label>
                                  <p className="mt-0.5">
                                    {formatChannels(media.channels)}
                                  </p>
                                </div>
                              </>
                            )}
                            <div>
                              <Label className="text-xs text-muted-foreground font-medium">
                                Bitrate
                              </Label>
                              <p className="mt-0.5">
                                {formatBitrate(media.bitrate)}
                              </p>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground font-medium">
                                File Size
                              </Label>
                              <p className="mt-0.5">
                                {formatFileSize(media.fileSize)}
                              </p>
                            </div>
                            <div className="col-span-2">
                              <Label className="text-xs text-muted-foreground font-medium">
                                Original Filename
                              </Label>
                              <p className="mt-0.5 truncate">
                                {media.originalFilename}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Transcript Card */}
                      <Card>
                        <CardHeader>
                          <CardTitle>Transcript</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {media.extractedText ? (
                            <div className="max-h-96 overflow-y-auto rounded-md bg-muted p-4">
                              <pre className="whitespace-pre-wrap text-sm font-mono">
                                <code>{media.extractedText}</code>
                              </pre>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">
                              No transcript available
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>
                </CardContent>
              </Tabs>
            </Card>

            {/* Description (editing mode) */}
            {isEditing && (
              <Card>
                <CardHeader>
                  <CardTitle>Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Add a description for this media..."
                    rows={4}
                  />
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="w-full lg:w-80 space-y-6">
            {/* Media Details */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4 text-sm">
                  <div>
                    <Label className="flex items-center gap-2">
                      {media.mediaType === "video" ? (
                        <Video className="h-4 w-4" />
                      ) : (
                        <AudioWaveform className="h-4 w-4" />
                      )}
                      File Type
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {media.mimeType}
                    </p>
                  </div>

                  <div>
                    <Label className="flex items-center gap-2">
                      {media.mediaType === "video" ? (
                        <Video className="h-4 w-4" />
                      ) : (
                        <AudioWaveform className="h-4 w-4" />
                      )}
                      File Size
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatFileSize(media.fileSize)}
                    </p>
                  </div>

                  <div>
                    <Label>Due Date</Label>
                    {isEditing ? (
                      <div className="mt-1">
                        <DueDatePicker
                          value={editDueDate}
                          onChange={setEditDueDate}
                        />
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">
                        {media.dueDate
                          ? formatDate(media.dueDate)
                          : "No due date set"}
                      </p>
                    )}
                  </div>

                  {/* Tags Section */}
                  <div>
                    {isEditing ? (
                      <TagEditor
                        tags={editTags}
                        onAddTag={(tag) =>
                          setEditTags((prev) => [...prev, tag])
                        }
                        onRemoveTag={(tag) =>
                          setEditTags((prev) => prev.filter((t) => t !== tag))
                        }
                      />
                    ) : (
                      <div>
                        <Label>Tags</Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {media.tags && media.tags.length > 0 ? (
                            media.tags.map((tag) => (
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
                      </div>
                    )}
                  </div>

                  {!isEditing && (
                    <>
                      <div>
                        <Label className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Uploaded
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          {formatDate(media.createdAt)}
                        </p>
                      </div>

                      <div>
                        <Label className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Updated
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          {formatDate(media.updatedAt)}
                        </p>
                      </div>

                      <div>
                        <Label>Processing Status</Label>
                        <div className="mt-1">
                          <ProcessingStatusBadge
                            contentType="media"
                            itemId={media.id}
                            processingStatus={media.processingStatus}
                            processingEnabled={media.processingEnabled}
                            isJobStuck={actions.isJobStuck}
                            isReprocessing={actions.isReprocessing}
                            onReprocessClick={() =>
                              actions.setShowReprocessDialog(true)
                            }
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          open={actions.isDeleteDialogOpen}
          onOpenChange={actions.setIsDeleteDialogOpen}
          label="Media"
          onConfirm={actions.confirmDelete}
          isDeleting={actions.isDeleting}
        >
          <div className="my-4 flex items-start gap-3 p-3 border rounded-md bg-muted/50">
            {media.mediaType === "video" ? (
              <Video className="h-6 w-6 flex-shrink-0 mt-0.5" />
            ) : (
              <AudioWaveform className="h-6 w-6 flex-shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium break-words line-clamp-2 leading-tight">
                {media.title || "Untitled Media"}
              </p>
              <p className="text-sm text-muted-foreground truncate mt-1">
                {media.originalFilename}
              </p>
            </div>
          </div>
        </DeleteConfirmDialog>

        {/* Reprocess Confirmation Dialog */}
        <ReprocessDialog
          open={actions.showReprocessDialog}
          onOpenChange={actions.setShowReprocessDialog}
          label="Media"
          description="This will re-extract metadata, regenerate transcripts, and reprocess all AI-generated data for this media file. This may take a few minutes."
          isReprocessing={actions.isReprocessing}
          onConfirm={actions.handleReprocess}
        />
      </div>
    </TooltipProvider>
  );
}
