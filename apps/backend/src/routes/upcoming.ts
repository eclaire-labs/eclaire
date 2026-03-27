/**
 * Unified Upcoming API
 *
 * Merges tasks (future dueDate), scheduled actions (active, future nextRunAt),
 * and task series (active, future nextOccurrenceAt) into one chronological list.
 */

import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import z from "zod/v4";
import { and, eq, gt, inArray, isNotNull, asc } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { createChildLogger } from "../lib/logger.js";
import { withAuth } from "../middleware/with-auth.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("upcoming");

interface UpcomingItem {
  id: string;
  sourceType: "task" | "scheduled_action" | "task_series";
  title: string;
  when: string; // ISO 8601
  kind?: string; // reminder, agent_run (for scheduled actions)
  executionMode?: string; // manual, agent_assists, agent_handles (for tasks)
  status?: string;
  linkTo: string; // frontend path
}

export const upcomingRoutes = new Hono<{ Variables: RouteVariables }>();

upcomingRoutes.get(
  "/",
  zValidator(
    "query",
    z.object({
      limit: z.coerce.number().min(1).max(50).default(15).optional(),
    }),
  ),
  withAuth(async (c, userId) => {
    const { limit } = c.req.valid("query");
    const maxItems = limit ?? 15;
    const now = new Date();

    // Fetch all three sources in parallel
    const [taskRows, actionRows, seriesRows] = await Promise.all([
      // Tasks with future dueDate, not completed/cancelled
      db
        .select({
          id: schema.tasks.id,
          title: schema.tasks.title,
          dueDate: schema.tasks.dueDate,
          status: schema.tasks.status,
          executionMode: schema.tasks.executionMode,
        })
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.userId, userId),
            isNotNull(schema.tasks.dueDate),
            gt(schema.tasks.dueDate, now),
            inArray(schema.tasks.status, [
              "backlog",
              "open",
              "in-progress",
              "blocked",
            ]),
          ),
        )
        .orderBy(asc(schema.tasks.dueDate))
        .limit(maxItems),

      // Active scheduled actions with future nextRunAt
      db
        .select({
          id: schema.scheduledActions.id,
          title: schema.scheduledActions.title,
          nextRunAt: schema.scheduledActions.nextRunAt,
          kind: schema.scheduledActions.kind,
          status: schema.scheduledActions.status,
        })
        .from(schema.scheduledActions)
        .where(
          and(
            eq(schema.scheduledActions.userId, userId),
            eq(schema.scheduledActions.status, "active"),
            isNotNull(schema.scheduledActions.nextRunAt),
          ),
        )
        .orderBy(asc(schema.scheduledActions.nextRunAt))
        .limit(maxItems),

      // Active task series with future nextOccurrenceAt
      db
        .select({
          id: schema.taskSeries.id,
          title: schema.taskSeries.title,
          nextOccurrenceAt: schema.taskSeries.nextOccurrenceAt,
          status: schema.taskSeries.status,
          executionPolicy: schema.taskSeries.executionPolicy,
        })
        .from(schema.taskSeries)
        .where(
          and(
            eq(schema.taskSeries.userId, userId),
            eq(schema.taskSeries.status, "active"),
            isNotNull(schema.taskSeries.nextOccurrenceAt),
          ),
        )
        .orderBy(asc(schema.taskSeries.nextOccurrenceAt))
        .limit(maxItems),
    ]);

    // Transform into unified items
    const items: UpcomingItem[] = [];

    for (const row of taskRows) {
      if (row.dueDate) {
        items.push({
          id: row.id,
          sourceType: "task",
          title: row.title,
          when: row.dueDate.toISOString(),
          executionMode: row.executionMode,
          status: row.status,
          linkTo: `/tasks/${row.id}`,
        });
      }
    }

    for (const row of actionRows) {
      if (row.nextRunAt) {
        items.push({
          id: row.id,
          sourceType: "scheduled_action",
          title: row.title,
          when: row.nextRunAt.toISOString(),
          kind: row.kind,
          status: row.status,
          linkTo: `/automations/${row.id}`,
        });
      }
    }

    for (const row of seriesRows) {
      if (row.nextOccurrenceAt) {
        items.push({
          id: row.id,
          sourceType: "task_series",
          title: row.title,
          when: row.nextOccurrenceAt.toISOString(),
          executionMode:
            row.executionPolicy === "assign_and_run"
              ? "agent_handles"
              : "manual",
          status: row.status,
          linkTo: `/task-series/${row.id}`,
        });
      }
    }

    // Sort by when, take top N
    items.sort(
      (a, b) => new Date(a.when).getTime() - new Date(b.when).getTime(),
    );

    return c.json({ items: items.slice(0, maxItems) });
  }, logger),
);
