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
  SCHEDULED_ACTION_EXECUTION: "scheduled-action-execution",
  AGENT_RUN: "agent-run",
  TASK_SERIES_TICK: "task-series-tick",
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];
