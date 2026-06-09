import { Edit3, MoreHorizontal, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MarkdownDisplayWithAssets } from "@/components/markdown-display-with-assets";
import { TaskExecutionHistory } from "@/components/pages/tasks/TaskExecutionHistory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTaskComments } from "@/hooks/use-task-comments";
import { formatDate } from "@/lib/date-utils";
import type { Task } from "@/types/task";

interface TaskCommentsSectionProps {
  task: Task;
  /** Called after a comment is added (backend may trigger agent on delegated tasks). */
  onCommentAdded?: () => void;
}

/** Comments + execution-history tabs section of the task detail page. */
export function TaskCommentsSection({
  task,
  onCommentAdded,
}: TaskCommentsSectionProps) {
  const [activeTab, setActiveTab] = useState<"comments" | "history">(
    "comments",
  );
  const [newComment, setNewComment] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState("");

  const {
    comments,
    addComment,
    updateComment,
    deleteComment,
    isAddingComment,
  } = useTaskComments(task.id, { initialComments: task.comments });

  // Comment management functions
  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    try {
      await addComment(newComment.trim());
      setNewComment("");
      onCommentAdded?.(); // Refresh task data (backend may trigger agent on delegated tasks)

      toast.success("Comment added", {
        description: "Your comment has been added successfully.",
      });
    } catch {
      // Error toast is handled by the hook
    }
  };

  const handleEditComment = async (commentId: string) => {
    if (!editingCommentContent.trim()) return;

    try {
      await updateComment(commentId, editingCommentContent.trim());
      setEditingCommentId(null);
      setEditingCommentContent("");

      toast.success("Comment updated", {
        description: "Your comment has been updated successfully.",
      });
    } catch {
      // Error toast is handled by the hook
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteComment(commentId);

      toast.success("Comment deleted", {
        description: "Comment has been deleted successfully.",
      });
    } catch {
      // Error toast is handled by the hook
    }
  };

  return (
    <div className="space-y-4 pt-6 border-t">
      {task.delegateMode !== "manual" && (
        <div className="flex gap-1 border-b">
          <button
            type="button"
            className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === "comments"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("comments")}
          >
            Comments ({comments.length})
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === "history"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("history")}
          >
            Execution History
          </button>
        </div>
      )}
      {task.delegateMode === "manual" && (
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">
            Comments ({comments.length})
          </Label>
        </div>
      )}

      {/* Execution History Tab Panel */}
      {task.delegateMode !== "manual" && activeTab === "history" && (
        <div className="pt-2">
          <TaskExecutionHistory
            taskId={task.id}
            isRecurring={task.scheduleType === "recurring"}
            autoOpen
            fullWidth
          />
        </div>
      )}

      {/* Comments Tab Panel */}
      {(task.delegateMode === "manual" || activeTab === "comments") && (
        <>
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
                          {comment.author.displayName || comment.author.id}
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
                        {comment.updatedAt !== comment.createdAt && " (edited)"}
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
                            onClick={() => handleDeleteComment(comment.id)}
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
        </>
      )}
    </div>
  );
}
