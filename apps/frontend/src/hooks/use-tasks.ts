import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/frontend-api";
import type { Task, TaskStatus } from "@/types/task";

// Transform backend task data to frontend format
// biome-ignore lint/suspicious/noExplicitAny: backend API response shape is not statically typed
const transformTaskData = (backendTask: any): Task => {
  return {
    id: backendTask.id,
    userId: backendTask.userId || "",
    title: backendTask.title,
    description: backendTask.description,
    status: backendTask.status,
    dueDate: backendTask.dueDate,
    assignedToId: backendTask.assignedToId,
    tags: backendTask.tags || [],
    createdAt: backendTask.createdAt || new Date().toISOString(),
    updatedAt: backendTask.updatedAt || new Date().toISOString(),
    // Processing status (unified from backend)
    processingStatus: backendTask.processingStatus || null,
    // Review, flagging, and pinning
    reviewStatus: backendTask.reviewStatus || "pending",
    flagColor: backendTask.flagColor || null,
    isPinned: backendTask.isPinned || false,
    enabled: backendTask.enabled ?? true,
    // Recurrence fields
    isRecurring: backendTask.isRecurring || false,
    cronExpression: backendTask.cronExpression || null,
    recurrenceEndDate: backendTask.recurrenceEndDate || null,
    recurrenceLimit: backendTask.recurrenceLimit || null,
    runImmediately: backendTask.runImmediately || false,
    nextRunAt: backendTask.nextRunAt || null,
    lastRunAt: backendTask.lastRunAt || null,
    completedAt: backendTask.completedAt || null,
    // Comments (if included)
    comments: backendTask.comments || undefined,
  };
};

/**
 * React Query hook for tasks data fetching and management
 */
export function useTasks() {
  const queryClient = useQueryClient();

  const queryKey = ["tasks"];

  // Main tasks query
  const {
    data: tasks = [],
    isLoading,
    error,
    refetch,
  } = useQuery<Task[]>({
    queryKey,
    queryFn: async () => {
      const response = await apiFetch("/api/tasks?limit=9999");

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to load tasks");
      }

      const data = await response.json();

      // Handle different response structures - ensure we always get an array
      const tasksArray = Array.isArray(data)
        ? data
        : data.tasks || data.entries || [];

      // Transform backend data to frontend format
      return tasksArray.map(transformTaskData);
    },
    staleTime: 30000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async (
      taskData: Omit<Task, "id" | "createdAt" | "updatedAt">,
    ) => {
      const response = await apiFetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create task");
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch tasks
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast.error(`Create failed: ${error.message}`);
    },
  });

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Task>;
    }) => {
      const response = await apiFetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update task");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast.error(`Update failed: ${error.message}`);
    },
  });

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiFetch(`/api/tasks/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to delete task");
      }

      return;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast.error(`Delete failed: ${error.message}`);
    },
  });

  // Update task status mutation (specialized for status changes)
  const updateTaskStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const response = await apiFetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update task status");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast.error(`Status update failed: ${error.message}`);
    },
  });

  // Helper functions
  const createTask = useCallback(
    (taskData: Omit<Task, "id" | "createdAt" | "updatedAt">) => {
      return createTaskMutation.mutateAsync(taskData);
    },
    [createTaskMutation],
  );

  const updateTask = useCallback(
    (id: string, updates: Partial<Task>) => {
      return updateTaskMutation.mutateAsync({ id, updates });
    },
    [updateTaskMutation],
  );

  const updateTaskStatus = useCallback(
    (id: string, status: TaskStatus) => {
      return updateTaskStatusMutation.mutateAsync({ id, status });
    },
    [updateTaskStatusMutation],
  );

  const deleteTask = useCallback(
    (id: string) => {
      return deleteTaskMutation.mutateAsync(id);
    },
    [deleteTaskMutation],
  );

  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  return {
    // Data
    tasks,

    // States
    isLoading,
    error,

    // Actions
    createTask,
    updateTask,
    updateTaskStatus,
    deleteTask,
    refresh,

    // Mutation states
    isCreating: createTaskMutation.isPending,
    isUpdating:
      updateTaskMutation.isPending || updateTaskStatusMutation.isPending,
    isDeleting: deleteTaskMutation.isPending,
  };
}

/**
 * Hook for a single task by ID
 */
export function useTask(id: string) {
  const queryKey = ["tasks", id];

  const {
    data: task,
    isLoading,
    error,
    refetch,
  } = useQuery<Task>({
    queryKey,
    queryFn: async () => {
      const response = await apiFetch(`/api/tasks/${id}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to load task");
      }

      const data = await response.json();
      return transformTaskData(data);
    },
    enabled: !!id,
    staleTime: 30000, // 30 seconds
  });

  return {
    task,
    isLoading,
    error,
    refresh: refetch,
  };
}
