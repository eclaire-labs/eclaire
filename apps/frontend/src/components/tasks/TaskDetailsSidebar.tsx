import { Bot, Calendar, CheckCircle2, RefreshCw } from "lucide-react";
import { createElement } from "react";

import { ProcessingStatusBadge } from "@/components/detail-page/ProcessingStatusBadge";
import {
  getEffectiveStatusDisplay,
  getPriorityIcon,
  getPriorityLabel,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
} from "@/components/pages/tasks/task-utils";
import { ActorPicker } from "@/components/shared/ActorPicker";
import { DueDatePicker } from "@/components/shared/due-date-picker";
import { TagEditor } from "@/components/shared/TagEditor";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ActorOption } from "@/hooks/use-actors";
import { formatDate } from "@/lib/date-utils";
import type { Task, TaskStatus } from "@/types/task";

/** Form state for editing a task on the detail page. */
export interface TaskEditForm {
  title: string;
  description: string;
  taskStatus: TaskStatus;
  priority: number;
  dueDate: string;
  delegateActorId: string;
  delegateMode: "manual" | "assist" | "handle";
  tags: string[];
}

interface TaskDetailsSidebarProps {
  task: Task;
  actors: ActorOption[];
  isEditing: boolean;
  editForm: TaskEditForm;
  onInputChange: (
    field: keyof TaskEditForm,
    value: TaskEditForm[keyof TaskEditForm] | null,
  ) => void;
  isJobStuck: boolean;
  isReprocessing: boolean;
  onReprocessClick: () => void;
}

/** Status / priority / assignee / execution-mode / schedule sidebar card. */
export function TaskDetailsSidebar({
  task,
  actors,
  isEditing,
  editForm,
  onInputChange,
  isJobStuck,
  isReprocessing,
  onReprocessClick,
}: TaskDetailsSidebarProps) {
  const renderStatusBadge = () => {
    const config = getEffectiveStatusDisplay(task);
    return (
      <Badge
        variant="outline"
        className={`flex items-center gap-1 ${config.badgeClass}`}
      >
        {createElement(config.icon, {
          className: `h-4 w-4 ${config.iconClass}`,
        })}
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="w-full lg:w-80 space-y-6">
      {/* Task Details Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4 text-sm">
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
                    onInputChange("taskStatus", value)
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
                renderStatusBadge()
              )}
            </div>

            {/* Priority */}
            <div>
              <Label>Priority</Label>
              {isEditing ? (
                <Select
                  value={String(editForm.priority)}
                  onValueChange={(value) =>
                    onInputChange("priority", Number(value))
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
                  value={editForm.dueDate}
                  onChange={(value) => onInputChange("dueDate", value)}
                />
              ) : (
                <p className="text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {task.dueDate ? formatDate(task.dueDate) : "No due date set"}
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
                    onInputChange("delegateActorId", value ?? "")
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
                        const icon = assignee?.kind === "agent" ? "🤖" : "👤";
                        return `${icon} ${displayName}`;
                      })()
                    : "Unassigned"}
                </p>
              )}
            </div>

            {/* Execution Mode */}
            {isEditing
              ? editForm.delegateMode !== "manual" && (
                  <div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.delegateMode === "assist"}
                        onChange={(e) =>
                          onInputChange(
                            "delegateMode",
                            e.target.checked ? "assist" : "handle",
                          )
                        }
                        className="rounded border-border"
                      />
                      Require review before completing
                    </label>
                  </div>
                )
              : task.delegateMode !== "manual" && (
                  <div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={task.delegateMode === "assist"}
                        disabled
                        className="rounded border-border"
                      />
                      Require review before completing
                    </label>
                  </div>
                )}

            {isEditing && (
              <TagEditor
                tags={editForm.tags}
                onAddTag={(tag) =>
                  onInputChange("tags", [...editForm.tags, tag])
                }
                onRemoveTag={(tag) =>
                  onInputChange(
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
                      <p className="text-sm text-muted-foreground">No tags</p>
                    )}
                  </div>
                </div>

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

                {/* Execution History moved to main content area tabs */}

                <div>
                  <Label>Processing Status</Label>
                  <div className="mt-1">
                    <ProcessingStatusBadge
                      contentType="tasks"
                      itemId={task.id}
                      processingStatus={task.processingStatus}
                      processingEnabled={task.processingEnabled}
                      isJobStuck={isJobStuck}
                      isReprocessing={isReprocessing}
                      onReprocessClick={onReprocessClick}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
