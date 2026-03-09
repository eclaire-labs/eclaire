import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Calendar,
  Camera,
  Download,
  Edit,
  ExternalLink,
  Eye,
  Loader2,
  MapPin,
  MessageSquare,
  RotateCcw,
  Save,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

const routeApi = getRouteApi("/_authenticated/photos/$id");

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DeleteConfirmDialog } from "@/components/detail-page/DeleteConfirmDialog";
import { ProcessingStatusBadge } from "@/components/detail-page/ProcessingStatusBadge";
import { ReprocessDialog } from "@/components/detail-page/ReprocessDialog";
import { PhotoAnalysisCard } from "@/components/photo-analysis";
import { DueDatePicker } from "@/components/shared/due-date-picker";
import { PinFlagControls } from "@/components/shared/pin-flag-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useDetailPageActions } from "@/hooks/use-detail-page-actions";
import { usePhotoAnalysis } from "@/hooks/use-photo-analysis";
import { usePhoto } from "@/hooks/use-photos";
import { apiFetch, normalizeApiUrl } from "@/lib/api-client";
import { formatDate, formatFileSize } from "@/lib/date-utils";

// Helper function to format camera settings
const formatExposureTime = (exposureTime: number | null) => {
  if (!exposureTime) return null;
  if (exposureTime >= 1) return `${exposureTime}s`;
  return `1/${Math.round(1 / exposureTime)}s`;
};

const formatAperture = (fNumber: number | null) => {
  if (!fNumber) return null;
  return `f/${fNumber}`;
};

// Helper function to safely format coordinates
const formatCoordinate = (
  coord: number | string | null | undefined,
): string | null => {
  if (coord === null || coord === undefined) return null;

  // Convert to number if it's a string
  const numCoord = typeof coord === "string" ? parseFloat(coord) : coord;

  // Check if it's a valid number
  if (typeof numCoord === "number" && !Number.isNaN(numCoord)) {
    return numCoord.toFixed(6);
  }

  // Return the original value as string if it can't be converted
  return String(coord);
};

