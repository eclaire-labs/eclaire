import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { RecurrenceToggle } from "@/components/shared/recurrence-toggle";
import { TagEditor } from "@/components/shared/TagEditor";
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
import type { Task, TaskStatus } from "@/types/task";
import { CREATE_STATUS_OPTIONS, PRIORITY_OPTIONS } from "./task-utils";

/** Format an ISO date string for a datetime-local input. */
function formatDateForInput(isoString: string | null | undefined): string {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return "";
  }
}

const INITIAL_TASK: Omit<Task, "id"> = {
  title: "",
  description: "",
  status: "not-started",
  dueDate: "",
  assignedToId: null,
  tags: [],
  createdAt: "",
  updatedAt: "",
  userId: "",
  reviewStatus: "pending",
  flagColor: null,
  isPinned: false,
  processingEnabled: true,
  priority: 0,
  parentId: null,
  sortOrder: null,
  processingStatus: null,
  isRecurring: false,
  cronExpression: null,
  recurrenceEndDate: null,
  recurrenceLimit: null,
  runImmediately: false,
  nextRunAt: null,
  lastRunAt: null,
  completedAt: null,
};

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateTask: (data: Omit<Task, "id">) => Promise<void>;
  isCreating: boolean;
  defaultAssigneeId?: string;
  /** Pre-fill parentId when creating a sub-task */
  parentId?: string | null;
  /** Render the assignee SelectContent (shared with edit dialog) */
  renderAssigneeSelectContent: () => ReactNode;
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  onCreateTask,
  isCreating,
  defaultAssigneeId,
  parentId,
  renderAssigneeSelectContent,
}: CreateTaskDialogProps) {
  const [task, setTask] = useState<Omit<Task, "id">>({
    ...INITIAL_TASK,
    assignedToId: defaultAssigneeId ?? null,
    userId: defaultAssigneeId ?? "",
    parentId: parentId ?? null,
  });

  const reset = (assigneeId?: string) =>
    setTask({
      ...INITIAL_TASK,
      assignedToId: assigneeId ?? defaultAssigneeId ?? null,
      userId: assigneeId ?? defaultAssigneeId ?? "",
      parentId: parentId ?? null,
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
          <DialogTitle>
            {parentId ? "Create Sub-task" : "Create New Task"}
          </DialogTitle>
          <DialogDescription>
            {parentId
              ? "Add a sub-task to the parent task."
              : "Add a new task to your list."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto px-2">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="new-title">
                Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="new-title"
                placeholder="Task title"
                value={task.title}
                onChange={(e) => setTask({ ...task, title: e.target.value })}
                required
              />
            </div>
            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="new-description">Description</Label>
              <Textarea
                id="new-description"
                placeholder="Task description (optional)"
                rows={3}
                value={task.description || ""}
                onChange={(e) =>
                  setTask({ ...task, description: e.target.value })
                }
              />
            </div>
            {/* Status & Due Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-status">Status</Label>
                <Select
                  value={task.status}
                  onValueChange={(value) =>
                    setTask({ ...task, status: value as TaskStatus })
                  }
                >
                  <SelectTrigger id="new-status">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {CREATE_STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-priority">Priority</Label>
                <Select
                  value={String(task.priority)}
                  onValueChange={(value) =>
                    setTask({ ...task, priority: Number(value) })
                  }
                >
                  <SelectTrigger id="new-priority">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-due-date">Due Date</Label>
                <Input
                  id="new-due-date"
                  type="datetime-local"
                  value={formatDateForInput(task.dueDate)}
                  onChange={(e) =>
                    setTask({ ...task, dueDate: e.target.value })
                  }
                />
              </div>

              {/* Recurrence — hidden for sub-tasks */}
              {!parentId && (
                <div className="space-y-2">
                  <RecurrenceToggle
                    value={{
                      isRecurring: task.isRecurring,
                      cronExpression: task.cronExpression,
                      recurrenceEndDate: task.recurrenceEndDate,
                      recurrenceLimit: task.recurrenceLimit,
                      runImmediately: task.runImmediately,
                    }}
                    onChange={(config) =>
                      setTask({
                        ...task,
                        isRecurring: config.isRecurring,
                        cronExpression: config.cronExpression,
                        recurrenceEndDate: config.recurrenceEndDate,
                        recurrenceLimit: config.recurrenceLimit,
                        runImmediately: config.runImmediately,
                      })
                    }
                    dueDate={task.dueDate}
                  />
                </div>
              )}
            </div>
            {/* Assignee */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-assignee">Assignee</Label>
                <Select
                  value={task.assignedToId || "UNASSIGNED"}
                  onValueChange={(value) =>
                    setTask({
                      ...task,
                      assignedToId: value === "UNASSIGNED" ? null : value,
                    })
                  }
                >
                  <SelectTrigger id="new-assignee">
                    <SelectValue placeholder="Assignee" />
                  </SelectTrigger>
                  {renderAssigneeSelectContent()}
                </Select>
              </div>
            </div>
            {/* Tags */}
            <TagEditor
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
              {parentId ? "Create Sub-task" : "Create Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
