/**
 * @eclaire/queue/driver-db - Database scheduler for recurring jobs
 *
 * This module implements cron-based recurring job scheduling using
 * the queue_schedules table. It periodically checks for due schedules
 * and enqueues jobs accordingly.
 */

import { eq, and, lte, sql } from "drizzle-orm";
import type { QueueClient, Scheduler, ScheduleConfig, QueueLogger } from "../core/types.js";
import { generateScheduleId, cancellableSleep, isValidCronExpression, createDeferred } from "../core/utils.js";
import type { DbInstance } from "./types.js";

// We'll use a simple cron parser - users can provide their own
// For now, this is a minimal implementation
import { CronExpressionParser } from "cron-parser";

/**
 * Configuration for the database scheduler
 */
export interface DbSchedulerConfig {
  /** Database instance */
  db: DbInstance;

  /** Queue schedules table */
  queueSchedules: any;

  /** Queue client for enqueuing jobs */
  queueClient: QueueClient;

  /** Logger instance */
  logger: QueueLogger;

  /** How often to check for due schedules (default: 10000 = 10 seconds) */
  checkInterval?: number;

  /** Timeout for graceful shutdown in ms (default: 30000) */
  gracefulShutdownTimeout?: number;
}

/**
 * Default configuration values
 */
const DEFAULTS = {
  checkInterval: 10000, // 10 seconds
  gracefulShutdownTimeout: 30000, // 30 seconds
};

/**
 * Create a database-backed scheduler
 *
 * @param config - Scheduler configuration
 * @returns Scheduler instance
 */
