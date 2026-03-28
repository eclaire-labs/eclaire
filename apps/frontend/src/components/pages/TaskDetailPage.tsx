import { Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  Bot,
  Calendar,
  CheckCircle2,
  Edit3,
  Link2,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ThumbsUp,
  Trash2,
  X,
  Zap,
} from "lucide-react";

const routeApi = getRouteApi("/_authenticated/tasks/$id");

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DeleteConfirmDialog } from "@/components/detail-page/DeleteConfirmDialog";
import { ProcessingStatusBadge } from "@/components/detail-page/ProcessingStatusBadge";
import { ReprocessDialog } from "@/components/detail-page/ReprocessDialog";
import { MarkdownDisplayWithAssets } from "@/components/markdown-display-with-assets";
import { ActorPicker } from "@/components/shared/ActorPicker";
import { DueDatePicker } from "@/components/shared/due-date-picker";
import { PinFlagControls } from "@/components/shared/pin-flag-controls";
import { TagEditor } from "@/components/shared/TagEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useActors } from "@/hooks/use-actors";
import { useDetailPageActions } from "@/hooks/use-detail-page-actions";
import { useTask, useTasks } from "@/hooks/use-tasks";
import { apiFetch } from "@/lib/api-client";
import {
  createTaskComment,
  deleteTaskComment,
  updateTaskComment,
} from "@/lib/api-comments";
import { formatDate } from "@/lib/date-utils";
import type { TaskComment, TaskStatus } from "@/types/task";
import { CreateTaskDialog } from "./tasks/CreateTaskDialog";
import { TaskExecutionHistory } from "./tasks/TaskExecutionHistory";
import {
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  getPriorityIcon,
  getPriorityLabel,
  getStatusConfig,
  getStatusIcon,
} from "./tasks/task-utils";

