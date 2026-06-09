/**
 * Inbox hooks: full inbox contents, the lightweight badge count, and the
 * approve / retry / cancel task actions used from the inbox.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiFetch } from "@/lib/api-client";
import { useSSEConnectionStatus } from "@/providers/ProcessingEventsProvider";
import type { InboxResponse } from "@/types/task";

/** Full inbox payload (sections + counts) for the Inbox page. */
export function useInbox() {
  const { isConnected } = useSSEConnectionStatus();
  return useQuery<InboxResponse>({
    queryKey: ["inbox"],
    queryFn: async () => {
      const res = await apiFetch("/api/tasks/inbox");
      if (!res.ok) throw new Error("Failed to fetch inbox");
      return res.json();
    },
    // Only poll when SSE is disconnected; SSE invalidation handles the live case
    refetchInterval: isConnected ? false : 30_000,
  });
}

/** Lightweight inbox count for the sidebar badge. */
export function useInboxCount() {
  const { isConnected } = useSSEConnectionStatus();
  return useQuery<{ totalCount: number }>({
    queryKey: ["inbox-count"],
    queryFn: async () => {
      const res = await apiFetch("/api/tasks/inbox");
      if (!res.ok) return { totalCount: 0 };
      const data = await res.json();
      return { totalCount: data.totalCount ?? 0 };
    },
    refetchInterval: isConnected ? false : 30_000,
    staleTime: 10_000,
  });
}

/** Run an inbox task action (approve / retry / cancel / …) and refresh inbox state. */
export function useInboxTaskAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      taskId,
      action,
      body,
    }: {
      taskId: string;
      action: string;
      body?: Record<string, unknown>;
    }) => {
      const res = await apiFetch(`/api/tasks/${taskId}/${action}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(`Failed to ${action}`);
      return res.json();
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inbox"] }),
        queryClient.invalidateQueries({ queryKey: ["inbox-count"] }),
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
