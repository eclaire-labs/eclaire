/**
 * React Query hooks for scheduled actions.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  cancelScheduledAction,
  deleteScheduledAction,
  getScheduledAction,
  getScheduledActionExecutions,
  listScheduledActions,
} from "@/lib/api-scheduled-actions";

const QUERY_KEY = "scheduled-actions";

export function useScheduledActions(params?: {
  status?: string;
  kind?: string;
  relatedTaskId?: string;
}) {
  return useQuery({
    queryKey: [QUERY_KEY, params],
    queryFn: () => listScheduledActions(params),
    select: (data) => data.data,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

export function useScheduledAction(id: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: () => getScheduledAction(id as string),
    enabled: !!id,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

export function useScheduledActionExecutions(id: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, id, "executions"],
    queryFn: () => getScheduledActionExecutions(id as string),
    select: (data) => data.data,
    enabled: !!id,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

export function useCancelScheduledAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cancelScheduledAction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success("Scheduled action cancelled");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to cancel");
    },
  });
}

export function useDeleteScheduledAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteScheduledAction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success("Scheduled action deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete");
    },
  });
}
