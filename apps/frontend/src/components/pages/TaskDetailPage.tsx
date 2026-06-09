import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Edit3,
  MessageCircle,
  Save,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";

const routeApi = getRouteApi("/_authenticated/tasks/$id");

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DeleteConfirmDialog } from "@/components/detail-page/DeleteConfirmDialog";
import { ReprocessDialog } from "@/components/detail-page/ReprocessDialog";
import { MarkdownDisplayWithAssets } from "@/components/markdown-display-with-assets";
import { PageError, PageLoading } from "@/components/shared/page-state";
import { PinFlagControls } from "@/components/shared/pin-flag-controls";
import { TaskCommentsSection } from "@/components/tasks/TaskCommentsSection";
import {
  type TaskEditForm,
  TaskDetailsSidebar,
} from "@/components/tasks/TaskDetailsSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useActors } from "@/hooks/use-actors";
import { useDetailPageActions } from "@/hooks/use-detail-page-actions";
import { useTask } from "@/hooks/use-tasks";

export function TaskDetailClient() {
  const { id: taskId } = routeApi.useParams();
  const navigate = useNavigate();
  // Use React Query hook for data fetching
  const {
    task,
    isLoading,
    error,
    refresh,
    update,
    isUpdating: isSaving,
    review,
    isReviewing,
  } = useTask(taskId);

  const actions = useDetailPageActions({
    contentType: "tasks",
    item: task,
    refresh,
    onDeleted: () => navigate({ to: "/tasks" }),
  });

  const [isEditing, setIsEditing] = useState(false);
  const { actors } = useActors(["human", "agent"]);

  // Form state for editing
  const [editForm, setEditForm] = useState<TaskEditForm>({
    title: "",
    description: "",
    taskStatus: "open",
    priority: 0,
    dueDate: "",
    delegateActorId: "",
    delegateMode: "manual",
    tags: [],
  });

  // Initialize local state for editing when task data is available
  useEffect(() => {
    if (task && !isEditing) {
      setEditForm({
        title: task.title,
        description: task.description || "",
        taskStatus: task.taskStatus,
        priority: task.priority ?? 0,
        dueDate: task.dueDate || "",
        delegateActorId: task.delegateActorId || "",
        delegateMode: task.delegateMode || "manual",
        tags: [...task.tags],
      });
    }
  }, [task, isEditing]);

  const handleReviewAction = async (action: "approve" | "request_changes") => {
    if (!task) return;
    try {
      await review(action);
      toast.success(
        action === "approve" ? "Output approved" : "Changes requested",
        {
          description:
            action === "approve"
              ? "Task marked as completed."
              : "Task kept in progress for the agent to revise.",
        },
      );
    } catch {
      // Error toast is handled by the hook
    }
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
        dueDate: task.dueDate || "",
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
      await update({
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        taskStatus: editForm.taskStatus,
        priority: editForm.priority,
        dueDate: editForm.dueDate
          ? new Date(editForm.dueDate).toISOString()
          : null,
        delegateActorId: editForm.delegateActorId.trim() || null,
        delegateMode: editForm.delegateMode,
        tags: editForm.tags,
      });
      setIsEditing(false);

      toast.success("Task updated", {
        description: "Your task has been updated successfully.",
      });
    } catch {
      // Error toast is handled by the hook
    }
  };

  const handleInputChange = (
    field: keyof TaskEditForm,
    value: TaskEditForm[keyof TaskEditForm] | null,
  ) => {
    setEditForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  if (isLoading) {
    return <PageLoading variant="detail" backTo="/tasks" />;
  }

  if (error || (!isLoading && !task)) {
    return (
      <PageError
        title="Task not found"
        message="The task you're looking for doesn't exist or couldn't be loaded."
        backTo="/tasks"
        backLabel="Go to Tasks"
      />
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
                            The agent has completed its work. Add a comment
                            below to request changes, or approve to complete.
                          </p>
                          {task.latestResultSummary ? (
                            <div className="mt-2 rounded bg-white/60 dark:bg-black/20 p-3 max-h-40 overflow-y-auto text-sm text-amber-900 dark:text-amber-200 whitespace-pre-wrap">
                              {task.latestResultSummary}
                            </div>
                          ) : (
                            <p className="mt-2 text-xs italic text-amber-600 dark:text-amber-500">
                              No text output was produced. Check the Execution
                              History tab below for details.
                            </p>
                          )}
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              onClick={() => handleReviewAction("approve")}
                              disabled={isReviewing}
                            >
                              <ThumbsUp className="mr-1.5 h-3.5 w-3.5" />
                              Approve
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

                {/* Comments / Execution History */}
                <TaskCommentsSection task={task} onCommentAdded={refresh} />
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Task Details */}
          <TaskDetailsSidebar
            task={task}
            actors={actors}
            isEditing={isEditing}
            editForm={editForm}
            onInputChange={handleInputChange}
            isJobStuck={actions.isJobStuck}
            isReprocessing={actions.isReprocessing}
            onReprocessClick={() => actions.setShowReprocessDialog(true)}
          />
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
      </div>
    </TooltipProvider>
  );
}
