"use client";

import {
  ArrowDown, // Icons for view/sort
  ArrowUp,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Circle,
  Edit,
  FileText,
  Filter,
  LayoutGrid,
  List,
  Loader2, // For loading states
  MessageSquare,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { MarkdownPreview } from "@/components/markdown-preview";
import { MobileListsBackButton } from "@/components/mobile/mobile-lists-back-button";
import { AIAvatar } from "@/components/ui/ai-avatar";
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
  Dialog,
  DialogClose, // Import DialogClose
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PinFlagControls } from "@/components/ui/pin-flag-controls";
import { RecurrenceToggle } from "@/components/ui/recurrence-toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"; // For List View
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"; // For view switcher
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useAuth } from "@/hooks/use-auth";
import { useProcessingEvents } from "@/hooks/use-processing-status";
import { useTasks } from "@/hooks/use-tasks";
// Removed Tabs imports
import { useToast } from "@/hooks/use-toast";
import { useViewPreferences } from "@/hooks/use-view-preferences";
import { getUsers, setFlagColor, togglePin } from "@/lib/frontend-api";
import type { TaskStatus as SharedTaskStatus, Task, User } from "@/types/task";

// --- Helper Functions ---

// Transform backend user data to frontend User type
const transformBackendUser = (backendUser: any): User => {
  return {
    id: backendUser.id,
    displayName: backendUser.displayName || backendUser.name || null,
    userType: backendUser.userType || ("user" as const),
    email: backendUser.email || "",
    fullName: backendUser.fullName || backendUser.name || null,
    avatarUrl: backendUser.avatarUrl || backendUser.image || null,
  };
};

// Transform auth user to match UserAvatar expected format
const transformAuthUserForAvatar = (authUser: any) => {
  return {
    displayName: authUser.displayName || authUser.name || null,
    fullName: authUser.fullName || authUser.name || null,
    email: authUser.email || "",
    avatarUrl: authUser.avatarUrl || authUser.image || null,
  };
};

// Transform User to match UserAvatar expected format (ensuring email is present)
const transformUserForAvatar = (user: User) => {
  return {
    displayName: user.displayName,
    fullName: user.fullName || null,
    email: user.email || "",
    avatarUrl: user.avatarUrl || null,
  };
};

// --- Type Definitions ---

interface TaskTileItemProps {
  task: Task;
  onTaskClick: (task: Task) => void;
  onEditClick: (task: Task) => void;
  onStatusChange: (taskId: string, currentStatus: TaskStatus) => void;
  onDeleteTask: (taskId: string, taskTitle: string) => void;
  onPinToggle: (task: Task) => void;
  onFlagColorChange: (
    task: Task,
    flagColor: "red" | "yellow" | "orange" | "green" | "blue" | null,
  ) => void;
  onChatClick: (task: Task) => void;
  currentUserId: string;
  allAssignees: Array<{ id: string; name: string; userType: string }>;
  currentUser?: User;
  // Add index/isFocused if implementing keyboard nav later
}

interface TaskListItemProps {
  task: Task;
  onTaskClick: (task: Task) => void;
  onEditClick: (task: Task) => void;
  onStatusChange: (taskId: string, currentStatus: TaskStatus) => void;
  onDeleteTask: (taskId: string, taskTitle: string) => void;
  onPinToggle: (task: Task) => void;
  onFlagColorChange: (
    task: Task,
    flagColor: "red" | "yellow" | "orange" | "green" | "blue" | null,
  ) => void;
  onChatClick: (task: Task) => void;
  currentUserId: string;
  allAssignees: Array<{ id: string; name: string; userType: string }>;
  currentUser?: User;
  // Add index/isFocused if implementing keyboard nav later
}

// Define allowed statuses explicitly
type TaskStatus = SharedTaskStatus;
const ALLOWED_STATUSES: TaskStatus[] = [
  "not-started",
  "in-progress",
  "completed",
];

// --- Helper Functions ---
const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return "No date";
  try {
    const date = new Date(dateString);
    // Check if the date is valid after parsing
    if (isNaN(date.getTime())) {
      // Try parsing as YYYY-MM-DD if ISO parsing failed
      const parts = dateString.split("-");
      if (parts.length === 3) {
        const year = Number.parseInt(parts[0], 10);
        const month = Number.parseInt(parts[1], 10) - 1; // Month is 0-indexed
        const day = Number.parseInt(parts[2], 10);
        const dateFromParts = new Date(Date.UTC(year, month, day)); // Use UTC to avoid timezone issues with YYYY-MM-DD
        if (!isNaN(dateFromParts.getTime())) {
          return dateFromParts.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            timeZone: "UTC", // Specify timezone if using UTC date
          });
        }
      }
      return "Invalid date"; // Return if parsing fails
    }
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short", // Use short month for brevity
      day: "numeric",
    });
  } catch (error) {
    console.error("Error formatting date:", dateString, error);
    return "Invalid date"; // Fallback for any other errors
  }
};

const formatDateForInput = (isoString: string | null | undefined): string => {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    // Return datetime-local format (YYYY-MM-DDTHH:mm)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return "";
  }
};

// Refined getGroupDateLabel (ensure consistency with getGroupRank parsing)
const getGroupDateLabel = (dateString: string | null | undefined): string => {
  if (!dateString) return "No Due Date";
  try {
    let date: Date;
    // Try parsing ISO string first
    date = new Date(dateString);
    if (isNaN(date.getTime())) {
      // Try parsing YYYY-MM-DD as UTC
      const parts = dateString.split("-");
      if (parts.length === 3) {
        const year = Number.parseInt(parts[0], 10);
        const month = Number.parseInt(parts[1], 10) - 1;
        const day = Number.parseInt(parts[2], 10);
        const dateFromParts = new Date(Date.UTC(year, month, day));
        if (!isNaN(dateFromParts.getTime())) {
          date = dateFromParts;
        } else {
          return "Invalid Date";
        }
      } else {
        return "Invalid Date";
      }
    }

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    // Use UTC dates for comparison
    const dateOnly = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const todayOnly = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const yesterdayOnly = new Date(
      Date.UTC(
        yesterday.getUTCFullYear(),
        yesterday.getUTCMonth(),
        yesterday.getUTCDate(),
      ),
    );

    if (dateOnly.getTime() === todayOnly.getTime()) return "Today";
    if (dateOnly.getTime() === yesterdayOnly.getTime()) return "Yesterday";

    // Check if it's in the future
    if (dateOnly.getTime() > todayOnly.getTime()) {
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      }); // Show full date for future
    }

    // Otherwise, it's in the past (older than yesterday) - group by Month and Year
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      timeZone: "UTC",
    });
  } catch (error) {
    console.error("Error in getGroupDateLabel:", dateString, error);
    return "Date Error";
  }
};

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
    case "not-started":
    default: // Default to Not Started if status is unknown/invalid
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

