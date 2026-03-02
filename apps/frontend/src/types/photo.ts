import type { Photo as ApiPhoto } from "@eclaire/api-types";

// Extend the API Photo type, excluding storage-internal fields the frontend doesn't use
export interface Photo
  extends Omit<
    ApiPhoto,
    "storageId" | "thumbnailStorageId" | "convertedJpgStorageId"
  > {
  originalUrl: string;
  convertedJpgUrl: string | null;
}

// Frontend-only types

export interface EditPhotoState {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  deviceId: string | null;
}

export interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
  photoId?: string;
}
