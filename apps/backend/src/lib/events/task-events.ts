/**
 * Task SSE Event Publishers
 *
 * Typed helpers for publishing task and occurrence events through the
 * existing SSE stream (processing-events). Each function wraps
 * `publishProcessingEvent` with a specific event type and payload.
 */

import { publishProcessingEvent } from "../../routes/processing-events.js";

// ── Task lifecycle events (emitted from route handlers) ──────────────

export function emitTaskCreated(userId: string, taskId: string) {
  return publishProcessingEvent(userId, { type: "task_created", taskId });
}

export function emitTaskUpdated(userId: string, taskId: string) {
  return publishProcessingEvent(userId, { type: "task_updated", taskId });
}

export function emitTaskDeleted(userId: string, taskId: string) {
  return publishProcessingEvent(userId, { type: "task_deleted", taskId });
}

export function emitTaskStatusChanged(
  userId: string,
  taskId: string,
  fields?: { taskStatus?: string; attentionStatus?: string },
) {
  return publishProcessingEvent(userId, {
    type: "task_status_changed",
    taskId,
    ...fields,
  });
}

// ── Occurrence lifecycle events (emitted from workers + route handlers) ──

export function emitOccurrenceQueued(
  userId: string,
  taskId: string,
  occurrenceId: string,
) {
  return publishProcessingEvent(userId, {
    type: "occurrence_queued",
    taskId,
    occurrenceId,
  });
}

export function emitOccurrenceStarted(
  userId: string,
  taskId: string,
  occurrenceId: string,
) {
  return publishProcessingEvent(userId, {
    type: "occurrence_started",
    taskId,
    occurrenceId,
  });
}

export function emitOccurrenceCompleted(
  userId: string,
  taskId: string,
  occurrenceId: string,
  resultSummary?: string,
) {
  return publishProcessingEvent(userId, {
    type: "occurrence_completed",
    taskId,
    occurrenceId,
    resultSummary,
  });
}

export function emitOccurrenceFailed(
  userId: string,
  taskId: string,
  occurrenceId: string,
  error?: string,
) {
  return publishProcessingEvent(userId, {
    type: "occurrence_failed",
    taskId,
    occurrenceId,
    error,
  });
}

export function emitOccurrenceCancelled(
  userId: string,
  taskId: string,
  occurrenceId?: string,
) {
  return publishProcessingEvent(userId, {
    type: "occurrence_cancelled",
    taskId,
    occurrenceId,
  });
}

// ── Batch events (emitted from workers) ──────────────────────────────

export function emitTasksOverdue(userId: string, taskIds: string[]) {
  return publishProcessingEvent(userId, {
    type: "tasks_overdue",
    taskIds,
  });
}
