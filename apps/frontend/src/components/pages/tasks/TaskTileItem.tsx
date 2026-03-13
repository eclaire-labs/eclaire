import {
  Calendar,
  Edit,
  FileText,
  GitBranch,
  MessageCircle,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { AIAvatar } from "@/components/assistant/ai-avatar";
import { MarkdownPreview } from "@/components/markdown-preview";
import { SimpleProcessingStatusIcon } from "@/components/processing/SimpleProcessingStatusIcon";
import { PinFlagControls } from "@/components/shared/pin-flag-controls";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { FlagColor } from "@/hooks/use-list-page-state";
import { formatDate } from "@/lib/list-page-utils";
import type { Task, TaskStatus, User } from "@/types/task";
import {
  getNextStatus,
  getPriorityIcon,
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

export interface TaskTileItemProps {
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

export function TaskTileItem({
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
}: TaskTileItemProps) {
  const assigneeId = task.assigneeActorId;
  const assignee = allAssignees.find((a) => a.id === assigneeId);

  return (
    <Card
      data-index={index}
      tabIndex={-1}
      className={`cursor-pointer transition-shadow hover:shadow-md flex flex-col ${isFocused ? "ring-2 ring-ring ring-offset-2" : ""}`}
      onClick={onClick}
      onDoubleClick={() => onEditClick(task)}
    >
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 space-y-1">
            <div className="flex items-start gap-2">
              <CardTitle className="text-base line-clamp-2 flex-1 flex items-center gap-2">
                {task.title}
                {task.isRecurring && (
                  <RefreshCw className="h-3 w-3 text-blue-500 flex-shrink-0" />
                )}
                {(task.childCount ?? 0) > 0 && (
                  <span
                    className="flex items-center gap-0.5 text-xs text-muted-foreground flex-shrink-0 font-normal"
                    title={`${task.childCount} sub-task${task.childCount === 1 ? "" : "s"}`}
                  >
                    <GitBranch className="h-3 w-3" />
                    {task.childCount}
                  </span>
                )}
              </CardTitle>
              {assignee?.userType === "assistant" && (
                <Badge
                  variant="default"
                  className="text-xs shrink-0 flex items-center gap-1"
                >
                  <AIAvatar size="sm" />
                  AI
                </Badge>
              )}
            </div>
            <CardDescription className="flex items-center text-xs">
              {task.dueDate ? (
                <span className="flex items-center text-muted-foreground">
                  <Calendar className="mr-1 h-3 w-3" />{" "}
                  {formatDate(task.dueDate)}
                </span>
              ) : (
                <span className="flex items-center text-muted-foreground italic">
                  <Calendar className="mr-1 h-3 w-3" /> No due date
                </span>
              )}
              <div className="ml-2">
                <SimpleProcessingStatusIcon
                  status={task.processingStatus}
                  processingEnabled={task.processingEnabled}
                />
              </div>
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
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
              className="h-8 w-8 flex-shrink-0"
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
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0"
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Actions</span>
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
                  {getStatusIcon(
                    getNextStatus(task.status as TaskStatus),
                    "mr-2 h-4 w-4",
                  )}
                  Mark{" "}
                  {
                    getStatusConfig(getNextStatus(task.status as TaskStatus))
                      .label
                  }
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDeleteClick(task)}
                  className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/50"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2 flex-grow flex flex-col justify-between">
        <div>
          <div className="line-clamp-3 text-sm text-muted-foreground mb-3">
            <MarkdownPreview
              content={task.description}
              maxLength={200}
              preserveFormatting={true}
            />
          </div>
          {task.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {task.tags.slice(0, 3).map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="text-xs font-normal"
                >
                  {tag}
                </Badge>
              ))}
              {task.tags.length > 3 && (
                <Badge variant="outline" className="text-xs font-normal">
                  +{task.tags.length - 3}
                </Badge>
              )}
            </div>
          )}
        </div>
        {/* Status and Assignee pushed to bottom */}
        <div className="flex items-center justify-between text-xs mt-auto pt-2">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={`${getStatusConfig(task.status).badgeClass} whitespace-nowrap`}
            >
              {getStatusConfig(task.status).label}
            </Badge>
            {getPriorityIcon(task.priority) && (
              <span className="flex items-center">
                {getPriorityIcon(task.priority)}
              </span>
            )}
          </div>
          <div
            className="flex items-center text-muted-foreground"
            title={`Assigned to ${assigneeId || "Unassigned"}`}
          >
            {assigneeId
              ? (() => {
                  const displayName = assignee ? assignee.name : assigneeId;
                  const truncated =
                    displayName.length > 10
                      ? `${displayName.substring(0, 10)}...`
                      : displayName;
                  return (
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
                      <span>{truncated}</span>
                    </div>
                  );
                })()
              : "Unassigned"}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
