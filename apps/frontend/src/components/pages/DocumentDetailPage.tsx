import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Download,
  Edit,
  File,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  Save,
  Trash2,
  X,
} from "lucide-react";

const routeApi = getRouteApi("/_authenticated/documents/$id");

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

import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useDetailPageActions } from "@/hooks/use-detail-page-actions";
import { useDocument } from "@/hooks/use-documents";
import { useProcessingEvents } from "@/hooks/use-processing-status";
import { apiFetch, normalizeApiUrl } from "@/lib/api-client";
import { formatDate, formatFileSize } from "@/lib/date-utils";
import type { Document } from "@/types/document";

export function DocumentDetailClient() {
  const { id: documentId } = routeApi.useParams();
  const navigate = useNavigate();
  // Use React Query hook for data fetching
  const { document, isLoading, error, refresh } = useDocument(documentId);

  // Initialize SSE for real-time updates
  useProcessingEvents();

  // Shared detail page actions (pin, flag, chat, delete, reprocess)
  const actions = useDetailPageActions({
    contentType: "documents",
    item: document,
    refresh,
    onDeleted: () => navigate({ to: "/documents" }),
  });

  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDueDate, setEditDueDate] = useState(""); // This will hold ISO string
  const [editTags, setEditTags] = useState<string[]>([]);

  // Initialize editing state when document loads
  useEffect(() => {
    if (document && !isEditing) {
      setEditTitle(document.title || "");
      setEditDescription(document.description || "");
      setEditDueDate(document.dueDate || "");
      setEditTags(document.tags || []);
    }
  }, [document, isEditing]);

  // Handle errors
  useEffect(() => {
    if (error) {
      toast.error("Error", {
        description:
          error instanceof Error
            ? error.message
            : "Failed to load document details.",
      });
      if (error.message.includes("not found")) {
        navigate({ to: "/documents" });
      }
    }
  }, [error, navigate]);

  // Handle save changes
  const handleSave = async () => {
    if (!document) return;

    try {
      setIsSubmitting(true);
      const response = await apiFetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editTitle,
          description: editDescription || null,
          dueDate: editDueDate ? new Date(editDueDate).toISOString() : null,
          tags: editTags,
        }),
      });

      if (response.ok) {
        setIsEditing(false);
        // Refresh to get the latest data from server
        refresh();
        toast.success("Document updated", {
          description: "Your changes have been saved successfully.",
        });
      } else {
        throw new Error("Failed to update document");
      }
    } catch (error) {
      console.error("Error updating document:", error);
      toast.error("Error", {
        description: "Failed to save changes.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cancel editing
  const handleCancel = () => {
    if (!document) return;
    setEditTitle(document.title || "");
    setEditDescription(document.description || "");
    setEditDueDate(document.dueDate || "");
    setEditTags(document.tags || []);
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
              onClick={() => navigate({ to: "/documents" })}
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

  if (error || (!isLoading && !document)) {
    const errorMessage =
      error instanceof Error ? error.message : "Document not found";
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: "/documents" })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Document not found</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">{errorMessage}</h2>
          <p className="text-muted-foreground mb-4">
            The document you're looking for doesn't exist or couldn't be loaded.
          </p>
          <Button onClick={() => navigate({ to: "/documents" })}>
            Go to Documents
          </Button>
        </div>
      </div>
    );
  }

  // At this point document should be defined since we checked for loading/error above
  if (!document) return null;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate({ to: "/documents" })}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              {isEditing ? (
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Enter document title..."
                  className="text-2xl font-bold h-auto py-2 px-3 border-dashed"
                />
              ) : (
                <h1 className="text-2xl font-bold">
                  {document.title || "Untitled Document"}
                </h1>
              )}
              <p className="text-muted-foreground mt-1">
                {document.originalFilename}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <PinFlagControls
              isPinned={document.isPinned || false}
              flagColor={document.flagColor}
              onPinToggle={actions.handlePinToggle}
              onFlagToggle={actions.handleFlagToggle}
              onFlagColorChange={actions.handleFlagColorChange}
              size="md"
            />

            <Button
              variant="ghost"
              size="icon"
              onClick={actions.handleChatClick}
              title="Chat about this document"
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
                {document.fileUrl && (
                  <Button variant="outline" asChild>
                    <a
                      href={document.fileUrl}
                      download={document.originalFilename}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </a>
                  </Button>
                )}
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
            {isEditing ? (
              <Card>
                <CardHeader>
                  <CardTitle>Edit Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Add a description..."
                      rows={6}
                    />
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Description */}
                <Card>
                  <CardHeader>
                    <CardTitle>Description</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">
                      {document.description || "No description provided."}
                    </p>
                  </CardContent>
                </Card>

                {/* Document Preview */}
                {(document.screenshotUrl || document.thumbnailUrl) && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Document Preview</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <a
                        href={
                          document.pdfUrl
                            ? normalizeApiUrl(document.pdfUrl)
                            : document.screenshotUrl
                              ? normalizeApiUrl(document.screenshotUrl)
                              : normalizeApiUrl(document.thumbnailUrl || "")
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img
                          src={normalizeApiUrl(
                            document.screenshotUrl ||
                              document.thumbnailUrl ||
                              "",
                          )}
                          alt={`Preview of ${document.title}`}
                          className="w-full rounded-lg object-contain"
                        />
                      </a>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>

          {/* Right Sidebar */}
          <div className="w-full lg:w-80 space-y-6">
            {/* Document Details */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4 text-sm">
                  <div>
                    <Label className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      File Type
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {document.mimeType || "Unknown"}
                    </p>
                  </div>

                  <div>
                    <Label className="flex items-center gap-2">
                      <File className="h-4 w-4" />
                      File Size
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatFileSize(document.fileSize)}
                    </p>
                  </div>

                  <div>
                    <Label>Due Date</Label>
                    {isEditing ? (
                      <div className="mt-1">
                        <DueDatePicker
                          value={editDueDate}
                          onChange={(value) => setEditDueDate(value || "")}
                        />
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">
                        {document.dueDate
                          ? formatDate(document.dueDate)
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
                          {document.tags && document.tags.length > 0 ? (
                            document.tags.map((tag) => (
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
                          Created
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          {formatDate(document.createdAt)}
                        </p>
                      </div>

                      <div>
                        <Label className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Updated
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          {formatDate(document.updatedAt)}
                        </p>
                      </div>

                      <div>
                        <Label>Processing Status</Label>
                        <div className="mt-1">
                          <ProcessingStatusBadge
                            contentType="documents"
                            itemId={document.id}
                            processingStatus={document.processingStatus}
                            processingEnabled={document.processingEnabled}
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

            {/* Document Assets */}
            <Card>
              <CardHeader>
                <CardTitle>Document Assets</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {document.fileUrl && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    asChild
                  >
                    <a
                      href={normalizeApiUrl(document.fileUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={document.originalFilename}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Original
                    </a>
                  </Button>
                )}
                {document.thumbnailUrl && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    asChild
                  >
                    <a
                      href={normalizeApiUrl(document.thumbnailUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ImageIcon className="mr-2 h-4 w-4" />
                      Thumbnail
                    </a>
                  </Button>
                )}
                {document.screenshotUrl && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    asChild
                  >
                    <a
                      href={normalizeApiUrl(document.screenshotUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ImageIcon className="mr-2 h-4 w-4" />
                      Screenshot
                    </a>
                  </Button>
                )}
                {document.pdfUrl && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    asChild
                  >
                    <a
                      href={normalizeApiUrl(document.pdfUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <File className="mr-2 h-4 w-4" />
                      PDF
                    </a>
                  </Button>
                )}
                {document.contentUrl && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    asChild
                  >
                    <a
                      href={normalizeApiUrl(document.contentUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Extracted Markdown
                    </a>
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          open={actions.isDeleteDialogOpen}
          onOpenChange={actions.setIsDeleteDialogOpen}
          label="Document"
          isDeleting={actions.isDeleting}
          onConfirm={actions.confirmDelete}
        >
          {document && (
            <div className="my-4 flex items-start gap-3 p-3 border rounded-md bg-muted/50">
              <DocumentIcon
                document={document}
                className="h-6 w-6 flex-shrink-0 mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium break-words line-clamp-2 leading-tight">
                  {document.title || "Untitled Document"}
                </p>
                <p className="text-sm text-muted-foreground truncate mt-1">
                  {document.originalFilename}
                </p>
              </div>
            </div>
          )}
        </DeleteConfirmDialog>

        {/* Reprocess Confirmation Dialog */}
        <ReprocessDialog
          open={actions.showReprocessDialog}
          onOpenChange={actions.setShowReprocessDialog}
          label="Document"
          description="This will re-extract content, generate new thumbnails, take fresh screenshots, and reprocess all AI-generated data for this document. This may take a few minutes."
          isReprocessing={actions.isReprocessing}
          onConfirm={actions.handleReprocess}
        />
      </div>
    </TooltipProvider>
  );
}

// Simple document icon component for the delete dialog
function DocumentIcon({
  document: _document,
  className,
}: {
  document: Document;
  className?: string;
}) {
  // Use the File icon as default for documents
  return <File className={className} />;
}
