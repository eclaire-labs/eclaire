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
  description: raw.description ?? null,
  prompt: raw.prompt ?? null,

  // Assignment
  delegateActorId: raw.delegateActorId ?? null,
  delegateMode: raw.delegateMode || "manual",
  delegatedByActorId: raw.delegatedByActorId ?? null,

  // Status
  taskStatus: raw.taskStatus || "open",
  attentionStatus: raw.attentionStatus || "none",
  reviewStatus: raw.reviewStatus || "none",

  // Schedule
  scheduleType: raw.scheduleType || "none",
  scheduleRule: raw.scheduleRule ?? null,
  scheduleSummary: raw.scheduleSummary ?? null,
  timezone: raw.timezone ?? null,
  nextOccurrenceAt: raw.nextOccurrenceAt ?? null,
  maxOccurrences: raw.maxOccurrences ?? null,
  occurrenceCount: raw.occurrenceCount ?? 0,

  // Denormalized execution
  latestExecutionStatus: raw.latestExecutionStatus ?? null,
  latestResultSummary: raw.latestResultSummary ?? null,
  latestErrorSummary: raw.latestErrorSummary ?? null,

  // Delivery
  deliveryTargets: raw.deliveryTargets ?? null,
  sourceConversationId: raw.sourceConversationId ?? null,

  // Scheduling & organization
  dueAt: raw.dueAt ?? null,
  priority: raw.priority ?? 0,
  parentId: raw.parentId ?? null,
  childCount: raw.childCount ?? 0,
  flagColor: raw.flagColor ?? null,
  isPinned: raw.isPinned || false,
  sortOrder: raw.sortOrder ?? null,
  tags: raw.tags || [],

  // Processing
  processingEnabled: raw.processingEnabled ?? true,
  processingStatus: raw.processingStatus ?? null,

  // Lifecycle
  completedAt: raw.completedAt ?? null,
  createdAt: raw.createdAt || new Date().toISOString(),
  updatedAt: raw.updatedAt || new Date().toISOString(),

  // Relations
  comments: raw.comments ?? undefined,
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
        body: JSON.stringify({ taskStatus: status }),
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
