/**
 * Eclaire-specific queue name constants used by both backend and workers
 */

export const QueueNames = {
  BOOKMARK_PROCESSING: "bookmark-processing",
  IMAGE_PROCESSING: "image-processing",
  DOCUMENT_PROCESSING: "document-processing",
  NOTE_PROCESSING: "note-processing",
  TASK_PROCESSING: "task-processing",
  MEDIA_PROCESSING: "media-processing",
  TASK_OCCURRENCE: "task-occurrence",
  TASK_SCHEDULE_TICK: "task-schedule-tick",
  TASK_OVERDUE_CHECKER: "task-overdue-checker",
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];
