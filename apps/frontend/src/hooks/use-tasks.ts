import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import type { Task, TaskStatus } from "@/types/task";
import { createCrudHooks, type ListParams } from "./create-crud-hooks";

// biome-ignore lint/suspicious/noExplicitAny: backend API response shape is not statically typed
export const transformTaskData = (raw: any): Task => ({
  id: raw.id,
  userId: raw.userId || "",
  title: raw.title,
  description: raw.description,
  status: raw.status,
  dueDate: raw.dueDate,
  assignedToId: raw.assignedToId,
  tags: raw.tags || [],
  createdAt: raw.createdAt || new Date().toISOString(),
  updatedAt: raw.updatedAt || new Date().toISOString(),
  processingStatus: raw.processingStatus || null,
  reviewStatus: raw.reviewStatus || "pending",
  flagColor: raw.flagColor || null,
  isPinned: raw.isPinned || false,
  processingEnabled: raw.processingEnabled ?? true,
  priority: raw.priority ?? 0,
  parentId: raw.parentId ?? null,
  sortOrder: raw.sortOrder ?? null,
  isRecurring: raw.isRecurring || false,
  cronExpression: raw.cronExpression || null,
  recurrenceEndDate: raw.recurrenceEndDate || null,
  recurrenceLimit: raw.recurrenceLimit || null,
  runImmediately: raw.runImmediately || false,
  nextRunAt: raw.nextRunAt || null,
  lastRunAt: raw.lastRunAt || null,
  completedAt: raw.completedAt || null,
  comments: raw.comments || undefined,
});

const { useList, useSingle } = createCrudHooks<Task>({
  resourceName: "tasks",
  apiPath: "/api/tasks",
  transform: transformTaskData,
});

export function useTasks(params: ListParams = {}) {
  const {
    items: tasks,
    queryKey,
    queryClient,
    createItem,
    updateItem,
    deleteItem,
    isUpdating,
    ...rest
  } = useList(params);

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const response = await apiFetch(`/api/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error: Error) =>
      toast.error(`Status update failed: ${error.message}`),
  });

  return {
    tasks,
    ...rest,
    createTask: (data: Omit<Task, "id" | "createdAt" | "updatedAt">) =>
      createItem(data),
    updateTask: updateItem,
    updateTaskStatus: (id: string, status: TaskStatus) =>
      statusMutation.mutateAsync({ id, status }),
    deleteTask: deleteItem,
    isUpdating: isUpdating || statusMutation.isPending,
  };
}

export function useTask(id: string) {
  const { item: task, ...rest } = useSingle(id);
  return { task, ...rest };
}
