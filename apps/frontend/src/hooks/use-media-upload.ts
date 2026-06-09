import { nanoid } from "nanoid";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { UploadingFile } from "@/components/shared/UploadProgressList";
import { apiFetch } from "@/lib/api-client";
import type { Media } from "@/types/media";

// ---------------------------------------------------------------------------
// Upload constants
// ---------------------------------------------------------------------------

export const MAX_FILE_SIZE_MB = 500;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const ALLOWED_UPLOAD_TYPES = {
  // Audio
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "audio/flac": [".flac"],
  "audio/ogg": [".ogg"],
  "audio/aac": [".aac"],
  "audio/mp4": [".m4a"],
  "audio/x-m4a": [".m4a"],
  "audio/webm": [".webm"],
  "audio/aiff": [".aiff", ".aif"],
  // Video
  "video/mp4": [".mp4"],
  "video/quicktime": [".mov"],
  "video/x-msvideo": [".avi"],
  "video/x-matroska": [".mkv"],
  "video/webm": [".webm"],
  "video/ogg": [".ogv"],
  "video/mpeg": [".mpeg", ".mpg"],
};

interface UseMediaUploadOptions {
  /** Called after each successful upload to refresh the media list. */
  refresh: () => void;
}

/**
 * Media upload handling: tracks per-file upload progress state and POSTs
 * each file (with metadata) to /api/media.
 */
export function useMediaUpload({ refresh }: UseMediaUploadOptions) {
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

          const response = await apiFetch("/api/media", {
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

          const createdMedia = (await response.json()) as Media;
          refresh();

          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.id === upload.id
                ? {
                    ...f,
                    status: "success",
                    progress: 100,
                    mediaId: createdMedia.id,
                  }
                : f,
            ),
          );

          toast.success("Upload Successful", {
            description: `"${createdMedia.title}" added.`,
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