export function createDbScheduler(config: DbSchedulerConfig): Scheduler {
  const {
    db,
    queueSchedules,
    queueClient,
    logger,
    checkInterval = DEFAULTS.checkInterval,
    gracefulShutdownTimeout = DEFAULTS.gracefulShutdownTimeout,
  } = config;

  let running = false;
  let stopRequested = false;
  let abortController: AbortController | null = null;
  let stopDeferred = createDeferred<void>();

  /**
   * Calculate next run time from cron expression
   */
  function getNextRunTime(cron: string, fromDate: Date = new Date()): Date {
    try {
      const interval = CronExpressionParser.parse(cron, { currentDate: fromDate });
      return interval.next().toDate();
    } catch (error) {
      logger.error({ cron, error: error instanceof Error ? error.message : "Unknown" }, "Invalid cron expression");
      // Fall back to 1 hour from now
      return new Date(fromDate.getTime() + 3600000);
    }
  }

  /**
   * Process due schedules
   */
  async function processSchedules(): Promise<void> {
    const now = new Date();

    try {
      // Find all enabled schedules that are due
      const dueSchedules = await (db as any)
        .select()
        .from(queueSchedules)
        .where(
          and(
            eq(queueSchedules.enabled, true),
            lte(queueSchedules.nextRunAt, now),
          ),
        );

      for (const schedule of dueSchedules) {
        try {
          // Check if we've passed the end date
          if (schedule.endDate && now >= schedule.endDate) {
            // Disable the schedule
            await (db as any)
              .update(queueSchedules)
              .set({
                enabled: false,
                updatedAt: now,
              })
              .where(eq(queueSchedules.id, schedule.id));

            logger.info(
              { scheduleKey: schedule.key, endDate: schedule.endDate },
              "Schedule disabled (end date reached)",
            );
            continue;
          }

          // Check if we've hit the run limit
          if (schedule.runLimit !== null && schedule.runCount >= schedule.runLimit) {
            // Disable the schedule
            await (db as any)
              .update(queueSchedules)
              .set({
                enabled: false,
                updatedAt: now,
              })
              .where(eq(queueSchedules.id, schedule.id));

            logger.info(
              { scheduleKey: schedule.key, runCount: schedule.runCount },
              "Schedule disabled (run limit reached)",
            );
            continue;
          }

          // Enqueue the job with a deterministic key based on scheduled time
          // This ensures idempotency if scheduler restarts before updating nextRunAt
          await queueClient.enqueue(schedule.queue, schedule.data, {
            key: `schedule:${schedule.key}:${schedule.nextRunAt.getTime()}`,
          });

          // Update schedule
          const nextRunAt = getNextRunTime(schedule.cron, now);
          await (db as any)
            .update(queueSchedules)
            .set({
              lastRunAt: now,
              nextRunAt,
              runCount: sql`${queueSchedules.runCount} + 1`,
              updatedAt: now,
            })
            .where(eq(queueSchedules.id, schedule.id));

          logger.info(
            { scheduleKey: schedule.key, queue: schedule.queue, nextRunAt },
            "Scheduled job enqueued",
          );
        } catch (error) {
          logger.error(
            {
              scheduleKey: schedule.key,
              error: error instanceof Error ? error.message : "Unknown",
            },
            "Failed to process schedule",
          );
        }
      }
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown" },
        "Failed to process schedules",
      );
    }
  }

  /**
   * Main scheduler loop
   */
  async function runLoop(): Promise<void> {
    logger.info({ checkInterval }, "Scheduler started");

    while (running && !stopRequested) {
      await processSchedules();
      await cancellableSleep(checkInterval, abortController?.signal);
    }

    logger.info({}, "Scheduler stopped");
    stopDeferred.resolve();
  }

  return {
    async upsert(scheduleConfig: ScheduleConfig): Promise<string> {
      const {
        key,
        queue,
        cron,
        data,
        enabled = true,
        limit,
        endDate,
        immediately = false,
      } = scheduleConfig;

      // Validate cron expression
      if (!isValidCronExpression(cron)) {
        throw new Error(`Invalid cron expression: ${cron}`);
      }

      const now = new Date();
      const nextRunAt = immediately ? now : getNextRunTime(cron, now);

      try {
        // Try to insert, update on conflict
        await (db as any)
          .insert(queueSchedules)
          .values({
            id: generateScheduleId(),
            key,
            queue,
            cron,
            data,
            enabled,
            runLimit: limit || null,
            endDate: endDate || null,
            nextRunAt,
            runCount: 0,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [queueSchedules.key],
            set: {
              queue: sql`EXCLUDED.queue`,
              cron: sql`EXCLUDED.cron`,
              data: sql`EXCLUDED.data`,
              enabled: sql`EXCLUDED.enabled`,
              runLimit: sql`EXCLUDED.run_limit`,
              endDate: sql`EXCLUDED.end_date`,
              nextRunAt: sql`EXCLUDED.next_run_at`,
              updatedAt: now,
            },
          });

        logger.info({ key, queue, cron, nextRunAt }, "Schedule upserted");
        return key;
      } catch (error) {
        logger.error(
          { key, error: error instanceof Error ? error.message : "Unknown" },
          "Failed to upsert schedule",
        );
        throw error;
      }
    },

    async remove(key: string): Promise<boolean> {
      try {
        const result = await (db as any)
          .delete(queueSchedules)
          .where(eq(queueSchedules.key, key))
          .returning({ id: queueSchedules.id });

        const removed = result.length > 0;

        if (removed) {
          logger.info({ key }, "Schedule removed");
        }

        return removed;
      } catch (error) {
        logger.error(
          { key, error: error instanceof Error ? error.message : "Unknown" },
          "Failed to remove schedule",
        );
        throw error;
      }
    },

    async setEnabled(key: string, enabled: boolean): Promise<void> {
      try {
        await (db as any)
          .update(queueSchedules)
          .set({
            enabled,
            updatedAt: new Date(),
          })
          .where(eq(queueSchedules.key, key));

        logger.info({ key, enabled }, "Schedule enabled state changed");
      } catch (error) {
        logger.error(
          { key, error: error instanceof Error ? error.message : "Unknown" },
          "Failed to set schedule enabled state",
        );
        throw error;
      }
    },

    async get(key: string): Promise<ScheduleConfig | null> {
      try {
        const rows = await (db as any)
          .select()
          .from(queueSchedules)
          .where(eq(queueSchedules.key, key))
          .limit(1);

        if (rows.length === 0) {
          return null;
        }

        const row = rows[0];
        return {
          key: row.key,
          queue: row.queue,
          cron: row.cron,
          data: row.data,
          enabled: row.enabled,
          limit: row.runLimit || undefined,
          endDate: row.endDate || undefined,
        };
      } catch (error) {
        logger.error(
          { key, error: error instanceof Error ? error.message : "Unknown" },
          "Failed to get schedule",
        );
        throw error;
      }
    },

    async list(queue?: string): Promise<ScheduleConfig[]> {
      try {
        const conditions = queue ? eq(queueSchedules.queue, queue) : undefined;

        const rows = await (db as any)
          .select()
          .from(queueSchedules)
          .where(conditions);

        return rows.map((row: any) => ({
          key: row.key,
          queue: row.queue,
          cron: row.cron,
          data: row.data,
          enabled: row.enabled,
          limit: row.runLimit || undefined,
          endDate: row.endDate || undefined,
        }));
      } catch (error) {
        logger.error(
          { queue, error: error instanceof Error ? error.message : "Unknown" },
          "Failed to list schedules",
        );
        throw error;
      }
    },

    async start(): Promise<void> {
      if (running) {
        logger.warn({}, "Scheduler already running");
        return;
      }

      running = true;
      stopRequested = false;
      abortController = new AbortController();
      stopDeferred = createDeferred<void>(); // Reset for new start

      // Start loop (don't await - runs in background)
      runLoop();
    },

    async stop(): Promise<void> {
      if (!running) {
        return;
      }

      logger.info({}, "Stopping scheduler...");
      stopRequested = true;

      // Signal the sleep to cancel immediately
      abortController?.abort();

      // Wait for loop to finish with timeout
      const timeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          logger.warn({}, "Scheduler shutdown timeout reached");
          resolve();
        }, gracefulShutdownTimeout);
      });

      await Promise.race([stopDeferred.promise, timeoutPromise]);
      running = false;
      abortController = null;
    },
  };
}
