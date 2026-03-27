/**
 * Task Occurrences Service
 *
 * Manages task occurrence lifecycle — each concrete execution, reminder,
 * or scheduled run on a task. Replaces both AgentRuns and ScheduledActionExecutions.
 */

import { eq, and, desc } from "drizzle-orm";
import { generateTaskOccurrenceId } from "@eclaire/core/id";
import { db, schema } from "../../db/index.js";
import { createChildLogger } from "../logger.js";
import { getQueueAdapter } from "../queue/adapter.js";

const logger = createChildLogger("task-occurrences");

const taskOccurrences = schema.taskOccurrences;

// =============================================================================
// Types
// =============================================================================

export type TaskOccurrenceKind =
  | "manual_run"
  | "scheduled_run"
  | "recurring_run"
  | "reminder"
  | "review_run";

export type TaskOccurrenceExecutionStatus =
  | "idle"
  | "scheduled"
  | "queued"
  | "running"
  | "awaiting_input"
  | "awaiting_review"
  | "failed"
  | "completed"
  | "cancelled";

export interface CreateTaskOccurrenceParams {
  taskId: string;
  userId: string;
  kind: TaskOccurrenceKind;
  prompt?: string;
  executorActorId?: string;
  requestedByActorId?: string;
  scheduledFor?: Date;
  requiresReview?: boolean;
}

export interface TaskOccurrence {
  id: string;
  taskId: string;
  userId: string;
  kind: TaskOccurrenceKind;
  scheduledFor: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  executionStatus: TaskOccurrenceExecutionStatus;
  prompt: string | null;
  resultSummary: string | null;
  resultBody: string | null;
  errorBody: string | null;
  requiresReview: boolean;
  reviewStatus: string;
  executorActorId: string | null;
  requestedByActorId: string | null;
  tokenUsage: unknown;
  deliveryResult: unknown;
  retryOfOccurrenceId: string | null;
  metadata: unknown;
  createdAt: Date;
}

// =============================================================================
// CRUD
// =============================================================================

/**
 * Create a task occurrence and enqueue it for execution.
 */
export async function createTaskOccurrence(
  params: CreateTaskOccurrenceParams,
): Promise<TaskOccurrence> {
  const id = generateTaskOccurrenceId();

  const [created] = await db
    .insert(taskOccurrences)
    .values({
      id,
      taskId: params.taskId,
      userId: params.userId,
      kind: params.kind,
      executionStatus: "queued",
      prompt: params.prompt ?? null,
      executorActorId: params.executorActorId ?? null,
      requestedByActorId: params.requestedByActorId ?? null,
      scheduledFor: params.scheduledFor ?? null,
      requiresReview: params.requiresReview ?? false,
    })
    .returning();

  logger.info(
    {
      id,
      taskId: params.taskId,
      userId: params.userId,
      kind: params.kind,
    },
    "Task occurrence created",
  );

  // Enqueue for execution
  const queueAdapter = await getQueueAdapter();
  await queueAdapter.enqueueTaskOccurrence({
    occurrenceId: id,
    taskId: params.taskId,
    userId: params.userId,
    kind: params.kind,
    executorActorId: params.executorActorId ?? "",
    prompt: params.prompt ?? "",
    scheduledFor: params.scheduledFor,
  });

  return created as TaskOccurrence;
}

/**
 * Get a task occurrence by ID (scoped to user).
 */
export async function getTaskOccurrence(
  id: string,
  userId: string,
): Promise<TaskOccurrence | null> {
  const [row] = await db
    .select()
    .from(taskOccurrences)
    .where(and(eq(taskOccurrences.id, id), eq(taskOccurrences.userId, userId)))
    .limit(1);
  return (row as TaskOccurrence) ?? null;
}

/**
 * List task occurrences for a task.
 */
export async function listTaskOccurrences(
  taskId: string,
  userId: string,
  options?: { limit?: number; offset?: number },
): Promise<TaskOccurrence[]> {
  const results = await db
    .select()
    .from(taskOccurrences)
    .where(
      and(
        eq(taskOccurrences.taskId, taskId),
        eq(taskOccurrences.userId, userId),
      ),
    )
    .orderBy(desc(taskOccurrences.createdAt))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);
  return results as TaskOccurrence[];
}

// =============================================================================
// Execution Lifecycle (called by the worker)
// =============================================================================

/**
 * Mark a task occurrence as running.
 */
export async function startTaskOccurrence(id: string): Promise<void> {
  await db
    .update(taskOccurrences)
    .set({ executionStatus: "running", startedAt: new Date() })
    .where(eq(taskOccurrences.id, id));
}

/**
 * Mark a task occurrence as completed.
 */
export async function completeTaskOccurrence(
  id: string,
  resultBody: string,
  resultSummary?: string,
  tokenUsage?: unknown,
): Promise<void> {
  const now = new Date();
  const [row] = await db
    .select({ startedAt: taskOccurrences.startedAt })
    .from(taskOccurrences)
    .where(eq(taskOccurrences.id, id))
    .limit(1);

  const durationMs = row?.startedAt
    ? now.getTime() - row.startedAt.getTime()
    : null;

  await db
    .update(taskOccurrences)
    .set({
      executionStatus: "completed",
      completedAt: now,
      durationMs,
      resultBody,
      resultSummary: resultSummary ?? resultBody.slice(0, 500),
      tokenUsage: tokenUsage ?? null,
    })
    .where(eq(taskOccurrences.id, id));
}

/**
 * Mark a task occurrence as failed.
 */
export async function failTaskOccurrence(
  id: string,
  error: string,
): Promise<void> {
  const now = new Date();
  const [row] = await db
    .select({ startedAt: taskOccurrences.startedAt })
    .from(taskOccurrences)
    .where(eq(taskOccurrences.id, id))
    .limit(1);

  const durationMs = row?.startedAt
    ? now.getTime() - row.startedAt.getTime()
    : null;

  await db
    .update(taskOccurrences)
    .set({
      executionStatus: "failed",
      completedAt: now,
      durationMs,
      errorBody: error,
    })
    .where(eq(taskOccurrences.id, id));
}

/**
 * Get the execution status of a task occurrence (for idempotency checks).
 */
export async function getTaskOccurrenceStatus(
  id: string,
): Promise<string | null> {
  const [row] = await db
    .select({ executionStatus: taskOccurrences.executionStatus })
    .from(taskOccurrences)
    .where(eq(taskOccurrences.id, id))
    .limit(1);
  return row?.executionStatus ?? null;
}

/**
 * Set delivery result on a task occurrence.
 */
export async function setDeliveryResult(
  id: string,
  deliveryResult: unknown,
): Promise<void> {
  await db
    .update(taskOccurrences)
    .set({ deliveryResult })
    .where(eq(taskOccurrences.id, id));
}