export function TaskDetailClient() {
  const { id: taskId } = routeApi.useParams();
  const navigate = useNavigate();
  // Use React Query hook for data fetching
  const { task, isLoading, error, refresh } = useTask(taskId);

  const actions = useDetailPageActions({
    contentType: "tasks",
    item: task,
    refresh,
    onDeleted: () => navigate({ to: "/tasks" }),
  });

  // Sub-tasks
  const {
    tasks: subTasks,
    createTask: createSubTask,
    updateTaskStatus: updateSubTaskStatus,
    isLoading: isLoadingSubTasks,
  } = useTasks({ parentId: taskId });
  const [showCreateSubTask, setShowCreateSubTask] = useState(false);
  const [isCreatingSubTask, setIsCreatingSubTask] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const { actors } = useActors(["human", "agent"]);

  // Comments state
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState("");

  // Form state for editing
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    taskStatus: "open" as TaskStatus,
    priority: 0,
    dueAt: "",
    delegateActorId: "",
    delegateMode: "manual" as "manual" | "assist" | "handle",
    tags: [] as string[],
  });

  // Initialize local state for editing when task data is available
  useEffect(() => {
    if (task && !isEditing) {
      setEditForm({
        title: task.title,
        description: task.description || "",
        taskStatus: task.taskStatus,
        priority: task.priority ?? 0,
        dueAt: task.dueAt || "",
        delegateActorId: task.delegateActorId || "",
        delegateMode: task.delegateMode || "manual",
        tags: [...task.tags],
      });
    }
  }, [task, isEditing]);

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

      toast.success("Comment added", {
        description: "Your comment has been added successfully.",
      });
    } catch (error) {
      console.error("Error adding comment:", error);
      toast.error("Error", {
        description: "Failed to add comment. Please try again.",
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

      toast.success("Comment updated", {
        description: "Your comment has been updated successfully.",
      });
    } catch (error) {
      console.error("Error updating comment:", error);
      toast.error("Error", {
        description: "Failed to update comment. Please try again.",
      });
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!task) return;

    try {
      await deleteTaskComment(task.id, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));

      toast.success("Comment deleted", {
        description: "Comment has been deleted successfully.",
      });
    } catch (error) {
      console.error("Error deleting comment:", error);
      toast.error("Error", {
        description: "Failed to delete comment. Please try again.",
      });
    }
  };

  const handleReviewAction = async (action: "approve" | "request_changes") => {
    if (!task) return;
    try {
      setIsReviewing(true);
      const endpoint = action === "approve" ? "approve" : "request-changes";
      const response = await apiFetch(`/api/tasks/${taskId}/${endpoint}`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to update review status");
      refresh();
      toast.success(
        action === "approve" ? "Output approved" : "Changes requested",
        {
          description:
            action === "approve"
              ? "Task marked as completed."
              : "Task kept in progress for the agent to revise.",
        },
      );
    } catch (error) {
      console.error("Error updating review status:", error);
      toast.error("Error", {
        description: "Failed to update review status. Please try again.",
      });
    } finally {
      setIsReviewing(false);
    }
  };

  const renderStatusBadge = (status: TaskStatus) => {
    const config = getStatusConfig(status);
    return (
      <Badge
        variant="outline"
        className={`flex items-center gap-1 ${config.badgeClass}`}
      >
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
        taskStatus: task.taskStatus,
        priority: task.priority ?? 0,
        dueAt: task.dueAt || "",
        delegateActorId: task.delegateActorId || "",
        delegateMode: task.delegateMode || "manual",
        tags: [...task.tags],
      });
    }
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!task) return;

    try {
      setIsSaving(true);
      const updateData = {
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        taskStatus: editForm.taskStatus,
        priority: editForm.priority,
        dueAt: editForm.dueAt ? new Date(editForm.dueAt).toISOString() : null,
        delegateActorId: editForm.delegateActorId.trim() || null,
        delegateMode: editForm.delegateMode,
        tags: editForm.tags,
      };

      const response = await apiFetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        throw new Error("Failed to update task");
      }

      await response.json();
      setIsEditing(false);

      // Refresh to get the latest data from server
      refresh();

      toast.success("Task updated", {
        description: "Your task has been updated successfully.",
      });
    } catch (error) {
      console.error("Error updating task:", error);
      toast.error("Error", {
        description: "Failed to update task. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
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
    <TooltipProvider>
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
            <PinFlagControls
              size="md"
              isPinned={task.isPinned}
              flagColor={task.flagColor}
              onPinToggle={actions.handlePinToggle}
              onFlagToggle={actions.handleFlagToggle}
              onFlagColorChange={actions.handleFlagColorChange}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={actions.handleChatClick}
              title="Chat about this task"
            >
              <MessageCircle className="h-4 w-4" />
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
                  variant="destructive"
                  onClick={actions.openDeleteDialog}
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
                {/* Agent Review Banner */}
                {task.reviewStatus === "pending" &&
                  task.delegateMode !== "manual" && (
                    <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-4">
                      <div className="flex items-start gap-3">
                        <Bot className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-amber-900 dark:text-amber-200">
                            Agent output needs review
                          </p>
                          <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                            The agent has completed its work on this task.
                            Review the output in the comments below, then
                            approve or request changes.
                          </p>
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              onClick={() => handleReviewAction("approve")}
                              disabled={isReviewing}
                            >
                              <ThumbsUp className="mr-1.5 h-3.5 w-3.5" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                handleReviewAction("request_changes")
                              }
                              disabled={isReviewing}
                            >
                              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                              Request Changes
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

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
                                {comment.author.kind === "agent" ? (
                                  <span className="text-sm">🤖</span>
                                ) : (
                                  <span className="text-sm">👤</span>
                                )}
                                <span className="font-medium text-sm">
                                  {comment.author.displayName ||
                                    comment.author.id}
                                </span>
                              </div>
                              <Badge
                                variant={
                                  comment.author.kind === "agent"
                                    ? "default"
                                    : "secondary"
                                }
                                className="text-xs"
                              >
                                {comment.author.kind === "agent"
                                  ? "Agent"
                                  : "Team Member"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                {formatDate(comment.createdAt)}
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
          <div className="w-full lg:w-80 space-y-6">
            {/* Task Details Card */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4 text-sm">
                  {/* Parent Task Link */}
                  {task.parentId && (
                    <div>
                      <Label className="flex items-center gap-2">
                        <Link2 className="h-4 w-4" />
                        Parent Task
                      </Label>
                      <Button
                        variant="link"
                        className="h-auto p-0 text-sm"
                        onClick={() =>
                          navigate({
                            to: "/tasks/$id",
                            params: { id: task.parentId ?? "" },
                          })
                        }
                      >
                        View parent task
                      </Button>
                    </div>
                  )}

                  {/* Delegated By */}
                  {task.delegatedByActorId && (
                    <div>
                      <Label className="flex items-center gap-2">
                        <Bot className="h-4 w-4" />
                        Delegated By
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {(() => {
                          const delegator = actors.find(
                            (a) => a.id === task.delegatedByActorId,
                          );
                          return delegator?.label || task.delegatedByActorId;
                        })()}
                      </p>
                    </div>
                  )}

                  {/* Status */}
                  <div>
                    <Label>Status</Label>
                    {isEditing ? (
                      <Select
                        value={editForm.taskStatus}
                        onValueChange={(value: TaskStatus) =>
                          handleInputChange("taskStatus", value)
                        }
                      >
                        <SelectTrigger className="w-fit min-w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      renderStatusBadge(task.taskStatus)
                    )}
                  </div>

                  {/* Priority */}
                  <div>
                    <Label>Priority</Label>
                    {isEditing ? (
                      <Select
                        value={String(editForm.priority)}
                        onValueChange={(value) =>
                          handleInputChange("priority", Number(value))
                        }
                      >
                        <SelectTrigger className="w-fit min-w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center gap-2">
                        {getPriorityIcon(task.priority)}
                        <span className="text-muted-foreground">
                          {getPriorityLabel(task.priority)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div>
                    <Label>Due Date</Label>
                    {isEditing ? (
                      <DueDatePicker
                        value={editForm.dueAt}
                        onChange={(value) => handleInputChange("dueAt", value)}
                      />
                    ) : (
                      <p className="text-muted-foreground flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {task.dueAt
                          ? formatDate(task.dueAt)
                          : "No due date set"}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label>Assigned To</Label>
                    {isEditing ? (
                      <ActorPicker
                        actors={actors}
                        value={editForm.delegateActorId || null}
                        allowUnassigned
                        placeholder="Search people and agents"
                        searchPlaceholder="Search people and agents..."
                        onChange={(value) =>
                          handleInputChange("delegateActorId", value ?? "")
                        }
                      />
                    ) : (
                      <p className="text-muted-foreground">
                        {task.delegateActorId
                          ? (() => {
                              const assigneeId = task.delegateActorId;
                              const assignee = actors.find(
                                (actor) => actor.id === assigneeId,
                              );
                              const displayName = assignee?.label || assigneeId;
                              const icon =
                                assignee?.kind === "agent" ? "🤖" : "👤";
                              return `${icon} ${displayName}`;
                            })()
                          : "Unassigned"}
                      </p>
                    )}
                  </div>

                  {/* Execution Mode */}
                  {isEditing ? (
                    <div>
                      <Label className="flex items-center gap-2">
                        <Bot className="h-4 w-4" />
                        Execution Mode
                      </Label>
                      <Select
                        value={editForm.delegateMode}
                        onValueChange={(
                          value: "manual" | "assist" | "handle",
                        ) => handleInputChange("delegateMode", value)}
                      >
                        <SelectTrigger className="w-fit min-w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">Manual</SelectItem>
                          <SelectItem value="assist">Agent Assists</SelectItem>
                          <SelectItem value="handle">Agent Handles</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    task.delegateMode !== "manual" && (
                      <div>
                        <Label className="flex items-center gap-2">
                          <Bot className="h-4 w-4" />
                          Execution Mode
                        </Label>
                        <Badge variant="outline" className="mt-1">
                          {task.delegateMode === "assist"
                            ? "Agent Assists"
                            : "Agent Handles"}
                        </Badge>
                      </div>
                    )
                  )}

                  {isEditing && (
                    <TagEditor
                      tags={editForm.tags}
                      onAddTag={(tag) =>
                        handleInputChange("tags", [...editForm.tags, tag])
                      }
                      onRemoveTag={(tag) =>
                        handleInputChange(
                          "tags",
                          editForm.tags.filter((t: string) => t !== tag),
                        )
                      }
                    />
                  )}

                  {!isEditing && (
                    <>
                      <div>
                        <Label className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Created
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          {formatDate(task.createdAt)}
                        </p>
                      </div>

                      <div>
                        <Label className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Updated
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          {formatDate(task.updatedAt)}
                        </p>
                      </div>

                      {/* Completion Date - Only show when task is completed */}
                      {task.taskStatus === "completed" && task.completedAt && (
                        <div>
                          <Label className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Completed
                          </Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            {formatDate(task.completedAt)}
                          </p>
                        </div>
                      )}

                      {/* Tags Section */}
                      <div>
                        <Label>Tags</Label>
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
                      </div>

                      {/* Sub-tasks Section — only on top-level tasks */}
                      {!task.parentId && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <Label>Sub-tasks</Label>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => setShowCreateSubTask(true)}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add
                            </Button>
                          </div>
                          {isLoadingSubTasks ? (
                            <div className="flex items-center gap-2 text-muted-foreground text-xs py-2">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Loading...
                            </div>
                          ) : subTasks.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No sub-tasks
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {subTasks.map((sub) => {
                                const statusCfg = getStatusConfig(
                                  sub.taskStatus,
                                );
                                return (
                                  <button
                                    type="button"
                                    key={sub.id}
                                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer group text-left"
                                    onClick={() =>
                                      navigate({
                                        to: "/tasks/$id",
                                        params: { id: sub.id },
                                      })
                                    }
                                  >
                                    <button
                                      type="button"
                                      className="flex-shrink-0"
                                      title={`Status: ${statusCfg.label}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const nextStatus =
                                          sub.taskStatus === "completed"
                                            ? "open"
                                            : "completed";
                                        updateSubTaskStatus(sub.id, nextStatus);
                                      }}
                                    >
                                      {getStatusIcon(sub.taskStatus)}
                                    </button>
                                    <span className="text-sm truncate flex-1">
                                      {sub.title}
                                    </span>
                                    {sub.priority > 0 && (
                                      <span className="flex-shrink-0">
                                        {getPriorityIcon(sub.priority)}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Schedule Info */}
                      {task.scheduleType !== "none" && task.scheduleSummary && (
                        <div>
                          <Label className="flex items-center gap-2">
                            <RefreshCw className="h-4 w-4" />
                            Schedule
                          </Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            {task.scheduleSummary}
                          </p>
                        </div>
                      )}

                      {/* Execution History */}
                      {task.delegateMode !== "manual" && (
                        <TaskExecutionHistory
                          taskId={task.id}
                          isRecurring={task.scheduleType === "recurring"}
                        />
                      )}

                      <div>
                        <Label>Processing Status</Label>
                        <div className="mt-1">
                          <ProcessingStatusBadge
                            contentType="tasks"
                            itemId={task.id}
                            processingStatus={task.processingStatus}
                            processingEnabled={task.processingEnabled}
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
          label="Task"
          onConfirm={actions.confirmDelete}
          isDeleting={actions.isDeleting}
        >
          <div className="my-4 flex items-start gap-3 p-3 border rounded-md bg-muted/50">
            <CheckCircle2 className="h-6 w-6 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="font-medium break-words line-clamp-2 leading-tight">
                {task.title}
              </p>
              <p className="text-sm text-muted-foreground truncate mt-1">
                ID: {task.id}
              </p>
            </div>
          </div>
        </DeleteConfirmDialog>

        {/* Reprocess Confirmation Dialog */}
        <ReprocessDialog
          open={actions.showReprocessDialog}
          onOpenChange={actions.setShowReprocessDialog}
          label="Task"
          isReprocessing={actions.isReprocessing}
          onConfirm={actions.handleReprocess}
        />

        {/* Create Sub-task Dialog */}
        <CreateTaskDialog
          open={showCreateSubTask}
          onOpenChange={setShowCreateSubTask}
          parentId={task.id}
          onCreateTask={async (data) => {
            setIsCreatingSubTask(true);
            try {
              await createSubTask(data);
              setShowCreateSubTask(false);
              toast.success("Sub-task created");
            } catch {
              toast.error("Failed to create sub-task");
            } finally {
              setIsCreatingSubTask(false);
            }
          }}
          isCreating={isCreatingSubTask}
          assigneeOptions={actors}
        />
      </div>
    </TooltipProvider>
  );
}