export function PhotoDetailClient() {
  const { id: photoId } = routeApi.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Use React Query hook for data fetching
  const { photo, isLoading, error, refresh } = usePhoto(photoId);

  // Fetch AI analysis data
  const {
    data: analysisData,
    isLoading: isAnalysisLoading,
    error: analysisError,
  } = usePhotoAnalysis(photoId, {
    enabled: !!photo && photo.processingStatus === "completed",
  });

  // Shared detail page actions (pin, flag, chat, delete, reprocess)
  const actions = useDetailPageActions({
    contentType: "photos",
    item: photo,
    refresh,
    onDeleted: () => navigate({ to: "/photos" }),
    onReprocessed: () =>
      queryClient.invalidateQueries({
        queryKey: ["photo-analysis", photoId],
      }),
  });

  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editDueDate, setEditDueDate] = useState<string | null>(null);
  const [newTag, setNewTag] = useState("");
  const [imageScale, setImageScale] = useState(1);
  const [showFullscreen, setShowFullscreen] = useState(false);

  // Initialize editing state when photo loads
  useEffect(() => {
    if (photo && !isEditing) {
      setEditTitle(photo.title || "");
      setEditDescription(photo.description || "");
      setEditTags(photo.tags || []);
      setEditDueDate(photo.dueDate || null);
    }
  }, [photo, isEditing]);

  // Handle errors
  useEffect(() => {
    if (error) {
      toast.error("Error", {
        description:
          error instanceof Error
            ? error.message
            : "Failed to load photo details.",
      });
      if (error.message.includes("not found")) {
        navigate({ to: "/photos" });
      }
    }
  }, [error, navigate]);

  // Handle save changes
  const handleSave = async () => {
    if (!photo) return;

    try {
      setIsSubmitting(true);
      const response = await apiFetch(`/api/photos/${photoId}`, {
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
        // Refresh to get the latest data from server
        refresh();
        toast.success("Photo updated", {
          description: "Your changes have been saved successfully.",
        });
      } else {
        throw new Error("Failed to update photo");
      }
    } catch (error) {
      console.error("Error updating photo:", error);
      toast.error("Error", {
        description: "Failed to save changes.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cancel editing
  const handleCancel = () => {
    if (!photo) return;
    setEditTitle(photo.title || "");
    setEditDescription(photo.description || "");
    setEditTags(photo.tags || []);
    setEditDueDate(photo.dueDate || null);
    setNewTag("");
    setIsEditing(false);
  };

  // Handle add tag
  const handleAddTag = () => {
    if (!newTag.trim()) return;
    const tag = newTag.trim().toLowerCase();
    if (!editTags.includes(tag)) {
      setEditTags([...editTags, tag]);
    }
    setNewTag("");
  };

  // Handle remove tag
  const handleRemoveTag = (tagToRemove: string) => {
    setEditTags(editTags.filter((tag) => tag !== tagToRemove));
  };

  // Handle zoom
  const handleZoomIn = () => setImageScale((prev) => Math.min(prev * 1.2, 3));
  const handleZoomOut = () =>
    setImageScale((prev) => Math.max(prev / 1.2, 0.5));
  const handleResetZoom = () => setImageScale(1);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate({ to: "/photos" })}
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

  if (error || (!isLoading && !photo)) {
    const errorMessage =
      error instanceof Error ? error.message : "Photo not found";
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: "/photos" })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Photo not found</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Camera className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">{errorMessage}</h2>
          <p className="text-muted-foreground mb-4">
            The photo you're looking for doesn't exist or couldn't be loaded.
          </p>
          <Button onClick={() => navigate({ to: "/photos" })}>
            Go to Photos
          </Button>
        </div>
      </div>
    );
  }

  // At this point photo should be defined since we checked for loading/error above
  if (!photo) return null;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate({ to: "/photos" })}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {isEditing ? (
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="text-3xl font-bold border-none p-0 h-auto bg-transparent"
                    placeholder="Photo title"
                  />
                ) : (
                  photo.title || "Untitled Photo"
                )}
              </h1>
              <p className="text-muted-foreground mt-1">
                {photo.originalFilename}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <PinFlagControls
              isPinned={photo.isPinned || false}
              flagColor={photo.flagColor}
              onPinToggle={actions.handlePinToggle}
              onFlagToggle={actions.handleFlagToggle}
              onFlagColorChange={actions.handleFlagColorChange}
              size="md"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={actions.handleChatClick}
              title="Chat about this photo"
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
            <Button variant="outline" asChild>
              <a
                href={normalizeApiUrl(photo.imageUrl)}
                download
                title="Download photo"
                aria-label="Download photo"
              >
                <Download className="h-4 w-4 mr-0 md:mr-2" />
                <span className="hidden md:inline">Download</span>
              </a>
            </Button>

            {isEditing ? (
              <>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isSubmitting}
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={isSubmitting}>
                  <Save className="h-4 w-4 mr-2" />
                  {isSubmitting ? "Saving..." : "Save"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  onClick={actions.openDeleteDialog}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 md:h-[calc(100vh-12rem)]">
          {/* Main Content */}
          <div className="flex-1 flex flex-col space-y-6">
            {/* Photo Viewer */}
            <Card>
              <CardContent className="p-6">
                <div className="relative">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleZoomOut}
                        disabled={imageScale <= 0.5}
                      >
                        <ZoomOut className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        {Math.round(imageScale * 100)}%
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleZoomIn}
                        disabled={imageScale >= 3}
                      >
                        <ZoomIn className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleResetZoom}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowFullscreen(true)}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Fullscreen
                    </Button>
                  </div>

                  <div className="relative h-[70vh] bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden">
                    <img
                      src={normalizeApiUrl(photo.imageUrl)}
                      alt={photo.title || "Photo"}
                      className="w-full h-full object-contain transition-transform duration-200"
                      style={{
                        transform: `scale(${imageScale})`,
                        transformOrigin: "center",
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* AI Analysis */}
            <PhotoAnalysisCard
              analysisData={analysisData}
              isLoading={isAnalysisLoading}
              error={analysisError as Error | null}
              userDescription={photo.description}
              isEditing={isEditing}
              DescriptionEditor={
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Add a description for this photo..."
                  rows={4}
                  className="mt-1"
                />
              }
            />
          </div>

          {/* Sidebar */}
          <div className="w-full lg:w-80 space-y-6">
            {/* Photo Information */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center space-x-2">
                  <Camera className="h-4 w-4 text-gray-500" />
                  <div>
                    <Label className="text-sm font-medium">File Type</Label>
                    <p className="text-sm text-muted-foreground">
                      {photo.mimeType}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Camera className="h-4 w-4 text-gray-500" />
                  <div>
                    <Label className="text-sm font-medium">File Size</Label>
                    <p className="text-sm text-muted-foreground">
                      {formatFileSize(photo.fileSize)}
                    </p>
                  </div>
                </div>

                {photo.imageWidth && photo.imageHeight && (
                  <div className="flex items-center space-x-2">
                    <Camera className="h-4 w-4 text-gray-500" />
                    <div>
                      <Label className="text-sm font-medium">Dimensions</Label>
                      <p className="text-sm text-muted-foreground">
                        {photo.imageWidth} × {photo.imageHeight}
                      </p>
                    </div>
                  </div>
                )}

                <Separator />

                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <div>
                    <Label className="text-sm font-medium">Date Taken</Label>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(photo.dateTaken)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <div>
                    <Label className="text-sm font-medium">Uploaded</Label>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(photo.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <div>
                    <Label className="text-sm font-medium">Updated</Label>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(photo.updatedAt)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <div className="flex-1">
                    <Label className="text-sm font-medium">Due Date</Label>
                    {isEditing ? (
                      <DueDatePicker
                        value={editDueDate}
                        onChange={setEditDueDate}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {photo.dueDate
                          ? formatDate(photo.dueDate)
                          : "No due date set"}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tags */}
            <Card>
              <CardHeader>
                <CardTitle>Tags</CardTitle>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {editTags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="flex items-center gap-1"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="ml-1 hover:text-red-500"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        placeholder="Add a tag..."
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddTag();
                          }
                        }}
                      />
                      <Button size="sm" onClick={handleAddTag}>
                        Add
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {photo.tags && photo.tags.length > 0 ? (
                      photo.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No tags</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Processing Status */}
            {!isEditing && (
              <Card>
                <CardHeader>
                  <CardTitle>Processing Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <ProcessingStatusBadge
                    contentType="photos"
                    itemId={photo.id}
                    processingStatus={photo.processingStatus}
                    enabled={photo.enabled}
                    isJobStuck={actions.isJobStuck}
                    isReprocessing={actions.isReprocessing}
                    onReprocessClick={() =>
                      actions.setShowReprocessDialog(true)
                    }
                  />
                </CardContent>
              </Card>
            )}

            {/* Photo Assets */}
            <Card>
              <CardHeader>
                <CardTitle>Photo Assets</CardTitle>
                <CardDescription>
                  Available files and formats for this photo
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" variant="outline" asChild>
                    <a
                      href={normalizeApiUrl(photo.originalUrl)}
                      download={photo.originalFilename}
                    >
                      <Camera className="mr-2 h-4 w-4" />
                      Original Photo
                    </a>
                  </Button>
                  {photo.thumbnailUrl && (
                    <Button size="sm" variant="outline" asChild>
                      <a
                        href={normalizeApiUrl(photo.thumbnailUrl)}
                        download={`${photo.title || "photo"}-thumbnail.jpg`}
                      >
                        <Camera className="mr-2 h-4 w-4" />
                        Thumbnail
                      </a>
                    </Button>
                  )}
                  {photo.convertedJpgUrl && (
                    <Button size="sm" variant="outline" asChild>
                      <a
                        href={normalizeApiUrl(photo.convertedJpgUrl)}
                        download={`${photo.title || "photo"}.jpg`}
                      >
                        <Camera className="mr-2 h-4 w-4" />
                        Converted JPG
                      </a>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" asChild>
                    <a
                      href={`/api/photos/${photo.id}/analysis`}
                      download={`${photo.title || photo.id}-analysis.json`}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      Analysis Report
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Camera Information */}
            {(photo.cameraMake ||
              photo.cameraModel ||
              photo.lensModel ||
              photo.iso ||
              photo.fNumber ||
              photo.exposureTime) && (
              <Card>
                <CardHeader>
                  <CardTitle>Camera & Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(photo.cameraMake || photo.cameraModel) && (
                    <div>
                      <Label className="text-sm font-medium">Camera</Label>
                      <p className="text-sm text-muted-foreground">
                        {`${photo.cameraMake || ""} ${photo.cameraModel || ""}`.trim()}
                      </p>
                    </div>
                  )}

                  {photo.lensModel && (
                    <div>
                      <Label className="text-sm font-medium">Lens</Label>
                      <p className="text-sm text-muted-foreground">
                        {photo.lensModel}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    {photo.iso && (
                      <div>
                        <Label className="text-sm font-medium">ISO</Label>
                        <p className="text-sm text-muted-foreground">
                          {photo.iso}
                        </p>
                      </div>
                    )}

                    {photo.fNumber && (
                      <div>
                        <Label className="text-sm font-medium">Aperture</Label>
                        <p className="text-sm text-muted-foreground">
                          {formatAperture(photo.fNumber)}
                        </p>
                      </div>
                    )}

                    {photo.exposureTime && (
                      <div>
                        <Label className="text-sm font-medium">Shutter</Label>
                        <p className="text-sm text-muted-foreground">
                          {formatExposureTime(photo.exposureTime)}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Location Information */}
            {(photo.latitude || photo.locationCity) && (
              <Card>
                <CardHeader>
                  <CardTitle>Location</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {photo.locationCity && (
                    <div className="flex items-center space-x-2">
                      <MapPin className="h-4 w-4 text-gray-500" />
                      <div>
                        <Label className="text-sm font-medium">Location</Label>
                        <p className="text-sm text-muted-foreground">
                          {photo.locationCity}
                          {photo.locationCountryName &&
                            `, ${photo.locationCountryName}`}
                        </p>
                      </div>
                    </div>
                  )}

                  {photo.latitude && photo.longitude && (
                    <div>
                      <Label className="text-sm font-medium">Coordinates</Label>
                      <p className="text-sm text-muted-foreground">
                        {formatCoordinate(photo.latitude)},{" "}
                        {formatCoordinate(photo.longitude)}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        asChild
                      >
                        <a
                          href={`https://maps.google.com/?q=${formatCoordinate(photo.latitude)},${formatCoordinate(photo.longitude)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <MapPin className="h-4 w-4 mr-2" />
                          View on Map
                        </a>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Fullscreen Modal */}
        {showFullscreen && (
          // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-close overlay
          <div
            role="presentation"
            className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50"
            onClick={() => setShowFullscreen(false)}
          >
            <Button
              variant="outline"
              size="sm"
              className="absolute top-4 right-4 z-10"
              onClick={() => setShowFullscreen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: click handler only stops propagation to backdrop */}
            <img
              src={normalizeApiUrl(photo.imageUrl)}
              alt={photo.title || "Full size view"}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          open={actions.isDeleteDialogOpen}
          onOpenChange={actions.setIsDeleteDialogOpen}
          label="Photo"
          onConfirm={actions.confirmDelete}
        >
          <div className="my-4 flex items-start gap-3 p-3 border rounded-md bg-muted/50">
            <Camera className="h-6 w-6 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="font-medium break-words line-clamp-2 leading-tight">
                {photo.title || "Untitled Photo"}
              </p>
              <p className="text-sm text-muted-foreground truncate mt-1">
                {photo.originalFilename}
              </p>
            </div>
          </div>
        </DeleteConfirmDialog>

        {/* Reprocess Confirmation Dialog */}
        <ReprocessDialog
          open={actions.showReprocessDialog}
          onOpenChange={actions.setShowReprocessDialog}
          label="Photo"
          description="This will re-extract EXIF data, generate new thumbnails, and reprocess all AI-generated data for this photo. This may take a few minutes."
          isReprocessing={actions.isReprocessing}
          onConfirm={actions.handleReprocess}
        />
      </div>
    </TooltipProvider>
  );
}
