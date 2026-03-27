import { Loader2 } from "lucide-react";
import { useState } from "react";
import { ActorPicker } from "@/components/shared/ActorPicker";
import { DueDatePicker } from "@/components/shared/due-date-picker";
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
import type { ActorOption } from "@/hooks/use-actors";
import type { Task, TaskStatus } from "@/types/task";
import { CREATE_STATUS_OPTIONS, PRIORITY_OPTIONS } from "./task-utils";

const INITIAL_TASK: Omit<Task, "id"> = {
  title: "",
  description: null,
  prompt: null,
  taskStatus: "open",
  dueAt: null,
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
  parentId: null,
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
  /** Pre-fill parentId when creating a sub-task */
  parentId?: string | null;
  assigneeOptions: ActorOption[];
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  onCreateTask,
  isCreating,
  defaultAssigneeId,
  parentId,
  assigneeOptions,
}: CreateTaskDialogProps) {
  const [task, setTask] = useState<Omit<Task, "id">>({
    ...INITIAL_TASK,
    delegateActorId: defaultAssigneeId ?? null,
    userId: "",
    parentId: parentId ?? null,
  });

  const reset = (assigneeId?: string) =>
    setTask({
      ...INITIAL_TASK,
      delegateActorId: assigneeId ?? defaultAssigneeId ?? null,
      userId: "",
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
                  value={task.taskStatus}
                  onValueChange={(value) =>
                    setTask({ ...task, taskStatus: value as TaskStatus })
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
                <DueDatePicker
                  value={task.dueAt || null}
                  onChange={(value) =>
                    setTask({ ...task, dueAt: value ?? null })
                  }
                />
              </div>
            </div>
            {/* Assignee */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-assignee">Assignee</Label>
                <ActorPicker
                  id="new-assignee"
                  actors={assigneeOptions}
                  value={task.delegateActorId ?? null}
                  allowUnassigned
                  placeholder="Search people and agents"
                  searchPlaceholder="Search people and agents..."
                  onChange={(value) =>
                    setTask({
                      ...task,
                      delegateActorId: value,
                    })
                  }
                />
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
