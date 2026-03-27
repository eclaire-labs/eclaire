/**
 * Task Overdue Checker Processor
 *
 * System cron job that runs periodically to mark overdue tasks as urgent.
 * Tasks with due_at in the past and attention_status != "urgent" are updated.
 * Only checks active tasks (not completed or cancelled).
 */

import { and, lte, ne, inArray } from "drizzle-orm";
import { createChildLogger } from "../../lib/logger.js";
import { emitTasksOverdue } from "../../lib/events/task-events.js";
import { db, schema } from "../../db/index.js";

const logger = createChildLogger("task-overdue-checker");

export default async function processTaskOverdueChecker(
  // biome-ignore lint/suspicious/noExplicitAny: job context shape varies by queue driver
  _ctx: any,
): Promise<void> {
  const now = new Date();

  logger.info({}, "Running overdue task checker");

  // Find overdue tasks that aren't already marked urgent, completed, or cancelled
  const overdueTasks = await db
    .select({ id: schema.tasks.id, userId: schema.tasks.userId })
    .from(schema.tasks)
    .where(
      and(
        lte(schema.tasks.dueAt, now),
        ne(schema.tasks.attentionStatus, "urgent"),
        // Only active tasks — skip completed and cancelled
        ne(schema.tasks.taskStatus, "completed"),
        ne(schema.tasks.taskStatus, "cancelled"),
        // Skip tasks that already have higher-priority attention statuses
        inArray(schema.tasks.attentionStatus, ["none", "needs_triage"]),
      ),
    );

  if (overdueTasks.length === 0) {
    logger.info({}, "No overdue tasks found");
    return;
  }

  const taskIds = overdueTasks.map((t) => t.id);

  // Batch update
  await db
    .update(schema.tasks)
    .set({
      attentionStatus: "urgent",
      updatedAt: now,
    })
    .where(inArray(schema.tasks.id, taskIds));

  // Emit SSE events grouped by user
  const byUser = new Map<string, string[]>();
  for (const t of overdueTasks) {
    const list = byUser.get(t.userId) ?? [];
    list.push(t.id);
    byUser.set(t.userId, list);
  }
  for (const [userId, ids] of byUser) {
    emitTasksOverdue(userId, ids);
  }

  logger.info({ count: taskIds.length }, "Marked overdue tasks as urgent");
}
