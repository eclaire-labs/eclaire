import type { ReactNode } from "react";

import { ActorPicker } from "@/components/shared/ActorPicker";
import { DueDatePicker } from "@/components/shared/due-date-picker";
import { TagEditor } from "@/components/shared/TagEditor";
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

import { PRIORITY_OPTIONS } from "./task-utils";

interface TaskFormFieldsProps {
  idPrefix: string;
  title: string;
  titlePlaceholder?: string;
  onTitleChange: (value: string) => void;
  description: string | null;
  descriptionPlaceholder?: string;
  onDescriptionChange: (value: string) => void;
  taskStatus: string;
  statusOptions: ReadonlyArray<{ value: string; label: string }>;
  onStatusChange: (value: string) => void;
  priority: number | null | undefined;
  onPriorityChange: (value: number) => void;
  dueDate: string | null;
  onDueDateChange: (value: string | null) => void;
  actors: ActorOption[];
  assigneeId: string | null;
  assigneePlaceholder: string;
  assigneeSearchPlaceholder: string;
  onAssigneeChange: (value: string | null) => void;
  assigneeExtra?: ReactNode;
  tags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
}

/**
 * Shared form fields (title/description/status/priority/due date/assignee/tags)
 * used by both the edit-task and create-task dialogs.
 */
export function TaskFormFields({
  idPrefix,
  title,
  titlePlaceholder,
  onTitleChange,
  description,
  descriptionPlaceholder,
  onDescriptionChange,
  taskStatus,
  statusOptions,
  onStatusChange,
  priority,
  onPriorityChange,
  dueDate,
  onDueDateChange,
  actors,
  assigneeId,
  assigneePlaceholder,
  assigneeSearchPlaceholder,
  onAssigneeChange,
  assigneeExtra,
  tags,
  onAddTag,
  onRemoveTag,
}: TaskFormFieldsProps) {
  return (
    <>
      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-title`}>
          Title <span className="text-red-500">*</span>
        </Label>
        <Input
          id={`${idPrefix}-title`}
          placeholder={titlePlaceholder}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          required
        />
      </div>
      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-description`}>Description</Label>
        <Textarea
          id={`${idPrefix}-description`}
          placeholder={descriptionPlaceholder}
          rows={3}
          value={description || ""}
          onChange={(e) => onDescriptionChange(e.target.value)}
        />
      </div>
      {/* Status & Due Date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-status`}>Status</Label>
          <Select value={taskStatus} onValueChange={onStatusChange}>
            <SelectTrigger id={`${idPrefix}-status`}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-priority`}>Priority</Label>
          <Select
            value={String(priority ?? 0)}
            onValueChange={(value) => onPriorityChange(Number(value))}
          >
            <SelectTrigger id={`${idPrefix}-priority`}>
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
          <Label htmlFor={`${idPrefix}-due-date`}>Due Date</Label>
          <DueDatePicker value={dueDate || null} onChange={onDueDateChange} />
        </div>
      </div>
      {/* Assignee */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-assignee`}>Assignee</Label>
          <ActorPicker
            id={`${idPrefix}-assignee`}
            actors={actors}
            value={assigneeId ?? null}
            allowUnassigned
            placeholder={assigneePlaceholder}
            searchPlaceholder={assigneeSearchPlaceholder}
            onChange={onAssigneeChange}
          />
          {assigneeExtra}
        </div>
      </div>
      {/* Tags */}
      <TagEditor tags={tags} onAddTag={onAddTag} onRemoveTag={onRemoveTag} />
    </>
  );
}
