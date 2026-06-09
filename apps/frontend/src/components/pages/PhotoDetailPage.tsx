import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Calendar,
  Camera,
  Download,
  Edit,
  ExternalLink,
  MessageCircle,
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

import { ContentViewer } from "@/components/detail-page/ContentViewer";
import { DeleteConfirmDialog } from "@/components/detail-page/DeleteConfirmDialog";
import { ProcessingStatusBadge } from "@/components/detail-page/ProcessingStatusBadge";
import { ReprocessDialog } from "@/components/detail-page/ReprocessDialog";
import { PhotoAnalysisCard } from "@/components/photo-analysis";
import { CameraInfoCard } from "@/components/photos/detail/CameraInfoCard";
import { LocationCard } from "@/components/photos/detail/LocationCard";
import { PhotoAssetsCard } from "@/components/photos/detail/PhotoAssetsCard";
import { PhotoFullscreenView } from "@/components/photos/detail/PhotoFullscreenView";
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
import { useDetailPageActions } from "@/hooks/use-detail-page-actions";
import { usePhotoAnalysis } from "@/hooks/use-photo-analysis";
import { usePhoto } from "@/hooks/use-photos";
import { normalizeApiUrl } from "@/lib/api-client";
import { formatDate, formatFileSize } from "@/lib/date-utils";

interface EditForm {
  title: string;
  description: string;
  tags: string[];
  dueDate: string | null;
}

const emptyEditForm: EditForm = {
  title: "",
  description: "",
  tags: [],
  dueDate: null,
};

