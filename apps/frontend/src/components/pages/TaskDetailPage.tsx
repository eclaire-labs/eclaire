import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Circle,
  Edit3,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  PlayCircle,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";

const routeApi = getRouteApi("/_authenticated/tasks/$id");

import { useEffect, useState } from "react";
import { MarkdownDisplayWithAssets } from "@/components/markdown-display-with-assets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DueDatePicker } from "@/components/ui/due-date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PinFlagControls } from "@/components/ui/pin-flag-controls";
import { RecurrenceToggle } from "@/components/ui/recurrence-toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useProcessingEvents } from "@/hooks/use-processing-status";
import { useTask } from "@/hooks/use-tasks";
import { useToast } from "@/hooks/use-toast";
import {
  apiFetch,
  createTaskComment,
  deleteTaskComment,
  getUsers,
  setFlagColor,
  togglePin,
  updateTaskComment,
} from "@/lib/frontend-api";
import type { Task, TaskComment, TaskStatus, User } from "@/types/task";

export function TaskDetailClient() {
  const { id: taskId } = routeApi.useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Use React Query hook for data fetching
  const { task, isLoading, error, refresh } = useTask(taskId);

  // Initialize SSE for real-time updates
  useProcessingEvents();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [showReprocessDialog, setShowReprocessDialog] = useState(false);
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] =
    useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  // Comments state
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [_isLoadingComments, _setIsLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState("");

  // Form state for editing
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    status: "not-started" as TaskStatus,
    dueDate: "",
    assignedToId: "",
    tags: [] as string[],
    recurrence: {
      isRecurring: false,
      cronExpression: null as string | null,
      recurrenceEndDate: null as string | null,
      recurrenceLimit: null as number | null,
      runImmediately: false,
    },
  });

  // Initialize local state for editing when task data is available
  useEffect(() => {
    if (task && !isEditing) {
      setEditForm({
        title: task.title,
        description: task.description || "",
        status: task.status,
        dueDate: task.dueDate || "",
        assignedToId: task.assignedToId || "",
        tags: [...task.tags],
        recurrence: {
          isRecurring: task.isRecurring || false,
          cronExpression: task.cronExpression || null,
          recurrenceEndDate: task.recurrenceEndDate || null,
          recurrenceLimit: task.recurrenceLimit || null,
          runImmediately: task.runImmediately || false,
        },
      });
    }
  }, [task, isEditing]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersData = await getUsers();
        setUsers(usersData);
      } catch (error) {
        console.error("Error fetching users:", error);
      }
    };
    fetchUsers();
  }, []);

  // Initialize comments from task data
  useEffect(() => {
    if (task?.comments) {
      setComments(task.comments);
    }
  }, [task]);

  // Comment management functions
  const handleAddComment = async () => {
    if (!newComment.trim() || !task) return;

    try {
      setIsAddingComment(true);
      const comment = await createTaskComment(task.id, newComment.trim());
      setComments((prev) => [comment, ...prev]); // Add to top
      setNewComment("");

      toast({
        title: "Comment added",
        description: "Your comment has been added successfully.",
      });
    } catch (error) {
      console.error("Error adding comment:", error);
      toast({
        title: "Error",
        description: "Failed to add comment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAddingComment(false);
    }
  };

  const handleEditComment = async (commentId: string) => {
    if (!editingCommentContent.trim() || !task) return;

    try {
      const updatedComment = await updateTaskComment(
        task.id,
        commentId,
        editingCommentContent.trim(),
      );
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? updatedComment : c)),
      );
      setEditingCommentId(null);
      setEditingCommentContent("");

      toast({
        title: "Comment updated",
        description: "Your comment has been updated successfully.",
      });
    } catch (error) {
      console.error("Error updating comment:", error);
      toast({
        title: "Error",
        description: "Failed to update comment. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!task) return;

    try {
      await deleteTaskComment(task.id, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));

      toast({
        title: "Comment deleted",
        description: "Comment has been deleted successfully.",
      });
    } catch (error) {
      console.error("Error deleting comment:", error);
      toast({
        title: "Error",
        description: "Failed to delete comment. Please try again.",
        variant: "destructive",
      });
    }
  };

  const _formatDateForInput = (
    isoString: string | null | undefined,
  ): string => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      // Return datetime-local format (YYYY-MM-DDTHH:mm)
      // This automatically shows in local timezone
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

  const formatDateForDisplay = (isoString: string | null): string => {
    if (!isoString) return "No date set";
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Invalid date";
    }
  };

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case "not-started":
        return <Circle className="h-4 w-4" />;
      case "in-progress":
        return <PlayCircle className="h-4 w-4" />;
      case "completed":
        return <CheckCircle2 className="h-4 w-4" />;
      default:
        return <Circle className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: TaskStatus) => {
    const configs = {
      "not-started": { variant: "secondary" as const, label: "Not Started" },
      "in-progress": { variant: "default" as const, label: "In Progress" },
      completed: { variant: "outline" as const, label: "Completed" },
    };
    const config = configs[status] || configs["not-started"];

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        {getStatusIcon(status)}
        {config.label}
      </Badge>
    );
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    if (task) {
      // Reset form to original task data
      setEditForm({
        title: task.title,
        description: task.description || "",
        status: task.status,
        dueDate: task.dueDate || "",
        assignedToId: task.assignedToId || "",
        tags: [...task.tags],
        recurrence: {
          isRecurring: task.isRecurring || false,
          cronExpression: task.cronExpression || null,
          recurrenceEndDate: task.recurrenceEndDate || null,
          recurrenceLimit: task.recurrenceLimit || null,
          runImmediately: task.runImmediately || false,
        },
      });
    }
    setIsEditing(false);
    setTagInput("");
  };

  const handleSave = async () => {
    if (!task) return;

    try {
      setIsSaving(true);
      const updateData = {
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        status: editForm.status,
        dueDate: editForm.dueDate
          ? new Date(editForm.dueDate).toISOString()
          : null,
        assignedToId: editForm.assignedToId.trim() || null,
        tags: editForm.tags,
        isRecurring: editForm.recurrence.isRecurring,
        cronExpression: editForm.recurrence.cronExpression,
        recurrenceEndDate: editForm.recurrence.recurrenceEndDate,
        recurrenceLimit: editForm.recurrence.recurrenceLimit,
        runImmediately: editForm.recurrence.runImmediately,
      };

      const response = await apiFetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        throw new Error("Failed to update task");
      }

      const _updatedTask: Task = await response.json();
      setIsEditing(false);
      setTagInput("");

      // Refresh to get the latest data from server
      refresh();

      toast({
        title: "Task updated",
        description: "Your task has been updated successfully.",
      });
    } catch (error) {
      console.error("Error updating task:", error);
      toast({
        title: "Error",
        description: "Failed to update task. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClick = () => {
    if (!task) return;
    setTaskToDelete(task);
    setIsConfirmDeleteDialogOpen(true);
  };

  const handleDeleteConfirmed = async () => {
    if (!taskToDelete) return;

    try {
      const response = await apiFetch(`/api/tasks/${taskToDelete.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete task");
      }

      setIsConfirmDeleteDialogOpen(false);
      setTaskToDelete(null);
      toast({
        title: "Task deleted",
        description: "The task has been deleted successfully.",
      });

      navigate({ to: "/tasks" });
    } catch (error) {
      console.error("Error deleting task:", error);
      toast({
        title: "Error",
        description: "Failed to delete task. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !editForm.tags.includes(tag)) {
      setEditForm((prev) => ({
        ...prev,
        tags: [...prev.tags, tag],
      }));
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setEditForm((prev) => ({
      ...prev,
      tags: prev.tags.filter((tag) => tag !== tagToRemove),
    }));
  };

  const handleInputChange = (
    field: keyof typeof editForm,
    value: (typeof editForm)[keyof typeof editForm] | null,
  ) => {
    setEditForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Handle pin toggle for task
  const handlePinToggle = async () => {
    if (!task) return;

    try {
      const response = await togglePin("tasks", task.id, !task.isPinned);
      if (response.ok) {
        const updatedTask = await response.json();
        // Refresh to get latest data from server
        refresh();
        toast({
          title: updatedTask.isPinned ? "Pinned" : "Unpinned",
          description: `Task has been ${updatedTask.isPinned ? "pinned" : "unpinned"}.`,
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

  // Handle flag color change for task
  const handleFlagColorChange = async (
    color: "red" | "yellow" | "orange" | "green" | "blue" | null,
  ) => {
    if (!task) return;

    try {
      const response = await setFlagColor("tasks", task.id, color);
      if (response.ok) {
        // Refresh to get latest data from server
        refresh();
        toast({
          title: color ? "Flag Updated" : "Flag Removed",
          description: color
            ? `Task flag changed to ${color}.`
            : "Flag removed from task.",
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
  const isJobStuck = (task: Task) => {
    if (!task.processingStatus) return false;

    const now = Date.now();
    const fifteenMinutesAgo = now - 15 * 60 * 1000;

    // Job is stuck if:
    // 1. Status is "pending" and created >15 minutes ago, OR
    // 2. Status is "processing" and not updated >15 minutes ago
    return (
      (task.processingStatus === "pending" &&
        new Date(task.createdAt).getTime() < fifteenMinutesAgo) ||
      (task.processingStatus === "processing" &&
        new Date(task.updatedAt).getTime() < fifteenMinutesAgo)
    );
  };

  const handleReprocess = async () => {
    if (!task) return;

    try {
      setIsReprocessing(true);
      setShowReprocessDialog(false);

      const isStuck = isJobStuck(task);
      const response = await apiFetch(`/api/tasks/${task.id}/reprocess`, {
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
            "Your task has been queued for reprocessing. This may take a few minutes.",
        });

        // SSE events will automatically update the processing status
        // No need to manually update state
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.error || "Failed to reprocess task",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error reprocessing task:", error);
      toast({
        title: "Error",
        description: "Failed to reprocess task",
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
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate({ to: "/tasks" })}
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

  if (error || (!isLoading && !task)) {
    const errorMessage =
      error instanceof Error ? error.message : "Task not found";
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: "/tasks" })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Task not found</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">{errorMessage}</h2>
          <p className="text-muted-foreground mb-4">
            The task you're looking for doesn't exist or couldn't be loaded.
          </p>
          <Button onClick={() => navigate({ to: "/tasks" })}>
            Go to Tasks
          </Button>
        </div>
      </div>
    );
  }

  if (!task) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: "/tasks" })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            {isEditing ? (
              <Input
                value={editForm.title}
                onChange={(e) => handleInputChange("title", e.target.value)}
                placeholder="Enter task title..."
                className="text-2xl font-bold h-auto py-2 px-3 border-dashed"
              />
            ) : (
              <h1 className="text-2xl font-bold">{task.title}</h1>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <PinFlagControls
              size="md"
              isPinned={task.isPinned}
              flagColor={task.flagColor}
              onPinToggle={handlePinToggle}
              onFlagToggle={() =>
                handleFlagColorChange(task.flagColor ? null : "orange")
              }
              onFlagColorChange={handleFlagColorChange}
            />
          </TooltipProvider>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (
                typeof window !== "undefined" &&
                // biome-ignore lint/suspicious/noExplicitAny: global window extension for assistant
                (window as any).openAssistantWithAssets
              ) {
                // biome-ignore lint/suspicious/noExplicitAny: global window extension for assistant
                (window as any).openAssistantWithAssets([
                  {
                    type: "task",
                    id: task.id,
                    title: task.title,
                  },
                ]);
              }
            }}
            title="Chat about this task"
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
          {isEditing ? (
            <>
              <Button
                variant="outline"
                onClick={handleCancelEdit}
                disabled={isSaving}
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving || !editForm.title.trim()}
              >
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleDeleteClick}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
              <Button onClick={handleEdit}>
                <Edit3 className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Content Area - Two Column Layout */}
      <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-12rem)]">
        {/* Task Content - Main Column */}
        <div className="flex-1 flex flex-col">
          <Card className="flex-1 flex flex-col">
            <CardContent className="pt-6 flex-1 flex flex-col">
              {/* Description */}
              <div className="space-y-2 mb-6">
                <Label>Description</Label>
                {isEditing ? (
                  <Textarea
                    value={editForm.description}
                    onChange={(e) =>
                      handleInputChange("description", e.target.value)
                    }
                    placeholder="Task description"
                    rows={6}
                    className="flex-1 min-h-[200px] resize-none"
                  />
                ) : (
                  <div className="p-4 bg-muted/30 rounded-md flex-1 min-h-[200px]">
                    {task.description ? (
                      <MarkdownDisplayWithAssets content={task.description} />
                    ) : (
                      <p className="text-muted-foreground italic">
                        No description provided.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Comments Section */}
              <div className="space-y-4 pt-6 border-t">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">
                    Comments ({comments.length})
                  </Label>
                </div>

                {/* Add Comment Form */}
                <div className="space-y-2">
                  <Textarea
                    placeholder="Add a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={handleAddComment}
                      disabled={!newComment.trim() || isAddingComment}
                      size="sm"
                    >
                      {isAddingComment ? (
                        <>
                          <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        "Add Comment"
                      )}
                    </Button>
                  </div>
                </div>

                {/* Comments List */}
                <div className="space-y-4">
                  {comments.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No comments yet. Be the first to comment!
                    </p>
                  ) : (
                    comments.map((comment) => (
                      <div
                        key={comment.id}
                        className="border rounded-lg p-4 space-y-2"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              {comment.user.userType === "assistant" ? (
                                <span className="text-sm">🤖</span>
                              ) : (
                                <span className="text-sm">👤</span>
                              )}
                              <span className="font-medium text-sm">
                                {comment.user.displayName || comment.user.id}
                              </span>
                            </div>
                            <Badge
                              variant={
                                comment.user.userType === "assistant"
                                  ? "default"
                                  : "secondary"
                              }
                              className="text-xs"
                            >
                              {comment.user.userType === "assistant"
                                ? "AI Assistant"
                                : "Team Member"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {formatDateForDisplay(comment.createdAt)}
                              {comment.updatedAt !== comment.createdAt &&
                                " (edited)"}
                            </span>
                            {/* Only show edit/delete for current user's comments */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                >
                                  <MoreHorizontal className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setEditingCommentId(comment.id);
                                    setEditingCommentContent(comment.content);
                                  }}
                                >
                                  <Edit3 className="mr-2 h-3 w-3" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleDeleteComment(comment.id)
                                  }
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="mr-2 h-3 w-3" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>

                        {editingCommentId === comment.id ? (
                          <div className="space-y-2">
                            <Textarea
                              value={editingCommentContent}
                              onChange={(e) =>
                                setEditingCommentContent(e.target.value)
                              }
                              rows={3}
                              className="resize-none"
                            />
                            <div className="flex gap-2 justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditingCommentId(null);
                                  setEditingCommentContent("");
                                }}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleEditComment(comment.id)}
                                disabled={!editingCommentContent.trim()}
                              >
                                Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <MarkdownDisplayWithAssets
                            content={comment.content}
                            className="text-sm prose-sm"
                          />
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Task Details */}
        <div className="w-full lg:w-80 space-y-4">
          {/* Task Details Card */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4 text-sm">
                {/* Status */}
                <div>
                  <Label>Status</Label>
                  {isEditing ? (
                    <Select
                      value={editForm.status}
                      onValueChange={(value: TaskStatus) =>
                        handleInputChange("status", value)
                      }
                    >
                      <SelectTrigger className="w-fit min-w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not-started">Not Started</SelectItem>
                        <SelectItem value="in-progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    getStatusBadge(task.status)
                  )}
                </div>

                <div>
                  <Label>Due Date</Label>
                  {isEditing ? (
                    <DueDatePicker
                      value={editForm.dueDate}
                      onChange={(value) => handleInputChange("dueDate", value)}
                    />
                  ) : (
                    <p className="text-muted-foreground flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {formatDateForDisplay(task.dueDate)}
                    </p>
                  )}
                </div>

                {/* Recurrence */}
                {isEditing && (
                  <div>
                    <RecurrenceToggle
                      value={editForm.recurrence}
                      onChange={(config) =>
                        handleInputChange("recurrence", config)
                      }
                      dueDate={editForm.dueDate}
                    />
                  </div>
                )}

                {!isEditing && (
                  <div>
                    <Label className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4" />
                      Recurrence
                    </Label>
                    <div className="text-sm text-muted-foreground">
                      {task.isRecurring ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <RefreshCw className="h-3 w-3 text-blue-500" />
                            <span>This task repeats</span>
                          </div>
                          {task.nextRunAt && (
                            <div className="text-xs">
                              Next run: {formatDateForDisplay(task.nextRunAt)}
                            </div>
                          )}
                          {task.recurrenceEndDate && (
                            <div className="text-xs">
                              Until:{" "}
                              {formatDateForDisplay(task.recurrenceEndDate)}
                            </div>
                          )}
                          {task.recurrenceLimit && (
                            <div className="text-xs">
                              Max executions: {task.recurrenceLimit}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span>No recurrence</span>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <Label>Assigned To</Label>
                  {isEditing ? (
                    <Select
                      value={editForm.assignedToId || "UNASSIGNED"}
                      onValueChange={(value) =>
                        handleInputChange(
                          "assignedToId",
                          value === "UNASSIGNED" ? "" : value,
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select assignee" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
                        {users.some((u) => u.userType === "assistant") && (
                          <>
                            <SelectItem
                              value="__section_ai__"
                              disabled
                              className="text-xs font-semibold text-muted-foreground"
                            >
                              AI Assistants
                            </SelectItem>
                            {users
                              .filter((u) => u.userType === "assistant")
                              .map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  🤖 {user.displayName || user.email || user.id}
                                </SelectItem>
                              ))}
                          </>
                        )}
                        {users.some((u) => u.userType !== "assistant") && (
                          <>
                            <SelectItem
                              value="__section_team__"
                              disabled
                              className="text-xs font-semibold text-muted-foreground"
                            >
                              Team Members
                            </SelectItem>
                            {users
                              .filter((u) => u.userType !== "assistant")
                              .map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  👤 {user.displayName || user.email || user.id}
                                </SelectItem>
                              ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-muted-foreground">
                      {task.assignedToId
                        ? (() => {
                            const assignee = users.find(
                              (u) => u.id === task.assignedToId,
                            );
                            const displayName = assignee
                              ? assignee.displayName ||
                                assignee.email ||
                                assignee.id
                              : task.assignedToId;
                            const icon =
                              assignee?.userType === "assistant" ? "🤖" : "👤";
                            return `${icon} ${displayName}`;
                          })()
                        : "Unassigned"}
                    </p>
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
                        {formatDateForDisplay(task.createdAt)}
                      </p>
                    </div>

                    <div>
                      <Label className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Updated
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formatDateForDisplay(task.updatedAt)}
                      </p>
                    </div>

                    {/* Completion Date - Only show when task is completed */}
                    {task.status === "completed" && task.completedAt && (
                      <div>
                        <Label className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Completed
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          {formatDateForDisplay(task.completedAt)}
                        </p>
                      </div>
                    )}

                    {/* Tags Section */}
                    <div>
                      <Label>Tags</Label>
                      {isEditing ? (
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-2">
                            {editForm.tags.map((tag) => (
                              <Badge
                                key={tag}
                                variant="secondary"
                                className="flex items-center gap-1"
                              >
                                {tag}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveTag(tag)}
                                  className="ml-1 hover:text-destructive"
                                >
                                  <X className="h-3 w-3" />
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
                        <div className="flex flex-wrap gap-2">
                          {task.tags.length > 0 ? (
                            task.tags.map((tag) => (
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
                      )}
                    </div>

                    <div>
                      <Label>Processing Status</Label>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge
                          variant={
                            task.enabled === false
                              ? "outline"
                              : task.processingStatus === "completed"
                                ? "default"
                                : task.processingStatus === "failed"
                                  ? "destructive"
                                  : "secondary"
                          }
                          className={`${task.enabled !== false ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
                          onClick={
                            task.enabled !== false
                              ? () => {
                                  navigate({
                                    to: `/processing?assetType=tasks&assetId=${task.id}`,
                                  });
                                }
                              : undefined
                          }
                          title={
                            task.enabled !== false
                              ? "Click to view processing details"
                              : "Processing is disabled for this task"
                          }
                        >
                          {task.enabled === false ? (
                            "disabled"
                          ) : task.processingStatus === "processing" ? (
                            <span className="flex items-center gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              processing
                            </span>
                          ) : (
                            (task.processingStatus || "unknown").replace(
                              /_/g,
                              " ",
                            )
                          )}
                        </Badge>

                        {/* Show reprocess button for completed, failed, or stuck jobs but not disabled */}
                        {task.enabled !== false &&
                          (task.processingStatus === "completed" ||
                            task.processingStatus === "failed" ||
                            isJobStuck(task)) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setShowReprocessDialog(true)}
                              disabled={isReprocessing}
                              title="Reprocess task"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          )}
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
      <Dialog
        open={isConfirmDeleteDialogOpen}
        onOpenChange={setIsConfirmDeleteDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this task? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          {taskToDelete && (
            <div className="my-4 flex items-start gap-3 p-3 border rounded-md bg-muted/50">
              <TaskIcon
                task={taskToDelete}
                className="h-6 w-6 flex-shrink-0 mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium break-words line-clamp-2 leading-tight">
                  {taskToDelete.title}
                </p>
                <p className="text-sm text-muted-foreground truncate mt-1">
                  ID: {taskToDelete.id}
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="sm:justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setIsConfirmDeleteDialogOpen(false);
                setTaskToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirmed}>
              Delete Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reprocess Confirmation Dialog */}
      <Dialog open={showReprocessDialog} onOpenChange={setShowReprocessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprocess Task</DialogTitle>
            <DialogDescription>
              This will re-analyze the task content, update processing metadata,
              and reprocess all AI-generated data for this task. This may take a
              few minutes.
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
  );
}

// Simple task icon component for the delete dialog
function TaskIcon({
  task: _task,
  className,
}: {
  task: Task;
  className?: string;
}) {
  // Use the CheckCircle2 icon as default for tasks
  return <CheckCircle2 className={className} />;
}
