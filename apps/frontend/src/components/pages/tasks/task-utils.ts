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
    iconClass: "text-muted-foreground",
    badgeClass: "bg-muted text-muted-foreground border-border border-dashed",
  },
  open: {
    label: "Not Started",
    icon: Circle,
    iconClass: "text-muted-foreground",
    badgeClass: "bg-secondary text-secondary-foreground border-border",
  },
  "in-progress": {
    label: "In Progress",
    icon: Loader2,
    iconClass: "text-info animate-spin",
    badgeClass: "bg-info/10 text-info border-info/30",
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

/** Cycle: backlog->not-started->in-progress->completed->not-started.
 *  cancelled->not-started (re-activate). */
export function getNextStatus(current: TaskStatus): TaskStatus {
  switch (current) {
    case "backlog":
      return "open";
    case "open":
      return "in-progress";
    case "in-progress":
      return "completed";
    case "completed":
      return "open";
    case "cancelled":
      return "open";
    default:
      return "open";
  }
}

export const STATUS_OPTIONS = [
  { value: "backlog", label: "Backlog" },
  { value: "open", label: "Not Started" },
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