// --- Component ---
export default function TasksPage() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: auth } = useAuth();

  // --- React Query Hook ---
  const {
    tasks,
    isLoading,
    error,
    updateTask,
    updateTaskStatus,
    deleteTask,
    createTask,
    refresh,
    isUpdating,
    isDeleting,
  } = useTasks();

  // --- Initialize SSE for real-time updates ---
  useProcessingEvents();

  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null); // For view/edit dialog
  const [editingTask, setEditingTask] = useState<Task | null>(null); // For edit dialog state
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false); // Combined View/Edit Dialog
  const [isNewTaskDialogOpen, setIsNewTaskDialogOpen] = useState(false);
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  const [newTask, setNewTask] = useState<Omit<Task, "id">>({
    title: "",
    description: "",
    status: "not-started", // Default to allowed status
    dueDate: "", // Store as YYYY-MM-DD string initially
    assignedToId: null, // Default to null - backend will assign current user
    tags: [],
    createdAt: "", // Placeholder - will be set by backend
    updatedAt: "", // Placeholder - will be set by backend
    userId: "", // Will be set by backend
    reviewStatus: "pending",
    flagColor: null,
    isPinned: false,
    enabled: true,
    processingStatus: null,
    isRecurring: false,
    cronExpression: null,
    recurrenceEndDate: null,
    recurrenceLimit: null,
    runImmediately: false,
    nextRunAt: null,
    lastRunAt: null,
    completedAt: null,
  });
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "all">("all");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterTag, setFilterTag] = useState("all");
  const [tagInput, setTagInput] = useState("");
  const [isClient, setIsClient] = useState(false);

  // Use view preferences hook instead of individual state variables
  const [viewPreferences, updateViewPreference] = useViewPreferences("tasks");
  const { viewMode, sortBy, sortDir } = viewPreferences;

  // Add deletion confirmation dialog state
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] =
    useState(false);
  const [taskToDelete, setTaskToDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);

  // Current user ID - from authentication
  const currentUserId = auth?.user?.id || "";

  useEffect(() => {
    // This effect runs only on the client after initial render
    setIsClient(true);
  }, []);

  // --- Error Handling ---
  useEffect(() => {
    if (error) {
      toast({
        title: "Error Loading Tasks",
        description:
          error instanceof Error ? error.message : "Failed to load tasks",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  // Fetch users for assignee dropdown
  useEffect(() => {
    fetchUsers();
  }, []);

  // Fetch users for assignee dropdown
  const fetchUsers = async () => {
    try {
      const usersData = await getUsers();
      const transformedUsers = usersData.map(transformBackendUser);
      setUsers(transformedUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      // Don't show toast for users fetch failure, it's not critical
    }
  };

  // --- Computed Values (Filtering, Sorting, Grouping) ---
  const allTags = useMemo(
    () => Array.from(new Set(tasks.flatMap((task) => task.tags))),
    [tasks],
  );
  // Get assignees from both tasks and users list
  const allAssignees: Array<{ id: string; name: string; userType: string }> =
    useMemo(() => {
      const assigneeSet = new Set();
      const assigneeList: Array<{
        id: string;
        name: string;
        userType: string;
      }> = [];

      // Add users from the users list
      users.forEach((user) => {
        if (!assigneeSet.has(user.id)) {
          assigneeSet.add(user.id);
          assigneeList.push({
            id: user.id,
            name: user.displayName || user.email || user.id,
            userType: user.userType,
          });
        }
      });

      // Add any assignees from tasks that might not be in the users list
      tasks.forEach((task) => {
        if (task.assignedToId && !assigneeSet.has(task.assignedToId)) {
          assigneeSet.add(task.assignedToId);
          assigneeList.push({
            id: task.assignedToId,
            name: task.assignedToId,
            userType: "user", // Default assumption
          });
        }
      });

      return assigneeList.sort((a, b) => {
        // Sort by user type first (assistants first), then by name
        if (a.userType !== b.userType) {
          return a.userType === "assistant" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    }, [tasks, users]);
  // Or using filter(Boolean) with assertion if preferred:
  // const allAssignees = useMemo(() => Array.from(new Set(tasks.map(task => task.assignedToId).filter(Boolean))) as string[], [tasks]);

  // Handle URL parameter to open dialog with AI Assistant
  useEffect(() => {
    const openDialog = searchParams.get("openDialog");
    if (openDialog === "ai" && allAssignees.length > 0) {
      // Find the first AI Assistant user
      const aiAssistant = allAssignees.find(
        (user) => user.userType === "assistant",
      );
      if (aiAssistant) {
        setNewTask((prev) => ({
          ...prev,
          assignedToId: aiAssistant.id,
        }));
      }
      setIsNewTaskDialogOpen(true);

      // Clear the URL parameter to prevent reopening on refresh
      const url = new URL(window.location.href);
      url.searchParams.delete("openDialog");
      router.replace(url.pathname + url.search);
    }
  }, [searchParams, allAssignees, router]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const lowerSearch = searchQuery.toLowerCase();
      const matchesSearch =
        task.title.toLowerCase().includes(lowerSearch) ||
        (task.description &&
          task.description.toLowerCase().includes(lowerSearch)) ||
        task.tags.some((tag) => tag.toLowerCase().includes(lowerSearch));

      const matchesStatus =
        filterStatus === "all" || task.status === filterStatus;
      const matchesAssignee =
        filterAssignee === "all" || task.assignedToId === filterAssignee;
      const matchesTag = filterTag === "all" || task.tags.includes(filterTag);

      return matchesSearch && matchesStatus && matchesAssignee && matchesTag;
    });
  }, [tasks, searchQuery, filterStatus, filterAssignee, filterTag]);

  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      let compareResult = 0;

      // Helper for string/status comparison (can remain similar)
      const getComparable = (value: any, type: "string" | "status"): string => {
        // ... (implementation for string/status null handling) ...
        if (value === null || value === undefined) {
          return sortDir === "asc" ? "~~~~~" : "";
        }
        if (type === "status") {
          const order: Record<TaskStatus, number> = {
            "not-started": 1,
            "in-progress": 2,
            completed: 3,
          };
          return (order[value as TaskStatus] ?? 99).toString();
        }
        return String(value).toLowerCase();
      };

      switch (sortBy) {
        case "title":
          compareResult = String(
            getComparable(a.title, "string"),
          ).localeCompare(String(getComparable(b.title, "string")));
          return compareResult * (sortDir === "asc" ? 1 : -1);

        case "status": {
          const statusOrder: Record<TaskStatus, number> = {
            "not-started": 1,
            "in-progress": 2,
            completed: 3,
          };
          const statusA = statusOrder[a.status as TaskStatus] ?? 99;
          const statusB = statusOrder[b.status as TaskStatus] ?? 99;
          compareResult = statusA - statusB;
          return compareResult * (sortDir === "asc" ? 1 : -1);
        }

        case "assignedToId": {
          const assigneeA = getComparable(a.assignedToId, "string");
          const assigneeB = getComparable(b.assignedToId, "string");
          compareResult = String(assigneeA).localeCompare(String(assigneeB));
          return compareResult * (sortDir === "asc" ? 1 : -1);
        }

        case "dueDate":
        default: {
          // Simplified dueDate sorting (like DocumentsPage)
          const timeA = a.dueDate ? new Date(a.dueDate).getTime() : null;
          const timeB = b.dueDate ? new Date(b.dueDate).getTime() : null;
          const validTimeA = timeA !== null && !isNaN(timeA);
          const validTimeB = timeB !== null && !isNaN(timeB);

          // Logic to consistently place null/invalid dates AFTER valid dates
          if (validTimeA && !validTimeB) {
            compareResult = -1; // Valid A comes before invalid B
          } else if (!validTimeA && validTimeB) {
            compareResult = 1; // Invalid A comes after valid B
          } else if (!validTimeA && !validTimeB) {
            // Both invalid/null, use secondary sort (e.g., title) for stable order
            compareResult = a.title
              .toLowerCase()
              .localeCompare(b.title.toLowerCase());
          } else {
            // Both are valid dates, compare chronologically
            compareResult = timeA! - timeB!;
            // Apply sort direction ONLY to the valid date comparison
            compareResult = compareResult * (sortDir === "asc" ? 1 : -1);
          }
          return compareResult;
        }
      }
    });
  }, [filteredTasks, sortBy, sortDir, currentUserId]);

  // --- Event Handlers ---

  const toggleSortDir = () => {
    updateViewPreference("sortDir", sortDir === "asc" ? "desc" : "asc");
  };

  // Clear search input
  const clearSearch = () => {
    setSearchQuery("");
    // Focus the input after clearing
    const searchInput = document.querySelector(
      'input[placeholder="Search tasks..."]',
    ) as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
    }
  };

  // Handle pin toggle for tasks
  const handlePinToggle = async (task: Task) => {
    const newPinned = !task.isPinned;

    try {
      const response = await togglePin("tasks", task.id, newPinned);

      if (!response.ok) {
        throw new Error(`Failed to ${newPinned ? "pin" : "unpin"} task`);
      }

      // Refresh data to reflect changes
      refresh();

      toast({
        title: newPinned ? "Task pinned" : "Task unpinned",
        description: `"${task.title}" has been ${newPinned ? "pinned" : "unpinned"}.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update pin status",
        variant: "destructive",
      });
    }
  };

  // Handle flag color change for tasks
  const handleFlagColorChange = async (
    task: Task,
    flagColor: "red" | "yellow" | "orange" | "green" | "blue" | null,
  ) => {
    try {
      const response = await setFlagColor("tasks", task.id, flagColor);

      if (!response.ok) {
        throw new Error("Failed to update task flag");
      }

      // Refresh data to reflect changes
      refresh();

      toast({
        title: flagColor ? "Flag added" : "Flag removed",
        description: `"${task.title}" has been ${flagColor ? `flagged as ${flagColor}` : "unflagged"}.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to update flag",
        variant: "destructive",
      });
    }
  };

  const handleSortByChange = (value: string) => {
    const newSortBy = value as "dueDate" | "assignedToId" | "status" | "title";
    updateViewPreference("sortBy", newSortBy);
    // Sensible default sort directions
    if (
      newSortBy === "title" ||
      newSortBy === "assignedToId" ||
      newSortBy === "status"
    ) {
      updateViewPreference("sortDir", "asc");
    } else {
      // dueDate
      updateViewPreference("sortDir", "desc");
    }
  };

  const handleViewModeChange = (value: string) => {
    if (value) {
      // Ensure value is not empty
      updateViewPreference("viewMode", value as "tile" | "list");
    }
  };

  const handleTaskClick = useCallback(
    (task: Task) => {
      // Navigate to the dedicated task page instead of opening modal
      router.push(`/tasks/${task.id}`);
    },
    [router],
  );

  const openEditDialog = useCallback((task: Task) => {
    setSelectedTask(task);
    setEditingTask(task);
    setIsTaskDialogOpen(true);
  }, []);

  const handleEditInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setEditingTask((prev) => (prev ? { ...prev, [name]: value } : null));
  };

  const handleEditSelectChange = (name: keyof Task, value: string) => {
    setEditingTask((prev) => (prev ? { ...prev, [name]: value } : null));
  };

  // --- API Action Handlers (Create, Update, Delete, Status Change) ---

  const handleStatusChange = async (
    taskId: string,
    currentStatus: TaskStatus,
  ) => {
    // Determine the next status in the cycle: Not Started -> In Progress -> Completed -> Not Started
    let nextStatus: TaskStatus;
    if (currentStatus === "not-started") {
      nextStatus = "in-progress";
    } else if (currentStatus === "in-progress") {
      nextStatus = "completed";
    } else {
      // completed
      nextStatus = "not-started";
    }

    try {
      await updateTaskStatus(taskId, nextStatus);
      // toast({ title: "Status Updated", description: `Task marked as ${nextStatus.replace('-', ' ')}.` });
    } catch (error) {
      console.error("Error updating task status:", error);
      // Error handling is done in the mutation
    }
  };

  const handleCreateTask = async () => {
    // Validate required fields
    if (!newTask.title) {
      toast({
        title: "Error",
        description: "Task title is required.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Format dueDate to ISO string if present, otherwise omit the field
      const taskToSend = {
        ...newTask,
        // Only include dueDate if it has a value
        ...(newTask.dueDate && {
          dueDate: new Date(newTask.dueDate).toISOString(),
        }),
        status: newTask.status || "not-started", // Ensure status is set
        // Only include assignedToId if it has a value (not null/empty) - backend will assign current user if omitted
        ...(newTask.assignedToId &&
          newTask.assignedToId.trim() && {
            assignedToId: newTask.assignedToId,
          }),
        // Only include description if it's not empty
        ...(newTask.description && { description: newTask.description }),
        // Recurrence fields
        isRecurring: newTask.isRecurring || false,
        ...(newTask.isRecurring && {
          cronExpression: newTask.cronExpression,
          ...(newTask.recurrenceEndDate && {
            recurrenceEndDate: newTask.recurrenceEndDate,
          }),
          ...(newTask.recurrenceLimit && {
            recurrenceLimit: newTask.recurrenceLimit,
          }),
          runImmediately: newTask.runImmediately || false,
        }),
      };

      // Remove null/undefined fields to avoid Zod validation issues
      Object.keys(taskToSend).forEach((key) => {
        if (
          taskToSend[key as keyof typeof taskToSend] === null ||
          taskToSend[key as keyof typeof taskToSend] === undefined ||
          taskToSend[key as keyof typeof taskToSend] === ""
        ) {
          delete taskToSend[key as keyof typeof taskToSend];
        }
      });

      await createTask(taskToSend);

      // Reset form
      setNewTask({
        title: "",
        description: "",
        status: "not-started",
        dueDate: "",
        assignedToId: null, // Backend will assign current user
        tags: [],
        createdAt: "", // Placeholder - will be set by backend
        updatedAt: "", // Placeholder - will be set by backend
        userId: "", // Will be set by backend
        reviewStatus: "pending",
        flagColor: null,
        isPinned: false,
        enabled: true,
        processingStatus: null,
        isRecurring: false,
        cronExpression: null,
        recurrenceEndDate: null,
        recurrenceLimit: null,
        runImmediately: false,
        nextRunAt: null,
        lastRunAt: null,
        completedAt: null,
      });
      setTagInput(""); // Clear tag input specifically
      setIsNewTaskDialogOpen(false);
      toast({
        title: "Task Created",
        description: `"${taskToSend.title}" added.`,
      });
    } catch (error) {
      console.error("Error creating task:", error);
      // Error handling is done in the mutation
    }
  };

  const handleUpdateTask = async () => {
    if (!editingTask) return;

    // Validate required fields
    if (!editingTask.title) {
      toast({
        title: "Error",
        description: "Task title cannot be empty.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Prepare data for API: Convert YYYY-MM-DD back to ISO or omit the field
      const taskToSend = {
        ...editingTask,
        // Only include dueDate if it has a value
        ...(editingTask.dueDate && {
          dueDate: new Date(editingTask.dueDate).toISOString(),
        }),
        // Ensure status is one of the allowed ones
        status: ALLOWED_STATUSES.includes(editingTask.status as TaskStatus)
          ? editingTask.status
          : "not-started",
        // Only include assignedToId if it has a value (not null)
        ...(editingTask.assignedToId && {
          assignedToId: editingTask.assignedToId,
        }),
        // Only include description if it's not empty
        ...(editingTask.description && {
          description: editingTask.description,
        }),
      };

      // Remove null/undefined fields to avoid Zod validation issues
      Object.keys(taskToSend).forEach((key) => {
        if (
          taskToSend[key as keyof typeof taskToSend] === null ||
          taskToSend[key as keyof typeof taskToSend] === undefined ||
          taskToSend[key as keyof typeof taskToSend] === ""
        ) {
          delete taskToSend[key as keyof typeof taskToSend];
        }
      });

      // Remove id from the body if API expects it only in URL
      const { id, ...updateData } = taskToSend;

      await updateTask(editingTask.id, updateData);

      setIsTaskDialogOpen(false);
      setSelectedTask(null);
      setEditingTask(null);
      setTagInput("");
      toast({
        title: "Task Updated",
        description: `"${editingTask.title}" saved.`,
      });
    } catch (error) {
      console.error("Error updating task:", error);
      // Error handling is done in the mutation
    }
  };

  const openDeleteDialog = (taskId: string, taskTitle: string) => {
    setTaskToDelete({ id: taskId, title: taskTitle });
    setIsConfirmDeleteDialogOpen(true);
  };

  const handleDeleteConfirmed = async () => {
    if (!taskToDelete) return;

    try {
      await deleteTask(taskToDelete.id);

      // Close dialogs and clean up state
      setIsTaskDialogOpen(false);
      setSelectedTask(null);
      setEditingTask(null);
      setIsConfirmDeleteDialogOpen(false);
      setTaskToDelete(null);

      toast({
        title: "Task Deleted",
        description: `"${taskToDelete.title}" removed.`,
      });
    } catch (error) {
      console.error("Error deleting task:", error);
      // Error handling is done in the mutation
    }
  };

  // --- Tag Handling ---
  const handleAddTag = () => {
    if (!tagInput.trim()) return;
    const tag = tagInput.trim().toLowerCase();

    if (isNewTaskDialogOpen) {
      if (!newTask.tags.includes(tag)) {
        setNewTask((prev) => ({ ...prev, tags: [...prev.tags, tag] }));
      }
    } else if (editingTask) {
      // Use editingTask for the edit dialog
      if (!editingTask.tags.includes(tag)) {
        setEditingTask((prev) =>
          prev ? { ...prev, tags: [...prev.tags, tag] } : null,
        );
      }
    }
    setTagInput("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    if (isNewTaskDialogOpen) {
      setNewTask((prev) => ({
        ...prev,
        tags: prev.tags.filter((t) => t !== tagToRemove),
      }));
    } else if (editingTask) {
      // Use editingTask for the edit dialog
      setEditingTask((prev) =>
        prev
          ? { ...prev, tags: prev.tags.filter((t) => t !== tagToRemove) }
          : null,
      );
    }
  };

  // Handle chat button click
  const handleChatClick = (task: Task) => {
    // Use the global function to open assistant with pre-attached assets
    if (
      typeof window !== "undefined" &&
      (window as any).openAssistantWithAssets
    ) {
      (window as any).openAssistantWithAssets([
        {
          type: "task",
          id: task.id,
          title: task.title,
        },
      ]);
    }
  };

  const renderContent = () => {
    if (isLoading && tasks.length === 0) {
      return (
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-medium mb-2">Loading Tasks...</h2>
          </div>
        </div>
      );
    }

    if (error && tasks.length === 0) {
      return (
        <div className="container mx-auto py-10 text-center">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-2">
                Error Loading Tasks
              </h2>
              <p className="text-muted-foreground mb-4">
                {error instanceof Error
                  ? error.message
                  : "Failed to load tasks"}
              </p>
              <Button onClick={refresh} className="mt-4">
                Try Again
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (sortedTasks.length === 0) {
      // Empty state rendering...
      return (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-10 text-center">
            <CheckSquare className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <p className="mb-4 text-muted-foreground">
              {tasks.length === 0
                ? "Your task collection is empty."
                : "No tasks found matching your criteria."}
            </p>
            {tasks.length === 0 && (
              <p className="text-muted-foreground">
                Create your first task to get started organizing your work.
              </p>
            )}
          </CardContent>
        </Card>
      );
    }

    // --- Render logic adapted from DocumentsPage ---
    let lastGroupLabel = "";
    // Grouping only makes sense for 'dueDate' sort
    const isGrouped = sortBy === "dueDate";

    return (
      <div className="space-y-4">
        {" "}
        {/* Outer container for potential groups */}
        {viewMode === "tile" ? (
          // Setup the grid layout here
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sortedTasks.map((task, index) => {
              const currentGroupLabel = isGrouped
                ? getGroupDateLabel(task.dueDate)
                : "";
              const showGroupHeader =
                isGrouped && currentGroupLabel !== lastGroupLabel;
              if (showGroupHeader) {
                lastGroupLabel = currentGroupLabel;
              }

              return (
                <React.Fragment key={task.id}>
                  {showGroupHeader && (
                    // Group Header for Tile View
                    <h2 className="col-span-full text-base font-semibold mt-4 mb-1 pl-1 text-muted-foreground tracking-wide uppercase">
                      {currentGroupLabel}
                    </h2>
                  )}
                  {/* Render individual tile item */}
                  <TaskTileItem
                    task={task}
                    onTaskClick={handleTaskClick}
                    onEditClick={openEditDialog}
                    onStatusChange={handleStatusChange}
                    onDeleteTask={openDeleteDialog}
                    onPinToggle={handlePinToggle}
                    onFlagColorChange={handleFlagColorChange}
                    onChatClick={handleChatClick}
                    currentUserId={currentUserId}
                    allAssignees={allAssignees}
                    currentUser={
                      auth?.user ? transformBackendUser(auth.user) : undefined
                    }
                    // Pass index/isFocused if needed later
                  />
                </React.Fragment>
              );
            })}
          </div> // List View
        ) : isClient ? (
          // Setup the table structure here
          <Card>
            {" "}
            {/* Wrap list view in a card */}
            <Table className="w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px] hidden sm:table-cell pl-4 pr-2"></TableHead>
                  <TableHead className="min-w-0 flex-1">Title</TableHead>
                  <TableHead className="w-[120px] hidden md:table-cell">
                    Status
                  </TableHead>
                  <TableHead className="w-[140px] hidden lg:table-cell">
                    Assignee
                  </TableHead>
                  <TableHead className="w-[120px] hidden sm:table-cell">
                    Due Date
                  </TableHead>
                  <TableHead className="w-[150px] hidden lg:table-cell">
                    Tags
                  </TableHead>
                  <TableHead className="w-fit text-right pr-4 pl-2">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTasks.map((task, index) => {
                  const currentGroupLabel = isGrouped
                    ? getGroupDateLabel(task.dueDate)
                    : "";
                  const showGroupHeader =
                    isGrouped && currentGroupLabel !== lastGroupLabel;
                  if (showGroupHeader) {
                    lastGroupLabel = currentGroupLabel;
                  }

                  return (
                    <React.Fragment key={task.id}>
                      {showGroupHeader && (
                        // Group Header Row for List View
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          {/* Adjust colSpan to match your number of columns */}
                          <TableCell
                            colSpan={8}
                            className="py-2 px-4 text-sm font-semibold text-muted-foreground tracking-wide uppercase"
                          >
                            {currentGroupLabel}
                          </TableCell>
                        </TableRow>
                      )}
                      {/* Render individual list row item */}
                      <TaskListItem
                        task={task}
                        onTaskClick={handleTaskClick}
                        onEditClick={openEditDialog}
                        onStatusChange={handleStatusChange}
                        onDeleteTask={openDeleteDialog}
                        onPinToggle={handlePinToggle}
                        onFlagColorChange={handleFlagColorChange}
                        onChatClick={handleChatClick}
                        currentUserId={currentUserId}
                        allAssignees={allAssignees}
                        currentUser={
                          auth?.user
                            ? transformBackendUser(auth.user)
                            : undefined
                        }
                        // Pass index/isFocused if needed later
                      />
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        ) : (
          // Placeholder for ListView SSR
          <Card className="w-full h-60 animate-pulse">
            <CardContent className="p-4 space-y-3">
              <div className="h-8 bg-muted rounded w-full"></div>
              <div className="h-8 bg-muted rounded w-full"></div>
              <div className="h-8 bg-muted rounded w-full"></div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  // Helper function to count active filters
  const getActiveFilterCount = () => {
    let count = 0;
    if (filterStatus !== "all") count++;
    if (filterAssignee !== "all") count++;
    if (filterTag !== "all") count++;
    return count;
  };

  // Helper function to clear all filters
  const clearAllFilters = () => {
    setFilterStatus("all");
    setFilterAssignee("all");
    setFilterTag("all");
  };

  // FilterSortDialog component
  const FilterSortDialog = () => (
    <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Filter & Sort Tasks</DialogTitle>
          <DialogDescription>
            Customize how you view and organize your tasks.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Filters Section */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              Filters
            </h4>

            {/* Status Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select
                value={filterStatus}
                onValueChange={(v) => setFilterStatus(v as TaskStatus | "all")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="not-started">Not Started</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Assignee Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Assignee</label>
              <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Assignees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Assignees</SelectItem>
                  {/* Group by user type */}
                  {allAssignees.filter((a) => a.userType === "assistant")
                    .length > 0 && (
                    <>
                      <SelectItem
                        value="__section_ai__"
                        disabled
                        className="text-xs font-semibold text-muted-foreground"
                      >
                        AI Assistants
                      </SelectItem>
                      {allAssignees
                        .filter((a) => a.userType === "assistant")
                        .map((assignee) => (
                          <SelectItem key={assignee.id} value={assignee.id}>
                            <div className="flex items-center gap-2">
                              <AIAvatar size="sm" />
                              {assignee.name}
                            </div>
                          </SelectItem>
                        ))}
                    </>
                  )}
                  {allAssignees.filter((a) => a.userType !== "assistant")
                    .length > 0 && (
                    <>
                      <SelectItem
                        value="__section_team__"
                        disabled
                        className="text-xs font-semibold text-muted-foreground"
                      >
                        Team Members
                      </SelectItem>
                      {allAssignees
                        .filter((a) => a.userType !== "assistant")
                        .map((assignee) => (
                          <SelectItem key={assignee.id} value={assignee.id}>
                            <div className="flex items-center gap-2">
                              {assignee.id === auth?.user?.id && auth.user ? (
                                <UserAvatar
                                  user={transformAuthUserForAvatar(auth.user)}
                                  size="sm"
                                />
                              ) : (
                                <UserIcon className="h-3 w-3" />
                              )}
                              {assignee.name}
                            </div>
                          </SelectItem>
                        ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Tag Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Tag</label>
              <Select value={filterTag} onValueChange={setFilterTag}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Tags" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tags</SelectItem>
                  {allTags.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      {tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Sort Section */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              Sort & View
            </h4>

            {/* Sort By */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Sort By</label>
              <Select value={sortBy} onValueChange={handleSortByChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dueDate">Due Date</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="assignedToId">Assignee</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort Direction */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Sort Direction</label>
              <Button
                variant="outline"
                onClick={toggleSortDir}
                className="w-full justify-start"
              >
                {sortDir === "asc" ? (
                  <>
                    <ArrowUp className="mr-2 h-4 w-4" />
                    Ascending
                  </>
                ) : (
                  <>
                    <ArrowDown className="mr-2 h-4 w-4" />
                    Descending
                  </>
                )}
              </Button>
            </div>

            {/* View Mode */}
            <div className="space-y-2">
              <label className="text-sm font-medium">View Mode</label>
              <ToggleGroup
                type="single"
                value={viewMode}
                onValueChange={handleViewModeChange}
                className="w-full justify-start"
              >
                <ToggleGroupItem
                  value="tile"
                  aria-label="Tile view"
                  className="flex-1"
                >
                  <LayoutGrid className="mr-2 h-4 w-4" />
                  Tiles
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="list"
                  aria-label="List view"
                  className="flex-1"
                >
                  <List className="mr-2 h-4 w-4" />
                  List
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={clearAllFilters}
            className="w-full sm:w-auto"
          >
            Clear All Filters
          </Button>
          <Button
            onClick={() => setIsFilterDialogOpen(false)}
            className="w-full sm:w-auto"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-4">
            <MobileListsBackButton />
            <div>
              <h1 className="text-lg md:text-3xl font-bold md:tracking-tight">
                Tasks
                {tasks.length > 0 && (
                  <span className="ml-2 text-sm md:text-base font-normal text-muted-foreground">
                    {sortedTasks.length === tasks.length
                      ? `(${tasks.length})`
                      : `(${sortedTasks.length} of ${tasks.length})`}
                  </span>
                )}
              </h1>
            </div>
          </div>
        </div>
        <Button
          onClick={() => {
            // Reset new task form before opening
            setNewTask({
              title: "",
              description: "",
              status: "not-started",
              dueDate: "",
              assignedToId: currentUserId,
              tags: [],
              createdAt: "", // Placeholder - will be set by backend
              updatedAt: "", // Placeholder - will be set by backend
              userId: currentUserId,
              reviewStatus: "pending",
              flagColor: null,
              isPinned: false,
              enabled: true,
              processingStatus: null,
              isRecurring: false,
              cronExpression: null,
              recurrenceEndDate: null,
              recurrenceLimit: null,
              runImmediately: false,
              nextRunAt: null,
              lastRunAt: null,
              completedAt: null,
            });
            setTagInput("");
            setIsNewTaskDialogOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> New Task
        </Button>
      </div>

      {/* Controls: Search, Filters, Sort, View */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
        {/* Search Input + Filter Button Container */}
        <div className="flex gap-2 flex-grow w-full md:w-auto">
          {/* Search Input */}
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks..."
              className={`pl-10 w-full ${searchQuery ? "pr-10" : ""}`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filter Button - Mobile only */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsFilterDialogOpen(true)}
            className="md:hidden shrink-0 relative"
            title="Filter and sort tasks"
          >
            <Filter className="h-4 w-4" />
            {getActiveFilterCount() > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full h-4 w-4 flex items-center justify-center">
                {getActiveFilterCount()}
              </span>
            )}
          </Button>
        </div>

        {/* Filters, Sort, View Switcher Wrapper - Hidden on mobile, shown on desktop */}
        <div className="hidden md:flex flex-wrap gap-2 items-center w-full md:w-auto justify-start md:justify-end">
          {/* Status Filter */}
          <Select
            value={filterStatus}
            onValueChange={(v) => setFilterStatus(v as TaskStatus | "all")}
          >
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="not-started">Not Started</SelectItem>
              <SelectItem value="in-progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>

          {/* Assignee Filter */}
          <Select value={filterAssignee} onValueChange={setFilterAssignee}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assignees</SelectItem>
              {/* Group by user type */}
              {allAssignees.filter((a) => a.userType === "assistant").length >
                0 && (
                <>
                  <SelectItem
                    value="__section_ai__"
                    disabled
                    className="text-xs font-semibold text-muted-foreground"
                  >
                    AI Assistants
                  </SelectItem>
                  {allAssignees
                    .filter((a) => a.userType === "assistant")
                    .map((assignee) => (
                      <SelectItem key={assignee.id} value={assignee.id}>
                        <div className="flex items-center gap-2">
                          <AIAvatar size="sm" />
                          {assignee.name}
                        </div>
                      </SelectItem>
                    ))}
                </>
              )}
              {allAssignees.filter((a) => a.userType !== "assistant").length >
                0 && (
                <>
                  <SelectItem
                    value="__section_team__"
                    disabled
                    className="text-xs font-semibold text-muted-foreground"
                  >
                    Team Members
                  </SelectItem>
                  {allAssignees
                    .filter((a) => a.userType !== "assistant")
                    .map((assignee) => (
                      <SelectItem key={assignee.id} value={assignee.id}>
                        <div className="flex items-center gap-2">
                          {assignee.id === auth?.user?.id && auth.user ? (
                            <UserAvatar
                              user={transformAuthUserForAvatar(auth.user)}
                              size="sm"
                            />
                          ) : (
                            <UserIcon className="h-3 w-3" />
                          )}
                          {assignee.name}
                        </div>
                      </SelectItem>
                    ))}
                </>
              )}
            </SelectContent>
          </Select>

          {/* Tag Filter */}
          <Select value={filterTag} onValueChange={setFilterTag}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tags</SelectItem>
              {allTags.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sort By Dropdown */}
          <Select value={sortBy} onValueChange={handleSortByChange}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dueDate">Due Date</SelectItem>
              <SelectItem value="title">Title</SelectItem>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="assignedToId">Assignee</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort Direction Button */}
          <Button
            variant="outline"
            size="icon"
            onClick={toggleSortDir}
            title={`Sort Direction: ${sortDir === "asc" ? "Ascending" : "Descending"}`}
          >
            {sortDir === "asc" ? (
              <ArrowUp className="h-4 w-4" />
            ) : (
              <ArrowDown className="h-4 w-4" />
            )}
          </Button>

          {/* View Mode Toggle */}
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={handleViewModeChange}
            className="w-full sm:w-auto justify-start"
          >
            <ToggleGroupItem
              value="tile"
              aria-label="Tile view"
              title="Tile View"
            >
              <LayoutGrid className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="list"
              aria-label="List view"
              title="List View"
            >
              <List className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {/* Main Content Area (Grouped Tiles or List) */}
      {isLoading &&
        tasks.length > 0 && ( // Show loading indicator only if refreshing
          <div className="text-center text-muted-foreground py-4 flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        )}
      {renderContent()}

      {/* --- Dialogs --- */}

      {/* Edit/View Task Dialog */}
      <Dialog
        open={isTaskDialogOpen}
        onOpenChange={(open) => {
          setIsTaskDialogOpen(open);
          if (!open) {
            setSelectedTask(null); // Clear selected task when closing
            setEditingTask(null);
            setTagInput(""); // Clear tag input
          }
        }}
      >
        <DialogContent className="sm:max-w-[625px]">
          <DialogHeader>
            <DialogTitle>Task Details</DialogTitle>
            <DialogDescription>
              View or edit task details below.
            </DialogDescription>
          </DialogHeader>
          {editingTask && ( // Use editingTask for form binding
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto px-2">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="edit-title">
                  Title <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit-title"
                  name="title" // Add name attribute
                  value={editingTask.title}
                  onChange={handleEditInputChange}
                  required
                />
              </div>
              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  name="description" // Add name attribute
                  rows={3}
                  value={editingTask.description || ""}
                  onChange={handleEditInputChange}
                />
              </div>
              {/* Status & Due Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-status">Status</Label>
                  <Select
                    name="status" // Add name attribute
                    value={editingTask.status}
                    onValueChange={(value) =>
                      handleEditSelectChange("status", value)
                    }
                  >
                    <SelectTrigger id="edit-status">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not-started">Not Started</SelectItem>
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-due-date">Due Date</Label>
                  <Input
                    id="edit-due-date"
                    name="dueDate" // Add name attribute
                    type="datetime-local" // Use datetime-local for time selection
                    value={formatDateForInput(editingTask.dueDate)} // Format for datetime-local input
                    onChange={handleEditInputChange}
                  />
                </div>
              </div>
              {/* Assignee */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-assignee">Assignee</Label>
                  <Select
                    name="assignedToId"
                    // Map null state to "UNASSIGNED" for the Select's value
                    value={editingTask.assignedToId || "UNASSIGNED"}
                    // Map "UNASSIGNED" back to null when updating state
                    onValueChange={(value) => {
                      const finalValue = value === "UNASSIGNED" ? null : value;
                      // Update the state directly here instead of relying on handleEditSelectChange for this specific mapping
                      setEditingTask((prev) =>
                        prev ? { ...prev, assignedToId: finalValue } : null,
                      );
                    }}
                  >
                    <SelectTrigger id="edit-assignee">
                      <SelectValue placeholder="Assignee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
                      {/* Group by user type */}
                      {allAssignees.filter((a) => a.userType === "assistant")
                        .length > 0 && (
                        <>
                          <SelectItem
                            value="__section_ai__"
                            disabled
                            className="text-xs font-semibold text-muted-foreground"
                          >
                            AI Assistants
                          </SelectItem>
                          {allAssignees
                            .filter((a) => a.userType === "assistant")
                            .map((assignee) => (
                              <SelectItem key={assignee.id} value={assignee.id}>
                                <div className="flex items-center gap-2">
                                  <AIAvatar size="sm" />
                                  {assignee.name}
                                </div>
                              </SelectItem>
                            ))}
                        </>
                      )}
                      {allAssignees.filter((a) => a.userType !== "assistant")
                        .length > 0 && (
                        <>
                          <SelectItem
                            value="__section_team__"
                            disabled
                            className="text-xs font-semibold text-muted-foreground"
                          >
                            Team Members
                          </SelectItem>
                          {allAssignees
                            .filter((a) => a.userType !== "assistant")
                            .map((assignee) => (
                              <SelectItem key={assignee.id} value={assignee.id}>
                                <div className="flex items-center gap-2">
                                  {assignee.id === auth?.user?.id &&
                                  auth.user ? (
                                    <UserAvatar
                                      user={transformAuthUserForAvatar(
                                        auth.user,
                                      )}
                                      size="sm"
                                    />
                                  ) : (
                                    <UserIcon className="h-3 w-3" />
                                  )}
                                  {assignee.name}
                                </div>
                              </SelectItem>
                            ))}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Tags */}
              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-2 mb-2 min-h-[24px]">
                  {" "}
                  {/* Ensure min height */}
                  {editingTask.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      {tag}
                      <button
                        type="button"
                        className="ml-1 text-muted-foreground hover:text-foreground focus:outline-none"
                        onClick={() => handleRemoveTag(tag)}
                        aria-label={`Remove tag ${tag}`}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a tag..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddTag}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="sm:justify-between gap-2 pt-4 border-t mt-2">
            {/* Delete Button */}
            <Button
              variant="destructive"
              onClick={() =>
                editingTask &&
                openDeleteDialog(editingTask.id, editingTask.title)
              }
              disabled={isDeleting || isUpdating}
            >
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </Button>
            {/* Cancel & Save Buttons */}
            <div className="flex gap-2">
              <DialogClose asChild>
                <Button variant="outline" disabled={isUpdating || isDeleting}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                onClick={handleUpdateTask}
                disabled={isUpdating || isDeleting || !editingTask?.title}
              >
                {isUpdating && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save Changes
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Task Dialog */}
      <Dialog open={isNewTaskDialogOpen} onOpenChange={setIsNewTaskDialogOpen}>
        <DialogContent className="sm:max-w-[625px]">
          <DialogHeader>
            <DialogTitle>Create New Task</DialogTitle>
            <DialogDescription>Add a new task to your list.</DialogDescription>
          </DialogHeader>
          {/* Use a form element for better semantics and potential native validation */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateTask();
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
                  value={newTask.title}
                  onChange={(e) =>
                    setNewTask({ ...newTask, title: e.target.value })
                  }
                  required // Add required attribute
                />
              </div>
              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="new-description">Description</Label>
                <Textarea
                  id="new-description"
                  placeholder="Task description (optional)"
                  rows={3}
                  value={newTask.description || ""}
                  onChange={(e) =>
                    setNewTask({ ...newTask, description: e.target.value })
                  }
                />
              </div>
              {/* Status & Due Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new-status">Status</Label>
                  <Select
                    value={newTask.status}
                    onValueChange={(value) =>
                      setNewTask({ ...newTask, status: value as TaskStatus })
                    }
                  >
                    <SelectTrigger id="new-status">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not-started">Not Started</SelectItem>
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      {/* Completed usually set via action, not creation */}
                      {/* <SelectItem value="completed">Completed</SelectItem> */}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-due-date">Due Date</Label>
                  <Input
                    id="new-due-date"
                    type="datetime-local"
                    value={formatDateForInput(newTask.dueDate)} // Format for datetime-local input
                    onChange={(e) =>
                      setNewTask({ ...newTask, dueDate: e.target.value })
                    }
                  />
                </div>

                {/* Recurrence */}
                <div className="space-y-2">
                  <RecurrenceToggle
                    value={{
                      isRecurring: newTask.isRecurring,
                      cronExpression: newTask.cronExpression,
                      recurrenceEndDate: newTask.recurrenceEndDate,
                      recurrenceLimit: newTask.recurrenceLimit,
                      runImmediately: newTask.runImmediately,
                    }}
                    onChange={(config) =>
                      setNewTask({
                        ...newTask,
                        isRecurring: config.isRecurring,
                        cronExpression: config.cronExpression,
                        recurrenceEndDate: config.recurrenceEndDate,
                        recurrenceLimit: config.recurrenceLimit,
                        runImmediately: config.runImmediately,
                      })
                    }
                    dueDate={newTask.dueDate}
                  />
                </div>
              </div>
              {/* Assignee */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new-assignee">Assignee</Label>
                  <Select
                    // Map null state to "UNASSIGNED" for the Select's value
                    value={newTask.assignedToId || "UNASSIGNED"}
                    // Map "UNASSIGNED" back to null when updating state
                    onValueChange={(value) =>
                      setNewTask({
                        ...newTask,
                        assignedToId: value === "UNASSIGNED" ? null : value,
                      })
                    }
                  >
                    <SelectTrigger id="new-assignee">
                      <SelectValue placeholder="Assignee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
                      {/* Group by user type */}
                      {allAssignees.filter((a) => a.userType === "assistant")
                        .length > 0 && (
                        <>
                          <SelectItem
                            value="__section_ai__"
                            disabled
                            className="text-xs font-semibold text-muted-foreground"
                          >
                            AI Assistants
                          </SelectItem>
                          {allAssignees
                            .filter((a) => a.userType === "assistant")
                            .map((assignee) => (
                              <SelectItem key={assignee.id} value={assignee.id}>
                                <div className="flex items-center gap-2">
                                  <AIAvatar size="sm" />
                                  {assignee.name}
                                </div>
                              </SelectItem>
                            ))}
                        </>
                      )}
                      {allAssignees.filter((a) => a.userType !== "assistant")
                        .length > 0 && (
                        <>
                          <SelectItem
                            value="__section_team__"
                            disabled
                            className="text-xs font-semibold text-muted-foreground"
                          >
                            Team Members
                          </SelectItem>
                          {allAssignees
                            .filter((a) => a.userType !== "assistant")
                            .map((assignee) => (
                              <SelectItem key={assignee.id} value={assignee.id}>
                                <div className="flex items-center gap-2">
                                  {assignee.id === auth?.user?.id &&
                                  auth.user ? (
                                    <UserAvatar
                                      user={transformAuthUserForAvatar(
                                        auth.user,
                                      )}
                                      size="sm"
                                    />
                                  ) : (
                                    <UserIcon className="h-3 w-3" />
                                  )}
                                  {assignee.name}
                                </div>
                              </SelectItem>
                            ))}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Tags */}
              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-2 mb-2 min-h-[24px]">
                  {newTask.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      {tag}
                      <button
                        type="button"
                        className="ml-1 text-muted-foreground hover:text-foreground focus:outline-none"
                        onClick={() => handleRemoveTag(tag)}
                        aria-label={`Remove tag ${tag}`}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a tag..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddTag}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter className="pt-4 border-t mt-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={isUpdating}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isUpdating || !newTask.title}>
                {isUpdating && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Task
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deletion Confirmation Dialog */}
      <Dialog
        open={isConfirmDeleteDialogOpen}
        onOpenChange={setIsConfirmDeleteDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this task? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          {taskToDelete && (
            <div className="my-4 p-3 border rounded-md bg-muted/50">
              <div className="min-w-0">
                <p className="font-medium break-words line-clamp-2 leading-tight">
                  {taskToDelete.title}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Task will be permanently removed from your list.
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="sm:justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setIsConfirmDeleteDialogOpen(false);
                setTaskToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirmed}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Filter & Sort Dialog */}
      <FilterSortDialog />
    </div>
  );
}

// --- Child Components for Views ---

// --- 1. Tile View ---
interface TileViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onStatusChange: (taskId: string, currentStatus: TaskStatus) => void;
  onDeleteTask: (taskId: string, taskTitle: string) => void;
  onEditClick: (task: Task) => void;
  onPinToggle: (task: Task) => void;
  onFlagColorChange: (
    task: Task,
    color: "red" | "orange" | "yellow" | "green" | "blue" | "purple" | null,
  ) => void;
  onChatClick: (task: Task) => void;
  allAssignees: Array<{ id: string; name: string; userType: string }>;
  currentUserId: string;
  currentUser?: User;
}

function TileView({
  tasks,
  onTaskClick,
  onStatusChange,
  onDeleteTask,
  onEditClick,
  onPinToggle,
  onFlagColorChange,
  onChatClick,
  allAssignees,
  currentUserId,
  currentUser,
}: TileViewProps) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {tasks.map((task) => (
        <Card
          key={task.id}
          className="cursor-pointer transition-shadow hover:shadow-md flex flex-col" // Added flex flex-col
          onClick={() => onTaskClick(task)}
        >
          <CardHeader className="p-4 pb-2">
            {" "}
            {/* Reduced bottom padding */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 space-y-1">
                <CardTitle className="text-base line-clamp-2 flex items-center gap-2">
                  {task.title}
                  {task.isRecurring && (
                    <RefreshCw className="h-3 w-3 text-blue-500 flex-shrink-0" />
                  )}
                </CardTitle>{" "}
                {/* Allow two lines */}
                <CardDescription className="text-xs">
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
                </CardDescription>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  asChild
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  onClick={(e) => e.stopPropagation()}
                >
                  <DropdownMenuItem onClick={() => onTaskClick(task)}>
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
                    onClick={() => onDeleteTask(task.id, task.title)}
                    className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/50"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2 flex-grow flex flex-col justify-between">
            {" "}
            {/* Added flex-grow and justify-between */}
            <div>
              {" "}
              {/* Wrapper for description and tags */}
              <div className="line-clamp-3 text-sm text-muted-foreground mb-3">
                <MarkdownPreview
                  content={task.description}
                  maxLength={200}
                  preserveFormatting={true}
                />
              </div>
              {task.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {task.tags.slice(0, 3).map(
                    (
                      tag, // Limit displayed tags
                    ) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="text-xs font-normal"
                      >
                        {tag}
                      </Badge>
                    ),
                  )}
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
              {" "}
              {/* Added mt-auto and pt-2 */}
              <div className="flex items-center gap-2">
                {getStatusBadge(task.status)}
              </div>
              <div
                className="flex items-center text-muted-foreground"
                title={`Assigned to ${task.assignedToId || "Unassigned"}`}
              >
                {task.assignedToId
                  ? (() => {
                      const assignee = allAssignees.find(
                        (a) => a.id === task.assignedToId,
                      );
                      const displayName = assignee
                        ? assignee.name
                        : task.assignedToId;
                      const truncated =
                        displayName.length > 10
                          ? displayName.substring(0, 10) + "..."
                          : displayName;
                      return (
                        <div className="flex items-center gap-1">
                          {assignee?.userType === "assistant" ? (
                            <AIAvatar size="sm" />
                          ) : assignee?.id === currentUser?.id &&
                            currentUser ? (
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
      ))}
    </div>
  );
}

// --- 2. List View ---
interface ListViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onStatusChange: (taskId: string, currentStatus: TaskStatus) => void;
  onDeleteTask: (taskId: string, taskTitle: string) => void;
  onEditClick: (task: Task) => void;
  onPinToggle: (task: Task) => void;
  onFlagColorChange: (
    task: Task,
    color: "red" | "orange" | "yellow" | "green" | "blue" | "purple" | null,
  ) => void;
  onChatClick: (task: Task) => void;
  allAssignees: Array<{ id: string; name: string; userType: string }>;
  currentUserId: string;
  currentUser?: User;
}

function ListView({
  tasks,
  onTaskClick,
  onStatusChange,
  onDeleteTask,
  onEditClick,
  onPinToggle,
  onFlagColorChange,
  onChatClick,
  allAssignees,
  currentUserId,
  currentUser,
}: ListViewProps) {
  return (
    <Card>
      <Table className="w-full">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[60px] hidden sm:table-cell pl-4 pr-2"></TableHead>
            <TableHead className="min-w-0 flex-1">Title</TableHead>
            <TableHead className="w-[120px] hidden md:table-cell">
              Status
            </TableHead>
            <TableHead className="w-[140px] hidden lg:table-cell">
              Assignee
            </TableHead>
            <TableHead className="w-[120px] hidden sm:table-cell">
              Due Date
            </TableHead>
            <TableHead className="w-[150px] hidden lg:table-cell">
              Tags
            </TableHead>
            <TableHead className="w-fit text-right pr-4 pl-2">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => {
            // Simplify status icon selection
            let statusIcon;
            if (task.status === "completed") {
              statusIcon = <CheckCircle2 className="h-4 w-4 text-green-500" />;
            } else if (task.status === "in-progress") {
              statusIcon = (
                <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
              );
            } else {
              statusIcon = <Circle className="h-4 w-4 text-muted-foreground" />;
            }

            return (
              <TableRow
                key={task.id}
                className="cursor-pointer"
                onClick={() => onTaskClick(task)}
              >
                <TableCell className="hidden sm:table-cell pl-4 pr-2">
                  <div className="flex items-center justify-center h-full">
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
                      {statusIcon}
                    </Button>
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
                  {getStatusBadge(task.status)}
                </TableCell>
                <TableCell className="hidden lg:table-cell align-middle">
                  <div className="flex items-center text-sm text-muted-foreground truncate">
                    <span className="truncate">
                      {task.assignedToId ? (
                        (() => {
                          const assignee = allAssignees.find(
                            (a) => a.id === task.assignedToId,
                          );
                          const displayName = assignee
                            ? assignee.name
                            : task.assignedToId;
                          return (
                            <div className="flex items-center gap-1">
                              {assignee?.userType === "assistant" ? (
                                <AIAvatar size="sm" />
                              ) : assignee?.id === currentUser?.id &&
                                currentUser ? (
                                <UserAvatar
                                  user={transformUserForAvatar(currentUser)}
                                  size="sm"
                                />
                              ) : (
                                <UserIcon className="h-3 w-3" />
                              )}
                              <span>{displayName}</span>
                            </div>
                          );
                        })()
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
                          onFlagColorChange(
                            task,
                            task.flagColor ? null : "orange",
                          )
                        }
                        onFlagColorChange={(color) =>
                          onFlagColorChange(task, color)
                        }
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
                      title={(() => {
                        const assignee = allAssignees.find(
                          (a) => a.id === task.assignedToId,
                        );
                        return assignee?.userType === "assistant"
                          ? `Chat with ${assignee.name || "AI Assistant"} about this task`
                          : "Chat with AI about this task";
                      })()}
                    >
                      <MessageSquare className="h-3.5 w-3.5 text-gray-400" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        asChild
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenuItem onClick={() => onTaskClick(task)}>
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
                          onClick={() => onDeleteTask(task.id, task.title)}
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
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

function TaskTileItem({
  task,
  onTaskClick,
  onEditClick,
  onStatusChange,
  onDeleteTask,
  onPinToggle,
  onFlagColorChange,
  onChatClick,
  currentUserId,
  allAssignees,
  currentUser,
}: TaskTileItemProps) {
  // *** Paste the content of the .map() callback from the original TileView here ***
  // Replace references to 'task' with the 'task' prop.
  return (
    <Card
      key={task.id} // Key is now handled in the parent loop, but good practice here too
      className="cursor-pointer transition-shadow hover:shadow-md flex flex-col"
      onClick={() => onTaskClick(task)}
      // Add data-index={index} and tabIndex={-1} if needed for keyboard nav
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
              {(() => {
                const assignee = allAssignees.find(
                  (a) => a.id === task.assignedToId,
                );
                return (
                  assignee?.userType === "assistant" && (
                    <Badge
                      variant="default"
                      className="text-xs shrink-0 flex items-center gap-1"
                    >
                      <AIAvatar size="sm" />
                      AI
                    </Badge>
                  )
                );
              })()}
            </div>
            <CardDescription className="text-xs">
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
              title={(() => {
                const assignee = allAssignees.find(
                  (a) => a.id === task.assignedToId,
                );
                return assignee?.userType === "assistant"
                  ? `Chat with ${assignee.name || "AI Assistant"} about this task`
                  : "Chat with AI about this task";
              })()}
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
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem onClick={() => onTaskClick(task)}>
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
                  onClick={() => onDeleteTask(task.id, task.title)}
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
                  const assignee = allAssignees.find(
                    (a) => a.id === task.assignedToId,
                  );
                  const displayName = assignee
                    ? assignee.name
                    : task.assignedToId;
                  const truncated =
                    displayName.length > 10
                      ? displayName.substring(0, 10) + "..."
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

function TaskListItem({
  task,
  onTaskClick,
  onEditClick,
  onStatusChange,
  onDeleteTask,
  onPinToggle,
  onFlagColorChange,
  onChatClick,
  currentUserId,
  allAssignees,
  currentUser,
}: TaskListItemProps) {
  // *** Paste the content of the .map() callback from the original ListView here ***
  // This will be the <TableRow> element and its contents.
  // Replace references to 'task' with the 'task' prop.

  // Simplify status icon selection
  let statusIcon;
  if (task.status === "completed") {
    statusIcon = <CheckCircle2 className="h-4 w-4 text-green-500" />;
  } else if (task.status === "in-progress") {
    statusIcon = <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
  } else {
    statusIcon = <Circle className="h-4 w-4 text-muted-foreground" />;
  }

  return (
    <TableRow
      key={task.id} // Key handled in parent, but good practice
      className="cursor-pointer hover:bg-muted/50" // Add hover effect
      onClick={() => onTaskClick(task)}
      // Add data-index={index} and tabIndex={-1} if needed for keyboard nav
    >
      <TableCell className="hidden sm:table-cell pl-4 pr-2">
        <div className="flex items-center justify-center h-full">
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
            {statusIcon}
          </Button>
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
        {getStatusBadge(task.status)}
      </TableCell>
      <TableCell className="hidden lg:table-cell align-middle">
        <div className="flex items-center text-sm text-muted-foreground truncate">
          <span className="truncate">
            {task.assignedToId ? (
              (() => {
                const assignee = allAssignees.find(
                  (a) => a.id === task.assignedToId,
                );
                const displayName = assignee
                  ? assignee.name
                  : task.assignedToId;
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
                    <span>{displayName}</span>
                  </div>
                );
              })()
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
            title={(() => {
              const assignee = allAssignees.find(
                (a) => a.id === task.assignedToId,
              );
              return assignee?.userType === "assistant"
                ? `Chat with ${assignee.name || "AI Assistant"} about this task`
                : "Chat with AI about this task";
            })()}
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
              <DropdownMenuItem onClick={() => onTaskClick(task)}>
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
                onClick={() => onDeleteTask(task.id, task.title)}
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
