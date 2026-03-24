import type { Media as ApiMedia } from "@eclaire/api-types";

export interface Media
  extends Omit<ApiMedia, "storageId" | "thumbnailStorageId"> {
  mediaUrl: string;
}

export interface EditMediaState {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
}

export interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
  mediaId?: string;
}
