import {
  Calendar,
  CheckCircle2,
  Circle,
  Edit,
  FileText,
  MessageSquare,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getStatusBadge = (status: string) => {
  switch (status) {
    case "completed":
      return (
        <Badge
          variant="outline"
          className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-300 dark:border-green-700 whitespace-nowrap"
        >
          Completed
        </Badge>
      );
    case "in-progress":
      return (
        <Badge
          variant="outline"
          className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-300 dark:border-blue-700 whitespace-nowrap"
        >
          In Progress
        </Badge>
      );
    default:
      return (
        <Badge
          variant="outline"
          className="bg-gray-100 text-gray-800 dark:bg-gray-700/30 dark:text-gray-300 border-gray-300 dark:border-gray-600 whitespace-nowrap"
        >
          Not Started
        </Badge>
      );
  }
};

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
  const assignee = allAssignees.find((a) => a.id === task.assignedToId);

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
                  enabled={task.enabled}
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
              <MessageSquare className="h-4 w-4 text-gray-400" />
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
                  {task.status === "completed" ? (
                    <>
                      <Circle className="mr-2 h-4 w-4" />
                      Mark Not Started
                    </>
                  ) : task.status === "in-progress" ? (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Mark Completed
                    </>
                  ) : (
                    <>
                      <Circle className="mr-2 h-4 w-4" />
                      Mark In Progress
                    </>
                  )}
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
            {getStatusBadge(task.status)}
          </div>
          <div
            className="flex items-center text-muted-foreground"
            title={`Assigned to ${task.assignedToId || "Unassigned"}`}
          >
            {task.assignedToId
              ? (() => {
                  const displayName = assignee
                    ? assignee.name
                    : task.assignedToId;
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
