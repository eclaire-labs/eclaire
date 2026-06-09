/**
 * Task comments hook built on TanStack Query.
 *
 * Mutations update the cached comment list directly and show an error toast on
 * failure; success toasts stay at call sites.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createTaskComment,
  deleteTaskComment,
  getTaskComments,
  updateTaskComment,
} from "@/lib/api-comments";
import type { TaskComment } from "@/types/task";

export function useTaskComments(
  taskId: string,
  options: {
    /** Comments already loaded with the task; avoids a duplicate fetch. */
    initialComments?: TaskComment[];
  } = {},
) {
  const queryClient = useQueryClient();
  const queryKey = ["task-comments", taskId] as const;

  const {
    data: comments = [],
    isLoading,
    error,
    refetch,
  } = useQuery<TaskComment[]>({
    queryKey,
    queryFn: () => getTaskComments(taskId),
    enabled: !!taskId,
    initialData: options.initialComments,
    staleTime: 30_000,
  });

  const setComments = (updater: (prev: TaskComment[]) => TaskComment[]) =>
    queryClient.setQueryData<TaskComment[]>(queryKey, (prev) =>
      updater(prev ?? []),
    );

  const addMutation = useMutation({
    mutationFn: (content: string) => createTaskComment(taskId, content),
    onSuccess: (comment) => setComments((prev) => [comment, ...prev]), // Add to top
    onError: (error: Error) =>
      toast.error(`Failed to add comment: ${error.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      commentId,
      content,
    }: {
      commentId: string;
      content: string;
    }) => updateTaskComment(taskId, commentId, content),
    onSuccess: (updated) =>
      setComments((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      ),
    onError: (error: Error) =>
      toast.error(`Failed to update comment: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (commentId: string) => deleteTaskComment(taskId, commentId),
    onSuccess: (_data, commentId) =>
      setComments((prev) => prev.filter((c) => c.id !== commentId)),
    onError: (error: Error) =>
      toast.error(`Failed to delete comment: ${error.message}`),
  });

  return {
    comments,
    isLoading,
    error,
    refresh: refetch,
    addComment: addMutation.mutateAsync,
    updateComment: (commentId: string, content: string) =>
      updateMutation.mutateAsync({ commentId, content }),
    deleteComment: deleteMutation.mutateAsync,
    isAddingComment: addMutation.isPending,
    isUpdatingComment: updateMutation.isPending,
    isDeletingComment: deleteMutation.isPending,
  };
}
