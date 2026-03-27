/**
 * Agent Runs Service
 *
 * Manages agent execution requests on tasks.
 * An AgentRun represents one concrete execution request where an AI agent
 * works on a task — reading context, using tools, and producing results.
 */

import { eq, and, desc } from "drizzle-orm";
import { generateAgentRunId } from "@eclaire/core/id";
import { db, schema } from "../../db/index.js";
import { createChildLogger } from "../logger.js";
import { getQueueAdapter } from "../queue/adapter.js";
import type { AgentRunJobData } from "../queue/types.js";

const logger = createChildLogger("agent-runs");

const agentRuns = schema.agentRuns;

// =============================================================================
// Types
// =============================================================================

export type AgentRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface CreateAgentRunParams {
  taskId: string;
  userId: string;
  requestedByActorId: string;
  executorActorId: string;
  prompt: string;
}

export interface AgentRun {
  id: string;
  taskId: string;
  userId: string;
  requestedByActorId: string | null;
  executorActorId: string | null;
  status: AgentRunStatus;
  prompt: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  output: string | null;
  error: string | null;
  resultSummary: string | null;
  tokenUsage: unknown;
  metadata: unknown;
  createdAt: Date;
}

// =============================================================================
// CRUD
// =============================================================================

/**
 * Create an agent run and enqueue it for execution.
 */
export async function createAgentRun(
  params: CreateAgentRunParams,
): Promise<AgentRun> {
  const id = generateAgentRunId();

  const [created] = await db
    .insert(agentRuns)
    .values({
      id,
      taskId: params.taskId,
      userId: params.userId,
      requestedByActorId: params.requestedByActorId,
      executorActorId: params.executorActorId,
      status: "queued",
      prompt: params.prompt,
    })
    .returning();

  logger.info(
    {
      id,
      taskId: params.taskId,
      userId: params.userId,
      executorActorId: params.executorActorId,
    },
    "Agent run created",
  );

  // Enqueue for execution
  const queueAdapter = await getQueueAdapter();
  await queueAdapter.enqueueAgentRun({
    agentRunId: id,
    taskId: params.taskId,
    userId: params.userId,
    executorActorId: params.executorActorId,
    prompt: params.prompt,
  });

  return created as AgentRun;
}

/**
 * Get an agent run by ID (scoped to user).
 */
export async function getAgentRun(
  id: string,
  userId: string,
): Promise<AgentRun | null> {
  const [run] = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.id, id), eq(agentRuns.userId, userId)))
    .limit(1);
  return (run as AgentRun) ?? null;
}

/**
 * List agent runs for a task.
 */
export async function listAgentRuns(
  taskId: string,
  userId: string,
  options?: { limit?: number; offset?: number },
): Promise<AgentRun[]> {
  const results = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.taskId, taskId), eq(agentRuns.userId, userId)))
    .orderBy(desc(agentRuns.createdAt))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);
  return results as AgentRun[];
}

// =============================================================================
// Execution Lifecycle (called by the worker)
// =============================================================================

/**
 * Mark an agent run as running.
 */
export async function startAgentRun(id: string): Promise<void> {
  await db
    .update(agentRuns)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(agentRuns.id, id));
}

/**
 * Mark an agent run as completed.
 */
export async function completeAgentRun(
  id: string,
  output: string,
  resultSummary?: string,
  tokenUsage?: unknown,
): Promise<void> {
  const now = new Date();
  const [run] = await db
    .select({ startedAt: agentRuns.startedAt })
    .from(agentRuns)
    .where(eq(agentRuns.id, id))
    .limit(1);

  const durationMs = run?.startedAt
    ? now.getTime() - run.startedAt.getTime()
    : null;

  await db
    .update(agentRuns)
    .set({
      status: "completed",
      completedAt: now,
      durationMs,
      output,
      resultSummary: resultSummary ?? output.slice(0, 500),
      tokenUsage: tokenUsage ?? null,
    })
    .where(eq(agentRuns.id, id));
}

/**
 * Mark an agent run as failed.
 */
export async function failAgentRun(id: string, error: string): Promise<void> {
  const now = new Date();
  const [run] = await db
    .select({ startedAt: agentRuns.startedAt })
    .from(agentRuns)
    .where(eq(agentRuns.id, id))
    .limit(1);

  const durationMs = run?.startedAt
    ? now.getTime() - run.startedAt.getTime()
    : null;

  await db
    .update(agentRuns)
    .set({
      status: "failed",
      completedAt: now,
      durationMs,
      error,
    })
    .where(eq(agentRuns.id, id));
}

/**
 * Get the status of an agent run (for idempotency checks).
 */
export async function getAgentRunStatus(id: string): Promise<string | null> {
  const [row] = await db
    .select({ status: agentRuns.status })
    .from(agentRuns)
    .where(eq(agentRuns.id, id))
    .limit(1);
  return row?.status ?? null;
}
