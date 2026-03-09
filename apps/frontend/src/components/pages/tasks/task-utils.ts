import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Circle,
  Inbox,
  Loader2,
  Minus,
  XCircle,
} from "lucide-react";
import { createElement } from "react";
import type { TaskStatus } from "@/types/task";

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const statusConfigs = {
  backlog: {
    label: "Backlog",
    icon: Inbox,
    iconClass: "text-gray-400",
    badgeClass:
      "bg-gray-50 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400 border-gray-300 dark:border-gray-600 border-dashed",
  },
  "not-started": {
    label: "Not Started",
    icon: Circle,
    iconClass: "text-muted-foreground",
    badgeClass:
      "bg-gray-100 text-gray-800 dark:bg-gray-700/30 dark:text-gray-300 border-gray-300 dark:border-gray-600",
  },
  "in-progress": {
    label: "In Progress",
    icon: Loader2,
    iconClass: "text-blue-500 animate-spin",
    badgeClass:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-300 dark:border-blue-700",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    iconClass: "text-green-500",
    badgeClass:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-300 dark:border-green-700",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    iconClass: "text-red-400",
    badgeClass:
      "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800",
  },
} as const;

const defaultStatus = statusConfigs["not-started"];

export function getStatusConfig(status: string) {
  return (
    statusConfigs[status as keyof typeof statusConfigs] ?? defaultStatus
  );
}

export function getStatusIcon(
  status: string,
  sizeClass = "h-4 w-4",
): React.ReactElement {
  const config = getStatusConfig(status);
  return createElement(config.icon, {
    className: `${sizeClass} ${config.iconClass}`,
  });
}

/** Cycle: backlog->not-started->in-progress->completed->not-started.
 *  cancelled->not-started (re-activate). */
export function getNextStatus(current: TaskStatus): TaskStatus {
  switch (current) {
    case "backlog":
      return "not-started";
    case "not-started":
      return "in-progress";
    case "in-progress":
      return "completed";
    case "completed":
      return "not-started";
    case "cancelled":
      return "not-started";
    default:
      return "not-started";
  }
}

export const STATUS_OPTIONS = [
  { value: "backlog", label: "Backlog" },
  { value: "not-started", label: "Not Started" },
  { value: "in-progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

/** Statuses valid for task creation (excludes cancelled). */
export const CREATE_STATUS_OPTIONS = STATUS_OPTIONS.filter(
  (s) => s.value !== "cancelled",
);

// ---------------------------------------------------------------------------
// Priority helpers
// ---------------------------------------------------------------------------

const PRIORITY_LABELS: Record<number, string> = {
  0: "None",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

const priorityConfigs = {
  0: { label: "None", icon: null, iconClass: "" },
  1: { label: "Urgent", icon: AlertTriangle, iconClass: "text-red-500" },
  2: { label: "High", icon: ArrowUp, iconClass: "text-orange-500" },
  3: { label: "Medium", icon: Minus, iconClass: "text-yellow-500" },
  4: { label: "Low", icon: ArrowDown, iconClass: "text-blue-500" },
} as const;

const defaultPriority = priorityConfigs[0];

export function getPriorityConfig(priority: number) {
  return (
    priorityConfigs[priority as keyof typeof priorityConfigs] ?? defaultPriority
  );
}

export function getPriorityIcon(
  priority: number,
  sizeClass = "h-3.5 w-3.5",
): React.ReactElement | null {
  const config = getPriorityConfig(priority);
  if (!config.icon) return null;
  return createElement(config.icon, {
    className: `${sizeClass} ${config.iconClass}`,
  });
}

export function getPriorityLabel(priority: number): string {
  return PRIORITY_LABELS[priority] ?? "None";
}

export const PRIORITY_OPTIONS = [
  { value: "0", label: "None" },
  { value: "1", label: "Urgent" },
  { value: "2", label: "High" },
  { value: "3", label: "Medium" },
  { value: "4", label: "Low" },
] as const;
