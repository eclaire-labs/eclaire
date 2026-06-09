import { Loader2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

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

import { STATUS_OPTIONS } from "./task-utils";
import { TaskFormFields } from "./TaskFormFields";

interface TaskEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  onTaskChange: Dispatch<SetStateAction<Task | null>>;
  actors: ActorOption[];
  isUpdating: boolean;
  isDeleting: boolean;
  onSave: () => void;
  onDelete: (id: string, title: string) => void;
}

export function TaskEditDialog({
  open,
  onOpenChange,
  task,
  onTaskChange,
  actors,
  isUpdating,
  isDeleting,
  onSave,
  onDelete,
}: TaskEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[625px]">
        <DialogHeader>
          <DialogTitle>Task Details</DialogTitle>
          <DialogDescription>
            View or edit task details below.
          </DialogDescription>
        </DialogHeader>
        {task && (
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto px-2">
            <TaskFormFields
              idPrefix="edit"
              title={task.title}
              onTitleChange={(value) =>
                onTaskChange((prev) =>
                  prev ? { ...prev, title: value } : null,
                )
              }
              description={task.description}
              onDescriptionChange={(value) =>
                onTaskChange((prev) =>
                  prev ? { ...prev, description: value } : null,
                )
              }
              taskStatus={task.taskStatus}
              statusOptions={STATUS_OPTIONS}
              onStatusChange={(value) =>
                onTaskChange((prev) =>
                  prev ? { ...prev, taskStatus: value as TaskStatus } : null,
                )
              }
              priority={task.priority}
              onPriorityChange={(value) =>
                onTaskChange((prev) =>
                  prev ? { ...prev, priority: value } : null,
                )
              }
              dueDate={task.dueDate}
              onDueDateChange={(value) =>
                onTaskChange((prev) =>
                  prev ? { ...prev, dueDate: value ?? "" } : null,
                )
              }
              actors={actors}
              assigneeId={task.delegateActorId ?? null}
              assigneePlaceholder="Search people and agents"
              assigneeSearchPlaceholder="Search people and agents..."
              onAssigneeChange={(value) =>
                onTaskChange((prev) =>
                  prev
                    ? {
                        ...prev,
                        delegateActorId: value,
                      }
                    : null,
                )
              }
              tags={task.tags}
              onAddTag={(tag) =>
                onTaskChange((prev) =>
                  prev ? { ...prev, tags: [...prev.tags, tag] } : null,
                )
              }
              onRemoveTag={(tag) =>
                onTaskChange((prev) =>
                  prev
                    ? {
                        ...prev,
                        tags: prev.tags.filter((t) => t !== tag),
                      }
                    : null,
                )
              }
            />
          </div>
        )}
        <DialogFooter className="sm:justify-between gap-2 pt-4 border-t mt-2">
          <Button
            variant="destructive"
            onClick={() => task && onDelete(task.id, task.title)}
            disabled={isDeleting || isUpdating}
          >
            {isDeleting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Delete
          </Button>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={isUpdating || isDeleting}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={onSave}
              disabled={isUpdating || isDeleting || !task?.title}
            >
              {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
