import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch, apiGet } from "@/lib/api-client";

export interface TaskSeriesItem {
  id: string;
  userId: string;
  status: "active" | "paused" | "completed" | "cancelled";
  title: string;
  description: string | null;
  defaultAssigneeActorId: string | null;
  executionPolicy: "assign_only" | "assign_and_run";
  cronExpression: string;
  timezone: string | null;
  startAt: string | null;
  endAt: string | null;
  maxOccurrences: number | null;
  occurrenceCount: number;
  lastOccurrenceAt: string | null;
  nextOccurrenceAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const QUERY_KEY = "task-series";

export function useTaskSeriesList(params?: { status?: string }) {
  return useQuery<{ data: TaskSeriesItem[] }>({
    queryKey: [QUERY_KEY, params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params?.status) searchParams.set("status", params.status);
      const qs = searchParams.toString();
      const url = qs ? `/api/task-series?${qs}` : "/api/task-series";
      const res = await apiGet(url);
      return res.json();
    },
    staleTime: 30_000,
  });
}

export function useTaskSeriesDetail(id: string | undefined) {
  return useQuery<TaskSeriesItem>({
    queryKey: [QUERY_KEY, id],
    queryFn: async () => {
      const res = await apiGet(`/api/task-series/${id}`);
      return res.json();
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function usePauseTaskSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(`/api/task-series/${id}/pause`, { method: "POST" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success("Task series paused");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to pause"),
  });
}

export function useResumeTaskSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(`/api/task-series/${id}/resume`, { method: "POST" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success("Task series resumed");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to resume"),
  });
}

export function useDeleteTaskSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(`/api/task-series/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success("Task series deleted");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to delete"),
  });
}
