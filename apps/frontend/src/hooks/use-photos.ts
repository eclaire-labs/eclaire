import { getAbsoluteApiUrl } from "@/lib/api-client";
import type { Photo } from "@/types/photo";
import { createCrudHooks } from "./create-crud-hooks";

// biome-ignore lint/suspicious/noExplicitAny: backend API response shape is not statically typed
const transformPhotoData = (raw: any): Photo => ({
  id: raw.id,
  title: raw.title,
  description: raw.description,
  originalFilename: raw.originalFilename,
  deviceId: raw.deviceId,
  mimeType: raw.mimeType,
  fileSize: raw.fileSize,
  tags: raw.tags || [],
  imageUrl: raw.imageUrl ? getAbsoluteApiUrl(raw.imageUrl) : "",
  thumbnailUrl: raw.thumbnailUrl ? getAbsoluteApiUrl(raw.thumbnailUrl) : null,
  imageWidth: raw.imageWidth,
  imageHeight: raw.imageHeight,
  dateTaken: raw.dateTaken,
  cameraMake: raw.cameraMake,
  cameraModel: raw.cameraModel,
  lensModel: raw.lensModel,
  fNumber: raw.fNumber,
  exposureTime: raw.exposureTime,
  iso: raw.iso,
  orientation: raw.orientation,
  latitude: raw.latitude,
  longitude: raw.longitude,
  altitude: raw.altitude,
  locationCity: raw.locationCity,
  locationCountryIso2: raw.locationCountryIso2,
  locationCountryName: raw.locationCountryName,
  photoType: raw.photoType || null,
  ocrText: raw.ocrText || null,
  dominantColors: raw.dominantColors || null,
  processingStatus: raw.processingStatus || null,
  createdAt: raw.createdAt || new Date().toISOString(),
  updatedAt: raw.updatedAt || new Date().toISOString(),
  dueDate: raw.dueDate || null,
  originalUrl: raw.originalUrl ? getAbsoluteApiUrl(raw.originalUrl) : "",
  convertedJpgUrl: raw.convertedJpgUrl
    ? getAbsoluteApiUrl(raw.convertedJpgUrl)
    : null,
  isOriginalViewable: raw.isOriginalViewable,
  reviewStatus: raw.reviewStatus || "pending",
  flagColor: raw.flagColor || null,
  isPinned: raw.isPinned || false,
  enabled: raw.enabled ?? true,
});

const { useList, useSingle } = createCrudHooks<Photo>({
  resourceName: "photos",
  apiPath: "/api/photos",
  transform: transformPhotoData,
});

export function usePhotos() {
  const { items: photos, createItem, updateItem, deleteItem, ...rest } =
    useList();

  return {
    photos,
    ...rest,
    createPhoto: (formData: FormData) => createItem(formData),
    updatePhoto: updateItem,
    deletePhoto: deleteItem,
  };
}

export function usePhoto(id: string) {
  const { item: photo, ...rest } = useSingle(id);
  return { photo, ...rest };
}
