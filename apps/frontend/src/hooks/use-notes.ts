import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import type { Note } from "@/types/note";
import { createCrudHooks, type ListParams } from "./create-crud-hooks";

// biome-ignore lint/suspicious/noExplicitAny: backend API response shape is not statically typed
export const transformNoteData = (raw: any): Note => ({
  id: raw.id,
  title: raw.title,
  content: raw.content,
  description: raw.description || null,
  dueDate: raw.dueDate,
  tags: raw.tags || [],
  userId: raw.userId || "",
  rawMetadata: raw.rawMetadata || null,
  originalMimeType: raw.originalMimeType || null,
  userAgent: raw.userAgent || null,
  createdAt: raw.createdAt || new Date().toISOString(),
  updatedAt: raw.updatedAt || new Date().toISOString(),
  processingStatus: raw.processingStatus || null,
  reviewStatus: raw.reviewStatus || "pending",
  flagColor: raw.flagColor || null,
  isPinned: raw.isPinned || false,
  enabled: raw.enabled ?? true,
});

const { useList, useSingle } = createCrudHooks<Note>({
  resourceName: "notes",
  apiPath: "/api/notes",
  transform: transformNoteData,
  updateMethod: "PUT",
});

export function useNotes(params: ListParams = {}) {
  const {
    items: notes,
    queryKey,
    queryClient,
    createItem,
    updateItem,
    deleteItem,
    ...rest
  } = useList(params);

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await apiFetch("/api/notes/upload", {
        method: "POST",
        body: formData,
      });
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error: Error) => toast.error(`Upload failed: ${error.message}`),
  });

  return {
    notes,
    ...rest,
    createNote: (data: {
      title: string;
      content: string;
      dueDate?: string | null;
      tags: string[];
    }) => createItem(data),
    updateNote: updateItem,
    deleteNote: deleteItem,
    uploadNote: (formData: FormData) => uploadMutation.mutateAsync(formData),
    isUploading: uploadMutation.isPending,
  };
}

export function useNote(id: string) {
  const { item: note, ...rest } = useSingle(id);
  return { note, ...rest };
}
