import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { apiFetch, getAbsoluteApiUrl } from "@/lib/frontend-api";
import type { Photo } from "@/types/photo";

// Transform backend photo data to frontend format
// biome-ignore lint/suspicious/noExplicitAny: backend API response shape is not statically typed
const transformPhotoData = (backendPhoto: any): Photo => {
  return {
    id: backendPhoto.id,
    title: backendPhoto.title,
    description: backendPhoto.description,
    originalFilename: backendPhoto.originalFilename,
    deviceId: backendPhoto.deviceId,
    mimeType: backendPhoto.mimeType,
    fileSize: backendPhoto.fileSize,
    tags: backendPhoto.tags || [],
    // Computed URLs for assets
    imageUrl: backendPhoto.imageUrl
      ? getAbsoluteApiUrl(backendPhoto.imageUrl)
      : "",
    thumbnailUrl: backendPhoto.thumbnailUrl
      ? getAbsoluteApiUrl(backendPhoto.thumbnailUrl)
      : null,
    // Image dimensions
    imageWidth: backendPhoto.imageWidth,
    imageHeight: backendPhoto.imageHeight,
    // EXIF data
    dateTaken: backendPhoto.dateTaken,
    cameraMake: backendPhoto.cameraMake,
    cameraModel: backendPhoto.cameraModel,
    lensModel: backendPhoto.lensModel,
    fNumber: backendPhoto.fNumber,
    exposureTime: backendPhoto.exposureTime,
    iso: backendPhoto.iso,
    orientation: backendPhoto.orientation,
    // Location data
    latitude: backendPhoto.latitude,
    longitude: backendPhoto.longitude,
    altitude: backendPhoto.altitude,
    locationCity: backendPhoto.locationCity,
    locationCountryIso2: backendPhoto.locationCountryIso2,
    locationCountryName: backendPhoto.locationCountryName,
    // AI Generated Data
    photoType: backendPhoto.photoType || null,
    ocrText: backendPhoto.ocrText || null,
    dominantColors: backendPhoto.dominantColors || null,
    // Processing status (unified from backend)
    processingStatus: backendPhoto.processingStatus || null,
    // Timestamps (backend returns ISO strings)
    createdAt: backendPhoto.createdAt || new Date().toISOString(),
    updatedAt: backendPhoto.updatedAt || new Date().toISOString(),
    dueDate: backendPhoto.dueDate || null,
    // URLs
    originalUrl: backendPhoto.originalUrl
      ? getAbsoluteApiUrl(backendPhoto.originalUrl)
      : "",
    convertedJpgUrl: backendPhoto.convertedJpgUrl
      ? getAbsoluteApiUrl(backendPhoto.convertedJpgUrl)
      : null,
    isOriginalViewable: backendPhoto.isOriginalViewable,
    // Review, flagging, and pinning
    reviewStatus: backendPhoto.reviewStatus || "pending",
    flagColor: backendPhoto.flagColor || null,
    isPinned: backendPhoto.isPinned || false,
    enabled: backendPhoto.enabled ?? true,
  };
};

/**
 * React Query hook for photos data fetching and management
 */
export function usePhotos() {
  const queryClient = useQueryClient();

  const queryKey = ["photos"];

  // Main photos query
  const {
    data: photos = [],
    isLoading,
    error,
    refetch,
  } = useQuery<Photo[]>({
    queryKey,
    queryFn: async () => {
      // Call API without pagination to get all photos
      const response = await apiFetch("/api/photos?limit=9999");

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to load photos");
      }

      const data = await response.json();

      // Handle different response structures - ensure we always get an array
      const photosArray = Array.isArray(data)
        ? data
        : data.photos || data.entries || [];

      // Transform backend data to frontend format
      return photosArray.map(transformPhotoData);
    },
    staleTime: 30000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  // Create photo mutation
  const createPhotoMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await apiFetch("/api/photos", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to upload photo");
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch photos
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast.error(`Upload failed: ${error.message}`);
    },
  });

  // Update photo mutation
  const updatePhotoMutation = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Photo>;
    }) => {
      const response = await apiFetch(`/api/photos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update photo");
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

  // Delete photo mutation
  const deletePhotoMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiFetch(`/api/photos/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to delete photo");
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
  const createPhoto = useCallback(
    (formData: FormData) => {
      return createPhotoMutation.mutateAsync(formData);
    },
    [createPhotoMutation],
  );

  const updatePhoto = useCallback(
    (id: string, updates: Partial<Photo>) => {
      return updatePhotoMutation.mutateAsync({ id, updates });
    },
    [updatePhotoMutation],
  );

  const deletePhoto = useCallback(
    (id: string) => {
      return deletePhotoMutation.mutateAsync(id);
    },
    [deletePhotoMutation],
  );

  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  return {
    // Data
    photos,

    // States
    isLoading,
    error,

    // Actions
    createPhoto,
    updatePhoto,
    deletePhoto,
    refresh,

    // Mutation states
    isCreating: createPhotoMutation.isPending,
    isUpdating: updatePhotoMutation.isPending,
    isDeleting: deletePhotoMutation.isPending,
  };
}

/**
 * Hook for a single photo by ID
 */
export function usePhoto(id: string) {
  const queryKey = ["photos", id];

  const {
    data: photo,
    isLoading,
    error,
    refetch,
  } = useQuery<Photo>({
    queryKey,
    queryFn: async () => {
      const response = await apiFetch(`/api/photos/${id}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to load photo");
      }

      const data = await response.json();
      return transformPhotoData(data);
    },
    enabled: !!id,
    staleTime: 30000, // 30 seconds
  });

  return {
    photo,
    isLoading,
    error,
    refresh: refetch,
  };
}
