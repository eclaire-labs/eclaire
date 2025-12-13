/**
 * Shared queue name constants used by both backend and workers
 */

export const QueueNames = {
  BOOKMARK_PROCESSING: "bookmark-processing",
  IMAGE_PROCESSING: "image-processing",
  DOCUMENT_PROCESSING: "document-processing",
  NOTE_PROCESSING: "note-processing",
  TASK_PROCESSING: "task-processing",
  TASK_EXECUTION_PROCESSING: "task-execution-processing",
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];
