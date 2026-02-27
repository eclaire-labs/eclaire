import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Calendar,
  Download,
  Edit,
  File,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Save,
  Trash2,
  X,
} from "lucide-react";

const routeApi = getRouteApi("/_authenticated/documents/$id");

import { useEffect, useState } from "react";
import { DeleteConfirmDialog } from "@/components/detail-page/DeleteConfirmDialog";
import { ProcessingStatusBadge } from "@/components/detail-page/ProcessingStatusBadge";
import { ReprocessDialog } from "@/components/detail-page/ReprocessDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DueDatePicker } from "@/components/ui/due-date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PinFlagControls } from "@/components/ui/pin-flag-controls";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useDetailPageActions } from "@/hooks/use-detail-page-actions";
import { useDocument } from "@/hooks/use-documents";
import { useProcessingEvents } from "@/hooks/use-processing-status";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, getAbsoluteApiUrl } from "@/lib/api-client";
import { formatDate, formatFileSize } from "@/lib/date-utils";
import type { Document } from "@/types/document";

export function DocumentDetailClient() {
  const { id: documentId } = routeApi.useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

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
  const [newTag, setNewTag] = useState("");

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
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to load document details.",
        variant: "destructive",
      });
      if (error.message.includes("not found")) {
        navigate({ to: "/documents" });
      }
    }
  }, [error, toast, navigate]);

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
        toast({
          title: "Document updated",
          description: "Your changes have been saved successfully.",
        });
      } else {
        throw new Error("Failed to update document");
      }
    } catch (error) {
      console.error("Error updating document:", error);
      toast({
        title: "Error",
        description: "Failed to save changes.",
        variant: "destructive",
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
          <File className="h-16 w-16 text-muted-foreground mb-4" />
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
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate({ to: "/documents" })}
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
                    placeholder="Document title"
                  />
                ) : (
                  document.title || "Untitled Document"
                )}
              </h1>
              <p className="text-muted-foreground mt-1">
                {document.originalFilename}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
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
              <MessageSquare className="h-4 w-4" />
            </Button>

            {document.fileUrl && (
              <Button variant="outline" asChild>
                <a href={document.fileUrl} download={document.originalFilename}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </a>
              </Button>
            )}

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
                            ? getAbsoluteApiUrl(document.pdfUrl)
                            : document.screenshotUrl
                              ? getAbsoluteApiUrl(document.screenshotUrl)
                              : getAbsoluteApiUrl(document.thumbnailUrl || "")
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img
                          src={getAbsoluteApiUrl(
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
            {/* File Information */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center space-x-2">
                  <FileText className="h-4 w-4 text-gray-500" />
                  <div>
                    <Label className="text-sm font-medium">File Type</Label>
                    <p className="text-sm text-muted-foreground">
                      {document.mimeType || "Unknown"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <div>
                    <Label className="text-sm font-medium">Due Date</Label>
                    {isEditing ? (
                      <DueDatePicker
                        value={editDueDate}
                        onChange={(value) => setEditDueDate(value || "")}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {document.dueDate
                          ? formatDate(document.dueDate)
                          : "Not set"}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <File className="h-4 w-4 text-gray-500" />
                  <div>
                    <Label className="text-sm font-medium">File Size</Label>
                    <p className="text-sm text-muted-foreground">
                      {formatFileSize(document.fileSize)}
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <div>
                    <Label className="text-sm font-medium">Created</Label>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(document.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <div>
                    <Label className="text-sm font-medium">Updated</Label>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(document.updatedAt)}
                    </p>
                  </div>
                </div>

                {document.dueDate && (
                  <>
                    <Separator />
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-4 w-4 text-orange-500" />
                      <div>
                        <Label className="text-sm font-medium">Due Date</Label>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(document.dueDate)}
                        </p>
                      </div>
                    </div>
                  </>
                )}
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
                    {document.tags && document.tags.length > 0 ? (
                      document.tags.map((tag) => (
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
                    contentType="documents"
                    itemId={document.id}
                    processingStatus={document.processingStatus}
                    enabled={document.enabled}
                    isJobStuck={actions.isJobStuck}
                    isReprocessing={actions.isReprocessing}
                    onReprocessClick={() =>
                      actions.setShowReprocessDialog(true)
                    }
                  />
                </CardContent>
              </Card>
            )}

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
                      href={getAbsoluteApiUrl(document.fileUrl)}
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
                      href={getAbsoluteApiUrl(document.thumbnailUrl)}
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
                      href={getAbsoluteApiUrl(document.screenshotUrl)}
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
                      href={getAbsoluteApiUrl(document.pdfUrl)}
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
                      href={getAbsoluteApiUrl(document.contentUrl)}
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
