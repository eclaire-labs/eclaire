"use client";

import {
  ArrowLeft,
  Calendar,
  Edit,
  FileText,
  Loader2,
  MessageSquare,
  RefreshCw,
  Save,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { MarkdownDisplay } from "@/components/markdown-display";
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
import { useNote } from "@/hooks/use-notes";
import { useProcessingEvents } from "@/hooks/use-processing-status";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, setFlagColor, togglePin } from "@/lib/frontend-api";
import type { Note } from "@/types/note";

// Helper function to format ISO date strings
const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return "N/A";
  try {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (error) {
    console.error("Error formatting date:", dateString, error);
    return "Invalid Date";
  }
};

const formatDateForInput = (isoString: string | null | undefined): string => {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    // Return datetime-local format (YYYY-MM-DDTHH:mm)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return "";
  }
};

export default function NotePage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const [localNote, setLocalNote] = useState<Note | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [showReprocessDialog, setShowReprocessDialog] = useState(false);
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] =
    useState(false);
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);

  const noteId = params.id as string;

  // Use React Query hook for data fetching
  const { note, isLoading, error, refresh } = useNote(noteId);

  // Initialize SSE for real-time updates
  useProcessingEvents();

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
        // Refresh to get the latest data from server
        refresh();
        toast({
          title: "Note updated",
          description: "Your note has been saved successfully.",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to update note",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error updating note:", error);
      toast({
        title: "Error",
        description: "Failed to update note",
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    setLocalNote(note ?? null);
    setIsEditing(false);
    setTagInput("");
  };

  const handleDelete = () => {
    if (!note) return;
    setNoteToDelete(note);
    setIsConfirmDeleteDialogOpen(true);
  };

  const handleDeleteConfirmed = async () => {
    if (!noteToDelete) return;

    try {
      const response = await apiFetch(`/api/notes/${noteToDelete.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setIsConfirmDeleteDialogOpen(false);
        setNoteToDelete(null);
        toast({
          title: "Note deleted",
          description: "Your note has been deleted.",
        });
        router.push("/notes");
      } else {
        toast({
          title: "Error",
          description: "Failed to delete note",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error deleting note:", error);
      toast({
        title: "Error",
        description: "Failed to delete note",
        variant: "destructive",
      });
    }
  };

  const handleAddTag = () => {
    if (!tagInput.trim() || !localNote) return;
    const tag = tagInput.trim().toLowerCase();
    if (isEditing && !localNote.tags.includes(tag)) {
      setLocalNote({
        ...localNote,
        tags: [...localNote.tags, tag],
      });
    }
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    if (isEditing && localNote) {
      setLocalNote({
        ...localNote,
        tags: localNote.tags.filter((t) => t !== tag),
      });
    }
  };

  // Handle pin toggle for note
  const handlePinToggle = async () => {
    if (!note) return;

    try {
      const response = await togglePin("notes", note.id, !note.isPinned);
      if (response.ok) {
        const updatedNote = await response.json();
        // Refresh to get latest data from server
        refresh();
        toast({
          title: updatedNote.isPinned ? "Pinned" : "Unpinned",
          description: `Note has been ${updatedNote.isPinned ? "pinned" : "unpinned"}.`,
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
    if (!note) return;
    await handleFlagColorChange(note.flagColor ? null : "orange");
  };

  // Handle flag color change for note
  const handleFlagColorChange = async (
    color: "red" | "yellow" | "orange" | "green" | "blue" | null,
  ) => {
    if (!note) return;

    try {
      const response = await setFlagColor("notes", note.id, color);
      if (response.ok) {
        // Refresh to get latest data from server
        refresh();
        toast({
          title: color ? "Flag Updated" : "Flag Removed",
          description: color
            ? `Note flag changed to ${color}.`
            : "Flag removed from note.",
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

  // Handle chat button click
  const handleChatClick = () => {
    if (!note) return;

    // Use the global function to open assistant with pre-attached assets
    if (
      typeof window !== "undefined" &&
      (window as any).openAssistantWithAssets
    ) {
      (window as any).openAssistantWithAssets([
        {
          type: "note",
          id: note.id,
          title: note.title,
        },
      ]);
    }
  };

  // Helper function to detect stuck processing jobs
  const isJobStuck = (note: Note) => {
    if (!note.processingStatus) return false;

    const now = Date.now();
    const fifteenMinutesAgo = now - 15 * 60 * 1000;

    // Job is stuck if:
    // 1. Status is "pending" and created >15 minutes ago, OR
    // 2. Status is "processing" and not updated >15 minutes ago
    return (
      (note.processingStatus === "pending" &&
        new Date(note.createdAt).getTime() < fifteenMinutesAgo) ||
      (note.processingStatus === "processing" &&
        new Date(note.updatedAt).getTime() < fifteenMinutesAgo)
    );
  };

  const handleReprocess = async () => {
    if (!note) return;

    try {
      setIsReprocessing(true);
      setShowReprocessDialog(false);

      const isStuck = isJobStuck(note);
      const response = await apiFetch(`/api/notes/${note.id}/reprocess`, {
        method: "POST",
        ...(isStuck && {
          body: JSON.stringify({ force: true }),
          headers: { "Content-Type": "application/json" },
        }),
      });

      if (response.ok) {
        toast({
          title: "Reprocessing Started",
          description:
            "Your note has been queued for reprocessing. This may take a few minutes.",
        });

        // SSE events will automatically update the processing status
        // No need to manually update state
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.error || "Failed to reprocess note",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error reprocessing note:", error);
      toast({
        title: "Error",
        description: "Failed to reprocess note",
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

  if (error || (!isLoading && !note)) {
    const errorMessage =
      error instanceof Error ? error.message : "Note not found";
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Note not found</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <h2 className="text-xl font-semibold mb-2">{errorMessage}</h2>
          <p className="text-muted-foreground mb-4">
            The note you're looking for doesn't exist or couldn't be loaded.
          </p>
          <Button onClick={() => router.push("/notes")}>Go to Notes</Button>
        </div>
      </div>
    );
  }

  // At this point note should be defined since we checked for loading/error above
  if (!note) return null;

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
              onPinToggle={handlePinToggle}
              onFlagToggle={handleFlagToggle}
              onFlagColorChange={handleFlagColorChange}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleChatClick}
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
                  variant="outline"
                  onClick={handleDelete}
                  className="text-red-600 hover:text-red-700"
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
                {/* Content */}
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
                    <Label>Tags</Label>
                    {isEditing ? (
                      <div className="mt-1">
                        <div className="flex flex-wrap gap-2 mb-2">
                          {(localNote?.tags || []).map((tag) => (
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
                        <div className="mt-1 flex items-center gap-2">
                          <Badge
                            variant={
                              note.enabled === false
                                ? "outline"
                                : note.processingStatus === "completed"
                                  ? "default"
                                  : note.processingStatus === "failed"
                                    ? "destructive"
                                    : "secondary"
                            }
                            className={`${note.enabled !== false ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
                            onClick={
                              note.enabled !== false
                                ? () => {
                                    router.push(
                                      `/processing?assetType=notes&assetId=${note.id}`,
                                    );
                                  }
                                : undefined
                            }
                            title={
                              note.enabled !== false
                                ? "Click to view processing details"
                                : "Processing is disabled for this note"
                            }
                          >
                            {note.enabled === false
                              ? "disabled"
                              : note.processingStatus || "unknown"}
                          </Badge>

                          {/* Show reprocess button for completed, failed, or stuck jobs but not disabled */}
                          {note.enabled !== false &&
                            (note.processingStatus === "completed" ||
                              note.processingStatus === "failed" ||
                              isJobStuck(note)) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setShowReprocessDialog(true)}
                                disabled={isReprocessing}
                                title="Reprocess note"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                            )}
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
        <Dialog
          open={isConfirmDeleteDialogOpen}
          onOpenChange={setIsConfirmDeleteDialogOpen}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm Deletion</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this note? This action cannot be
                undone.
              </DialogDescription>
            </DialogHeader>
            {noteToDelete && (
              <div className="my-4 flex items-start gap-3 p-3 border rounded-md bg-muted/50">
                <NoteIcon
                  note={noteToDelete}
                  className="h-6 w-6 flex-shrink-0 mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words line-clamp-2 leading-tight">
                    {noteToDelete.title || "Untitled Note"}
                  </p>
                  <p className="text-sm text-muted-foreground truncate mt-1">
                    ID: {noteToDelete.id}
                  </p>
                </div>
              </div>
            )}
            <DialogFooter className="sm:justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setIsConfirmDeleteDialogOpen(false);
                  setNoteToDelete(null);
                }}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteConfirmed}>
                Delete Note
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
              <DialogTitle>Reprocess Note</DialogTitle>
              <DialogDescription>
                This will re-extract content, generate new tags, and reprocess
                all AI-generated data for this note. This may take a few
                minutes.
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

// Simple note icon component for the delete dialog
function NoteIcon({ note, className }: { note: Note; className?: string }) {
  // Use the FileText icon as default for notes
  return <FileText className={className} />;
}
