import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Circle,
  Eye,
  Loader2,
  Minus,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { createElement } from "react";
import type { TaskStatus } from "@/types/task";

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const statusConfigs = {
  open: {
    label: "Not Started",
    icon: Circle,
    iconClass: "text-muted-foreground",
    badgeClass: "bg-secondary text-secondary-foreground border-border",
  },
  in_progress: {
    label: "In Progress",
    icon: Loader2,
    iconClass: "text-info animate-spin",
    badgeClass: "bg-info/10 text-info border-info/30",
  },
  blocked: {
    label: "Blocked",
    icon: ShieldAlert,
    iconClass: "text-warning",
    badgeClass: "bg-warning/10 text-warning border-warning/30",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    iconClass: "text-success",
    badgeClass: "bg-success/10 text-success border-success/30",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    iconClass: "text-destructive",
    badgeClass: "bg-destructive/10 text-destructive border-destructive/30",
  },
} as const;

const defaultStatus = statusConfigs["open"];

export function getStatusConfig(status: string) {
  return statusConfigs[status as keyof typeof statusConfigs] ?? defaultStatus;
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

/**
 * Returns status display config that accounts for composite states.
 * When a task is in_progress but reviewStatus is pending, the user sees
 * "Awaiting Review" instead of a spinning "In Progress".
 */
export function getEffectiveStatusDisplay(task: {
  taskStatus: string;
  reviewStatus: string;
}) {
  if (task.taskStatus === "in_progress" && task.reviewStatus === "pending") {
    return {
      label: "Awaiting Review",
      icon: Eye,
      iconClass: "text-amber-500",
      badgeClass:
        "bg-amber-100/80 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
    };
  }
  return getStatusConfig(task.taskStatus);
}

/** Toggle: any status → completed, completed → open. */
export function getNextStatus(current: TaskStatus): TaskStatus {
  return current === "completed" ? "open" : "completed";
}

export const STATUS_OPTIONS = [
  { value: "open", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked", label: "Blocked" },
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
