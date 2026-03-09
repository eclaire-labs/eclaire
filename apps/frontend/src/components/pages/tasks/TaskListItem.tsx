import {
  Edit,
  FileText,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import type React from "react";
import { AIAvatar } from "@/components/assistant/ai-avatar";
import { MarkdownPreview } from "@/components/markdown-preview";
import { SimpleProcessingStatusIcon } from "@/components/processing/SimpleProcessingStatusIcon";
import { PinFlagControls } from "@/components/shared/pin-flag-controls";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableCell, TableRow } from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { FlagColor } from "@/hooks/use-list-page-state";
import { formatDate } from "@/lib/list-page-utils";
import type { Task, TaskStatus, User } from "@/types/task";
import {
  getNextStatus,
  getPriorityIcon,
  getPriorityLabel,
  getStatusConfig,
  getStatusIcon,
} from "./task-utils";

// Transform User to match UserAvatar expected format
const transformUserForAvatar = (user: User) => ({
  displayName: user.displayName,
  fullName: user.fullName || null,
  email: user.email || "",
  avatarUrl: user.avatarUrl || null,
});

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TaskListItemProps {
  task: Task;
  index: number;
  isFocused: boolean;
  onClick: () => void;
  onEditClick: (task: Task) => void;
  onStatusChange: (taskId: string, currentStatus: TaskStatus) => void;
  onDeleteClick: (task: Task) => void;
  onPinToggle: (task: Task) => void;
  onFlagColorChange: (task: Task, color: FlagColor) => void;
  onChatClick: (task: Task) => void;
  allAssignees: Array<{ id: string; name: string; userType: string }>;
  currentUser?: User;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TaskListItem({
  task,
  index,
  isFocused,
  onClick,
  onEditClick,
  onStatusChange,
  onDeleteClick,
  onPinToggle,
  onFlagColorChange,
  onChatClick,
  allAssignees,
  currentUser,
}: TaskListItemProps) {
  const assignee = allAssignees.find((a) => a.id === task.assignedToId);

  const statusConfig = getStatusConfig(task.status);

  return (
    <TableRow
      data-index={index}
      tabIndex={-1}
      className={`cursor-pointer hover:bg-muted/50 ${isFocused ? "ring-2 ring-ring ring-offset-0 bg-muted/50" : ""}`}
      onClick={onClick}
      onDoubleClick={() => onEditClick(task)}
    >
      <TableCell className="hidden sm:table-cell pl-4 pr-2">
        <div className="flex items-center justify-center h-full relative">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            title={`Current: ${task.status}. Click to change.`}
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(task.id, task.status as TaskStatus);
            }}
          >
            {getStatusIcon(task.status)}
          </Button>
          <div className="absolute -top-1 -right-1">
            <SimpleProcessingStatusIcon
              status={task.processingStatus}
              processingEnabled={task.processingEnabled}
              className="bg-white/90 dark:bg-black/90 rounded-full p-0.5"
            />
          </div>
        </div>
      </TableCell>
      <TableCell className="py-2 align-middle">
        <div
          className="font-medium line-clamp-1 min-w-0 flex items-center gap-2"
          title={task.title}
        >
          {task.title}
          {task.isRecurring && (
            <RefreshCw className="h-3 w-3 text-blue-500 flex-shrink-0" />
          )}
        </div>
        {task.description ? (
          <div
            className="text-xs text-muted-foreground line-clamp-1 min-w-0"
            title={task.description}
          >
            <MarkdownPreview
              content={task.description}
              maxLength={80}
              preserveFormatting={false}
            />
          </div>
        ) : null}
      </TableCell>
      <TableCell className="hidden md:table-cell align-middle">
        <Badge
          variant="outline"
          className={`${statusConfig.badgeClass} whitespace-nowrap`}
        >
          {statusConfig.label}
        </Badge>
      </TableCell>
      <TableCell className="hidden md:table-cell align-middle">
        {getPriorityIcon(task.priority) && (
          <div className="flex items-center gap-1" title={getPriorityIcon(task.priority) ? `Priority: ${getPriorityLabel(task.priority)}` : undefined}>
            {getPriorityIcon(task.priority)}
          </div>
        )}
      </TableCell>
      <TableCell className="hidden lg:table-cell align-middle">
        <div className="flex items-center text-sm text-muted-foreground truncate">
          <span className="truncate">
            {task.assignedToId ? (
              <div className="flex items-center gap-1">
                {assignee?.userType === "assistant" ? (
                  <AIAvatar size="sm" />
                ) : assignee?.id === currentUser?.id && currentUser ? (
                  <UserAvatar
                    user={transformUserForAvatar(currentUser)}
                    size="sm"
                  />
                ) : (
                  <UserIcon className="h-3 w-3" />
                )}
                <span>{assignee ? assignee.name : task.assignedToId}</span>
              </div>
            ) : (
              <span className="italic">Unassigned</span>
            )}
          </span>
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground align-middle">
        {formatDate(task.dueDate)}
      </TableCell>
      <TableCell className="hidden lg:table-cell align-middle">
        <div className="flex flex-wrap gap-1">
          {task.tags.slice(0, 2).map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="text-xs font-normal"
            >
              {tag}
            </Badge>
          ))}
          {task.tags.length > 2 && (
            <Badge variant="outline" className="text-xs font-normal">
              +{task.tags.length - 2}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell
        className="text-right pr-4 pl-2 align-middle"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1 justify-end">
          <TooltipProvider>
            <PinFlagControls
              size="sm"
              isPinned={task.isPinned}
              flagColor={task.flagColor}
              onPinToggle={() => onPinToggle(task)}
              onFlagToggle={() =>
                onFlagColorChange(task, task.flagColor ? null : "orange")
              }
              onFlagColorChange={(color) => onFlagColorChange(task, color)}
            />
          </TooltipProvider>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              onChatClick(task);
            }}
            title={
              assignee?.userType === "assistant"
                ? `Chat with ${assignee.name || "AI Assistant"} about this task`
                : "Chat with AI about this task"
            }
          >
            <MessageSquare className="h-3.5 w-3.5 text-gray-400" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem onClick={() => onClick()}>
                <FileText className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEditClick(task)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  onStatusChange(task.id, task.status as TaskStatus)
                }
              >
                {getStatusIcon(getNextStatus(task.status as TaskStatus), "mr-2 h-4 w-4")}
                Mark {getStatusConfig(getNextStatus(task.status as TaskStatus)).label}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDeleteClick(task)}
                className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/50"
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}
