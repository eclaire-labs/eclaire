import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ActorOption } from "@/hooks/use-actors";
import type { Task, TaskStatus } from "@/types/task";

import { CREATE_STATUS_OPTIONS } from "./task-utils";
import { TaskFormFields } from "./TaskFormFields";

const INITIAL_TASK: Omit<Task, "id"> = {
  title: "",
  description: null,
  prompt: null,
  taskStatus: "open",
  dueDate: null,
  delegateActorId: null,
  delegateMode: "manual",
  delegatedByActorId: null,
  attentionStatus: "none",
  reviewStatus: "none",
  scheduleType: "none",
  scheduleRule: null,
  scheduleSummary: null,
  timezone: null,
  nextOccurrenceAt: null,
  maxOccurrences: null,
  occurrenceCount: 0,
  latestExecutionStatus: null,
  latestResultSummary: null,
  latestErrorSummary: null,
  deliveryTargets: null,
  sourceConversationId: null,
  tags: [],
  createdAt: "",
  updatedAt: "",
  userId: "",
  flagColor: null,
  isPinned: false,
  processingEnabled: true,
  priority: 0,
  sortOrder: null,
  processingStatus: null,
  completedAt: null,
};

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateTask: (data: Omit<Task, "id">) => Promise<void>;
  isCreating: boolean;
  defaultAssigneeId?: string;
  assigneeOptions: ActorOption[];
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  onCreateTask,
  isCreating,
  defaultAssigneeId,
  assigneeOptions,
}: CreateTaskDialogProps) {
  const [task, setTask] = useState<Omit<Task, "id">>({
    ...INITIAL_TASK,
    delegateActorId: defaultAssigneeId ?? null,
    userId: "",
  });

  const reset = (assigneeId?: string) =>
    setTask({
      ...INITIAL_TASK,
      delegateActorId: assigneeId ?? defaultAssigneeId ?? null,
      userId: "",
    });

  const handleSubmit = async () => {
    await onCreateTask(task);
    reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[625px]">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
          <DialogDescription>Add a new task to your list.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto px-2">
            <TaskFormFields
              idPrefix="new"
              title={task.title}
              titlePlaceholder="Task title"
              onTitleChange={(value) => setTask({ ...task, title: value })}
              description={task.description}
              descriptionPlaceholder="Task description (optional)"
              onDescriptionChange={(value) =>
                setTask({ ...task, description: value })
              }
              taskStatus={task.taskStatus}
              statusOptions={CREATE_STATUS_OPTIONS}
              onStatusChange={(value) =>
                setTask({ ...task, taskStatus: value as TaskStatus })
              }
              priority={task.priority}
              onPriorityChange={(value) =>
                setTask({ ...task, priority: value })
              }
              dueDate={task.dueDate}
              onDueDateChange={(value) =>
                setTask({ ...task, dueDate: value ?? null })
              }
              actors={assigneeOptions}
              assigneeId={task.delegateActorId ?? null}
              assigneePlaceholder="Unassigned"
              assigneeSearchPlaceholder="Search..."
              onAssigneeChange={(value) => {
                const actor = assigneeOptions.find((a) => a.id === value);
                setTask({
                  ...task,
                  delegateActorId: value,
                  delegateMode: actor?.kind === "agent" ? "assist" : "manual",
                });
              }}
              assigneeExtra={
                assigneeOptions.find((a) => a.id === task.delegateActorId)
                  ?.kind === "agent" && (
                  <label className="flex items-center gap-2 mt-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={task.delegateMode === "assist"}
                      onChange={(e) =>
                        setTask({
                          ...task,
                          delegateMode: e.target.checked ? "assist" : "handle",
                        })
                      }
                      className="rounded border-border"
                    />
                    Require review before completing
                  </label>
                )
              }
              tags={task.tags}
              onAddTag={(tag) =>
                setTask((prev) => ({ ...prev, tags: [...prev.tags, tag] }))
              }
              onRemoveTag={(tag) =>
                setTask((prev) => ({
                  ...prev,
                  tags: prev.tags.filter((t) => t !== tag),
                }))
              }
            />
          </div>
          <DialogFooter className="pt-4 border-t mt-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={isCreating}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isCreating || !task.title}>
              {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