export function PhotoDetailClient() {
  const { id: photoId } = routeApi.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Use React Query hook for data fetching
  const { photo, isLoading, error, refresh, update, isUpdating } =
    usePhoto(photoId);

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

  const [activeTab, setActiveTab] = useState("preview");
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>(emptyEditForm);
  const [imageScale, setImageScale] = useState(1);
  const [showFullscreen, setShowFullscreen] = useState(false);

  // Initialize editing state when photo loads
  useEffect(() => {
    if (photo && !isEditing) {
      setEditForm({
        title: photo.title || "",
        description: photo.description || "",
        tags: photo.tags || [],
        dueDate: photo.dueDate || null,
      });
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
      await update({
        title: editForm.title,
        description: editForm.description || null,
        tags: editForm.tags,
        dueDate: editForm.dueDate,
      });
      setIsEditing(false);
      toast.success("Photo updated", {
        description: "Your changes have been saved successfully.",
      });
    } catch {
      // Error toast is handled by the hook
    }
  };

  // Handle cancel editing
  const handleCancel = () => {
    if (!photo) return;
    setEditForm({
      title: photo.title || "",
      description: photo.description || "",
      tags: photo.tags || [],
      dueDate: photo.dueDate || null,
    });
    setIsEditing(false);
  };

  // Handle zoom
  const handleZoomIn = () => setImageScale((prev) => Math.min(prev * 1.2, 3));
  const handleZoomOut = () =>
    setImageScale((prev) => Math.max(prev / 1.2, 0.5));
  const handleResetZoom = () => setImageScale(1);

  if (isLoading) {
    return <PageLoading variant="detail" backTo="/photos" />;
  }

  if (error || !photo) {
    return (
      <PageError
        title="Photo not found"
        message={
          error instanceof Error
            ? error.message
            : "The photo you're looking for doesn't exist or couldn't be loaded."
        }
        backTo="/photos"
        backLabel="Go to Photos"
      />
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate({ to: "/photos" })}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              {isEditing ? (
                <Input
                  value={editForm.title}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder="Enter photo title..."
                  className="text-2xl font-bold h-auto py-2 px-3 border-dashed"
                />
              ) : (
                <h1 className="text-2xl font-bold">
                  {photo.title || "Untitled Photo"}
                </h1>
              )}
              <p className="text-muted-foreground mt-1">
                {photo.originalFilename}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
              <MessageCircle className="h-4 w-4" />
            </Button>

            {isEditing ? (
              <>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isUpdating}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={isUpdating}>
                  <Save className="mr-2 h-4 w-4" />
                  {isUpdating ? "Saving..." : "Save"}
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
                    href={normalizeApiUrl(photo.imageUrl)}
                    download
                    title="Download photo"
                    aria-label="Download photo"
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
                    <TabsTrigger value="preview">Preview</TabsTrigger>
                    <TabsTrigger value="content" disabled={!photo.contentUrl}>
                      Content
                    </TabsTrigger>
                  </TabsList>
                </CardHeader>
                <CardContent>
                  <TabsContent value="preview" className="mt-0">
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

                      <div className="relative h-[70vh] bg-muted rounded-lg flex items-center justify-center overflow-hidden">
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
                  </TabsContent>
                  <TabsContent value="content" className="mt-0">
                    <ContentViewer
                      contentUrl={photo.contentUrl}
                      isActive={activeTab === "content"}
                    />
                  </TabsContent>
                </CardContent>
              </Tabs>
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
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Add a description for this photo..."
                  rows={4}
                  className="mt-1"
                />
              }
            />
          </div>

          {/* Sidebar */}
          <div className="w-full lg:w-80 space-y-6">
            {/* Photo Details */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4 text-sm">
                  <div>
                    <Label className="flex items-center gap-2">
                      <Camera className="h-4 w-4" />
                      File Type
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {photo.mimeType}
                    </p>
                  </div>

                  <div>
                    <Label className="flex items-center gap-2">
                      <Camera className="h-4 w-4" />
                      File Size
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatFileSize(photo.fileSize)}
                    </p>
                  </div>

                  {photo.imageWidth && photo.imageHeight && (
                    <div>
                      <Label className="flex items-center gap-2">
                        <Camera className="h-4 w-4" />
                        Dimensions
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {photo.imageWidth} × {photo.imageHeight}
                      </p>
                    </div>
                  )}

                  <div>
                    <Label>Due Date</Label>
                    {isEditing ? (
                      <div className="mt-1">
                        <DueDatePicker
                          value={editForm.dueDate}
                          onChange={(dueDate) =>
                            setEditForm((prev) => ({ ...prev, dueDate }))
                          }
                        />
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">
                        {photo.dueDate
                          ? formatDate(photo.dueDate)
                          : "No due date set"}
                      </p>
                    )}
                  </div>

                  {/* Tags Section */}
                  <div>
                    {isEditing ? (
                      <TagEditor
                        tags={editForm.tags}
                        onAddTag={(tag) =>
                          setEditForm((prev) => ({
                            ...prev,
                            tags: [...prev.tags, tag],
                          }))
                        }
                        onRemoveTag={(tag) =>
                          setEditForm((prev) => ({
                            ...prev,
                            tags: prev.tags.filter((t) => t !== tag),
                          }))
                        }
                      />
                    ) : (
                      <div>
                        <Label>Tags</Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {photo.tags && photo.tags.length > 0 ? (
                            photo.tags.map((tag) => (
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
                          Date Taken
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          {formatDate(photo.dateTaken)}
                        </p>
                      </div>

                      <div>
                        <Label className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Uploaded
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          {formatDate(photo.createdAt)}
                        </p>
                      </div>

                      <div>
                        <Label className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Updated
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          {formatDate(photo.updatedAt)}
                        </p>
                      </div>

                      <div>
                        <Label>Processing Status</Label>
                        <div className="mt-1">
                          <ProcessingStatusBadge
                            contentType="photos"
                            itemId={photo.id}
                            processingStatus={photo.processingStatus}
                            processingEnabled={photo.processingEnabled}
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

            {/* Photo Assets */}
            <PhotoAssetsCard photo={photo} />

            {/* Camera Information */}
            <CameraInfoCard photo={photo} />

            {/* Location Information */}
            <LocationCard photo={photo} />
          </div>
        </div>

        {/* Fullscreen Modal */}
        {showFullscreen && (
          <PhotoFullscreenView
            src={normalizeApiUrl(photo.imageUrl)}
            alt={photo.title || "Full size view"}
            onClose={() => setShowFullscreen(false)}
          />
        )}

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          open={actions.isDeleteDialogOpen}
          onOpenChange={actions.setIsDeleteDialogOpen}
          label="Photo"
          onConfirm={actions.confirmDelete}
          isDeleting={actions.isDeleting}
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
