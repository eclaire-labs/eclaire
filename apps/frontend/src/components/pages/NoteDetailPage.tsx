import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Calendar,
  Edit,
  FileText,
  Loader2,
  MessageSquare,
  Save,
  Trash2,
  Type,
  X,
} from "lucide-react";

const routeApi = getRouteApi("/_authenticated/notes/$id");

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DeleteConfirmDialog } from "@/components/detail-page/DeleteConfirmDialog";
import { ProcessingStatusBadge } from "@/components/detail-page/ProcessingStatusBadge";
import { ReprocessDialog } from "@/components/detail-page/ReprocessDialog";
import { MarkdownDisplay } from "@/components/markdown-display";
import { DueDatePicker } from "@/components/shared/due-date-picker";
import { TagEditor } from "@/components/shared/TagEditor";
import { PinFlagControls } from "@/components/shared/pin-flag-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useDetailPageActions } from "@/hooks/use-detail-page-actions";
import { useNote } from "@/hooks/use-notes";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/date-utils";
import type { Note } from "@/types/note";

export function NoteDetailClient() {
  const navigate = useNavigate();
  const { id: noteId } = routeApi.useParams();
  const [localNote, setLocalNote] = useState<Note | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const { note, isLoading, error, refresh } = useNote(noteId);

  const actions = useDetailPageActions({
    contentType: "notes",
    item: note,
    refresh,
    onDeleted: () => navigate({ to: "/notes" }),
  });

  // Initialize local note state for editing
  useEffect(() => {
    if (note && !isEditing) {
      setLocalNote(note);
    }
  }, [note, isEditing]);

  const handleSave = async () => {
    if (!localNote) return;

    try {
      const response = await apiFetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: localNote.title,
          content: localNote.content,
          dueDate: localNote.dueDate,
          tags: localNote.tags,
        }),
      });

      if (response.ok) {
        setIsEditing(false);
        refresh();
        toast.success("Note updated", {
          description: "Your note has been saved successfully.",
        });
      } else {
        toast.error("Error", {
          description: "Failed to update note",
        });
      }
    } catch {
      toast.error("Error", {
        description: "Failed to update note",
      });
    }
  };

  const handleCancel = () => {
    setLocalNote(note ?? null);
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
              onClick={() => navigate({ to: "/notes" })}
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

  if (error || (!isLoading && !note)) {
    const errorMessage =
      error instanceof Error ? error.message : "Note not found";
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: "/notes" })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Note not found</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <h2 className="text-xl font-semibold mb-2">{errorMessage}</h2>
          <p className="text-muted-foreground mb-4">
            The note you're looking for doesn't exist or couldn't be loaded.
          </p>
          <Button onClick={() => navigate({ to: "/notes" })}>
            Go to Notes
          </Button>
        </div>
      </div>
    );
  }

  if (!note) return null;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate({ to: "/notes" })}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              {isEditing ? (
                <Input
                  value={localNote?.title || ""}
                  onChange={(e) =>
                    setLocalNote(
                      localNote
                        ? { ...localNote, title: e.target.value }
                        : null,
                    )
                  }
                  placeholder="Enter note title..."
                  className="text-2xl font-bold h-auto py-2 px-3 border-dashed"
                />
              ) : (
                <h1 className="text-2xl font-bold">
                  {note.title || "Untitled Note"}
                </h1>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PinFlagControls
              size="md"
              isPinned={note.isPinned || false}
              flagColor={note.flagColor}
              onPinToggle={actions.handlePinToggle}
              onFlagToggle={actions.handleFlagToggle}
              onFlagColorChange={actions.handleFlagColorChange}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={actions.handleChatClick}
              title="Chat about this note"
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
            {isEditing ? (
              <>
                <Button variant="outline" onClick={handleCancel}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button onClick={handleSave}>
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
                <Button onClick={() => setIsEditing(true)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Main Content Area - Two Column Layout */}
        <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-12rem)]">
          {/* Note Content - Main Column */}
          <div className="flex-1 flex flex-col">
            <Card className="flex-1 flex flex-col">
              <CardContent className="pt-6 flex-1 flex flex-col">
                <div className="flex-1 flex flex-col">
                  {isEditing ? (
                    <Textarea
                      id="content"
                      value={localNote?.content || ""}
                      onChange={(e) =>
                        setLocalNote(
                          localNote
                            ? { ...localNote, content: e.target.value }
                            : null,
                        )
                      }
                      placeholder="Write your note content here..."
                      className="flex-1 min-h-[400px] resize-none"
                    />
                  ) : (
                    <div className="p-4 bg-muted/30 rounded-md flex-1 min-h-[400px]">
                      {note.content ? (
                        <MarkdownDisplay content={note.content} />
                      ) : (
                        <p className="text-muted-foreground italic">
                          No content available
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Note Details */}
          <div className="w-full lg:w-80">
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4 text-sm">
                  {!isEditing && (
                    <>
                      <div>
                        <Label className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Created
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          {formatDate(note.createdAt)}
                        </p>
                      </div>

                      <div>
                        <Label className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Updated
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          {formatDate(note.updatedAt)}
                        </p>
                      </div>
                    </>
                  )}
                  <div>
                    <Label>Due Date</Label>
                    {isEditing ? (
                      <div className="mt-1">
                        <DueDatePicker
                          value={localNote?.dueDate || null}
                          onChange={(value) =>
                            setLocalNote(
                              localNote
                                ? { ...localNote, dueDate: value }
                                : null,
                            )
                          }
                        />
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">
                        {note.dueDate
                          ? formatDate(note.dueDate)
                          : "No due date set"}
                      </p>
                    )}
                  </div>
                  {/* Tags Section */}
                  <div>
                    {isEditing ? (
                      <TagEditor
                        tags={localNote?.tags || []}
                        onAddTag={(tag) =>
                          setLocalNote(
                            localNote
                              ? { ...localNote, tags: [...localNote.tags, tag] }
                              : null,
                          )
                        }
                        onRemoveTag={(tag) =>
                          setLocalNote(
                            localNote
                              ? {
                                  ...localNote,
                                  tags: localNote.tags.filter((t) => t !== tag),
                                }
                              : null,
                          )
                        }
                      />
                    ) : (
                      <div>
                        <Label>Tags</Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {note.tags.length > 0 ? (
                            note.tags.map((tag) => (
                              <Badge key={tag} variant="secondary">
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
                        <Label>Content Type</Label>
                        <p className="text-muted-foreground flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          {note.originalMimeType || "text/plain"}
                        </p>
                      </div>
                      <div>
                        <Label>Processing Status</Label>
                        <div className="mt-1">
                          <ProcessingStatusBadge
                            contentType="notes"
                            itemId={note.id}
                            processingStatus={note.processingStatus}
                            processingEnabled={note.processingEnabled}
                            isJobStuck={actions.isJobStuck}
                            isReprocessing={actions.isReprocessing}
                            onReprocessClick={() =>
                              actions.setShowReprocessDialog(true)
                            }
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Note ID</Label>
                        <p className="text-muted-foreground flex items-center gap-2">
                          <Type className="h-4 w-4" />
                          {note.id}
                        </p>
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
          label="Note"
          onConfirm={actions.confirmDelete}
          isDeleting={actions.isDeleting}
        >
          <div className="my-4 flex items-start gap-3 p-3 border rounded-md bg-muted/50">
            <FileText className="h-6 w-6 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="font-medium break-words line-clamp-2 leading-tight">
                {note.title || "Untitled Note"}
              </p>
              <p className="text-sm text-muted-foreground truncate mt-1">
                ID: {note.id}
              </p>
            </div>
          </div>
        </DeleteConfirmDialog>

        {/* Reprocess Confirmation Dialog */}
        <ReprocessDialog
          open={actions.showReprocessDialog}
          onOpenChange={actions.setShowReprocessDialog}
          label="Note"
          description="This will re-extract content, generate new tags, and reprocess all AI-generated data for this note. This may take a few minutes."
          isReprocessing={actions.isReprocessing}
          onConfirm={actions.handleReprocess}
        />
      </div>
    </TooltipProvider>
  );
}
