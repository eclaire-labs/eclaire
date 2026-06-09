import { nanoid } from "nanoid";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { UploadingFile } from "@/components/shared/UploadProgressList";
import { apiFetch } from "@/lib/api-client";
import type { Document } from "@/types/document";

// ---------------------------------------------------------------------------
// Upload constants
// ---------------------------------------------------------------------------

export const MAX_FILE_SIZE_MB = 50;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const ALLOWED_UPLOAD_TYPES = {
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    ".pptx",
  ],
  "text/plain": [".txt"],
  "text/rtf": [".rtf"],
  "application/rtf": [".rtf"],
  "text/markdown": [".md"],
  "text/html": [".html", ".htm"],
  "text/csv": [".csv"],
  "application/json": [".json"],
  "application/xml": [".xml"],
  "application/vnd.apple.pages": [".pages"],
  "application/vnd.apple.numbers": [".numbers"],
  "application/vnd.apple.keynote": [".keynote"],
};

export interface DocumentUploadingFile extends UploadingFile {
  documentId?: string;
}

interface UseDocumentUploadOptions {
  /** Called after each successful upload to refresh the document list. */
  refresh: () => void;
}

/**
 * Document upload handling: tracks per-file upload progress state and POSTs
 * each file (with metadata) to /api/documents.
 */
export function useDocumentUpload({ refresh }: UseDocumentUploadOptions) {
  const [uploadingFiles, setUploadingFiles] = useState<DocumentUploadingFile[]>(
    [],
  );

  const handleUpload = useCallback(
    async (acceptedFiles: File[]) => {
      const newUploads: DocumentUploadingFile[] = acceptedFiles.map((file) => ({
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
            prev.map((f) => (f.id === upload.id ? { ...f, progress: 30 } : f)),
          );

          const response = await apiFetch("/api/documents", {
            method: "POST",
            body: formData,
          });

          setUploadingFiles((prev) =>
            prev.map((f) => (f.id === upload.id ? { ...f, progress: 70 } : f)),
          );

          if (!response.ok) {
            const errorData = await response
              .json()
              .catch(() => ({ error: `Upload failed (${response.status})` }));
            throw new Error(
              errorData.error || `Failed to upload ${upload.file.name}`,
            );
          }

          const createdDocument = (await response.json()) as Document;

          refresh();

          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.id === upload.id
                ? {
                    ...f,
                    status: "success",
                    progress: 100,
                    documentId: createdDocument.id,
                  }
                : f,
            ),
          );

          toast.success("Upload Successful", {
            description: `"${createdDocument.title}" added.`,
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
