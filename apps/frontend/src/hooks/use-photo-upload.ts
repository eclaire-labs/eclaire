import { nanoid } from "nanoid";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { UploadingFile } from "@/components/shared/UploadProgressList";
import { apiFetch } from "@/lib/api-client";
import type { Photo } from "@/types/photo";

// ---------------------------------------------------------------------------
// Upload constants
// ---------------------------------------------------------------------------

export const MAX_FILE_SIZE_MB = 25;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const ALLOWED_UPLOAD_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
  "image/avif": [".avif"],
  "image/svg+xml": [".svg"],
  "image/tiff": [".tiff", ".tif"],
  "image/bmp": [".bmp"],
};

interface UsePhotoUploadOptions {
  /** Called after each successful upload to refresh the photo list. */
  refresh: () => void;
}

/**
 * Photo upload handling: tracks per-file upload progress state and POSTs
 * each file (with metadata) to /api/photos.
 */
export function usePhotoUpload({ refresh }: UsePhotoUploadOptions) {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);

  const handleUpload = useCallback(
    async (acceptedFiles: File[]) => {
      const newUploads: UploadingFile[] = acceptedFiles.map((file) => ({
        id: nanoid(),
        file,
        progress: 0,
        status: "pending",
      }));

      setUploadingFiles((prev) => [...newUploads, ...prev]);

      for (const upload of newUploads) {
        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.id === upload.id ? { ...f, status: "uploading" } : f,
          ),
        );

        const formData = new FormData();
        const metadata = {
          title: upload.file.name.replace(/\.[^/.]+$/, ""),
          description: "",
          tags: [],
          originalFilename: upload.file.name,
        };
        formData.append("metadata", JSON.stringify(metadata));
        formData.append("content", upload.file);

        try {
          setUploadingFiles((prev) =>
            prev.map((f) => (f.id === upload.id ? { ...f, progress: 50 } : f)),
          );

          const response = await apiFetch("/api/photos", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response
              .json()
              .catch(() => ({ error: `Upload failed (${response.status})` }));
            throw new Error(
              errorData.error || `Failed to upload ${upload.file.name}`,
            );
          }

          const createdPhoto = (await response.json()) as Photo;
          refresh();

          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.id === upload.id
                ? {
                    ...f,
                    status: "success",
                    progress: 100,
                    photoId: createdPhoto.id,
                  }
                : f,
            ),
          );

          toast.success("Upload Successful", {
            description: `"${createdPhoto.title}" added.`,
          });
        } catch (err) {
          console.error("Error uploading file:", upload.file.name, err);
          const message =
            err instanceof Error ? err.message : "An unknown error occurred.";
          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.id === upload.id
                ? { ...f, status: "error", error: message, progress: 0 }
                : f,
            ),
          );
          toast.error("Upload Error", {
            description: `Failed to upload ${upload.file.name}: ${message}`,
          });
        }
      }
    },
    [refresh],
  );

  /** Remove completed (success or error) uploads from the progress list. */
  const clearCompleted = useCallback(() => {
    setUploadingFiles((prev) =>
      prev.filter((f) => f.status !== "success" && f.status !== "error"),
    );
  }, []);

  return { uploadingFiles, handleUpload, clearCompleted };
}
