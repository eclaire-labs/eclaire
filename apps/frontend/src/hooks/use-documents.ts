import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { apiFetch, getAbsoluteApiUrl } from "@/lib/frontend-api";
import type { Document } from "@/types/document";

// Transform backend document data to frontend format
const transformDocumentData = (backendDoc: any): Document => {
  return {
    id: backendDoc.id,
    userId: backendDoc.userId || "",
    title: backendDoc.title,
    description: backendDoc.description,
    originalFilename: backendDoc.originalFilename,
    dueDate: backendDoc.dueDate,
    mimeType: backendDoc.mimeType,
    fileSize: backendDoc.fileSize,
    rawMetadata: backendDoc.rawMetadata,
    originalMimeType: backendDoc.originalMimeType,
    tags: backendDoc.tags || [],
    // Computed URLs for assets
    fileUrl: backendDoc.fileUrl ? getAbsoluteApiUrl(backendDoc.fileUrl) : null,
    thumbnailUrl: backendDoc.thumbnailUrl
      ? getAbsoluteApiUrl(backendDoc.thumbnailUrl)
      : null,
    screenshotUrl: backendDoc.screenshotUrl
      ? getAbsoluteApiUrl(backendDoc.screenshotUrl)
      : null,
    pdfUrl: backendDoc.pdfUrl ? getAbsoluteApiUrl(backendDoc.pdfUrl) : null,
    contentUrl: backendDoc.contentUrl
      ? getAbsoluteApiUrl(backendDoc.contentUrl)
      : null,
    extractedText: backendDoc.extractedText,
    // Processing status (unified from backend)
    processingStatus: backendDoc.processingStatus || null,
    // Timestamps (backend returns ISO strings)
    createdAt: backendDoc.createdAt || new Date().toISOString(),
    updatedAt: backendDoc.updatedAt || new Date().toISOString(),
    // Review, flagging, and pinning
    reviewStatus: backendDoc.reviewStatus || "pending",
    flagColor: backendDoc.flagColor || null,
    isPinned: backendDoc.isPinned || false,
    enabled: backendDoc.enabled ?? true,
  };
};

/**
 * React Query hook for documents data fetching and management
 */
export function useDocuments() {
  const queryClient = useQueryClient();

  const queryKey = ["documents"];

  // Main documents query
  const {
    data: documents = [],
    isLoading,
    error,
    refetch,
  } = useQuery<Document[]>({
    queryKey,
    queryFn: async () => {
      const response = await apiFetch("/api/documents?limit=9999");

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to load documents");
      }

      const data = await response.json();

      // Handle different response structures - ensure we always get an array
      const documentsArray = Array.isArray(data)
        ? data
        : data.documents || data.entries || [];

      // Transform backend data to frontend format
      return documentsArray.map(transformDocumentData);
    },
    staleTime: 30000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  // Create document mutation
  const createDocumentMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await apiFetch("/api/documents", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to upload document");
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch documents
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast.error(`Upload failed: ${error.message}`);
    },
  });

  // Update document mutation
  const updateDocumentMutation = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Document>;
    }) => {
      const response = await apiFetch(`/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update document");
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

  // Delete document mutation
  const deleteDocumentMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiFetch(`/api/documents/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to delete document");
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

  // Helper functions
  const createDocument = useCallback(
    (formData: FormData) => {
      return createDocumentMutation.mutateAsync(formData);
    },
    [createDocumentMutation],
  );

  const updateDocument = useCallback(
    (id: string, updates: Partial<Document>) => {
      return updateDocumentMutation.mutateAsync({ id, updates });
    },
    [updateDocumentMutation],
  );

  const deleteDocument = useCallback(
    (id: string) => {
      return deleteDocumentMutation.mutateAsync(id);
    },
    [deleteDocumentMutation],
  );

  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  return {
    // Data
    documents,

    // States
    isLoading,
    error,

    // Actions
    createDocument,
    updateDocument,
    deleteDocument,
    refresh,

    // Mutation states
    isCreating: createDocumentMutation.isPending,
    isUpdating: updateDocumentMutation.isPending,
    isDeleting: deleteDocumentMutation.isPending,
  };
}

/**
 * Hook for a single document by ID
 */
export function useDocument(id: string) {
  const queryKey = ["documents", id];

  const {
    data: document,
    isLoading,
    error,
    refetch,
  } = useQuery<Document>({
    queryKey,
    queryFn: async () => {
      const response = await apiFetch(`/api/documents/${id}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to load document");
      }

      const data = await response.json();
      return transformDocumentData(data);
    },
    enabled: !!id,
    staleTime: 30000, // 30 seconds
  });

  return {
    document,
    isLoading,
    error,
    refresh: refetch,
  };
}
