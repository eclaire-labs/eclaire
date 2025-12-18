/**
 * @eclaire/queue/driver-bullmq - BullMQ Scheduler implementation
 *
 * Uses BullMQ's native job scheduler (upsertJobScheduler) for recurring jobs.
 */

import { Queue } from "bullmq";
import type { Scheduler, ScheduleConfig, QueueLogger } from "../core/types.js";
import type { BullMQSchedulerConfig } from "./types.js";
import { createRedisConnection, closeRedisConnection } from "./connection.js";

/**
 * Default configuration values
 */
const DEFAULTS = {
  prefix: "queue",
};

/**
 * Create a BullMQ-backed Scheduler
 *
 * This uses BullMQ's native job scheduler feature which is more efficient
 * than manual cron processing - BullMQ handles all the timing internally.
 *
 * @param config - Scheduler configuration
 * @returns Scheduler instance
 */
export function createBullMQScheduler(config: BullMQSchedulerConfig): Scheduler {
  const {
    redis,
    logger,
    prefix = DEFAULTS.prefix,
  } = config;

  // Create Redis connection
  const connection = createRedisConnection(redis, logger);

  // Cache of Queue instances by name
  const queues = new Map<string, Queue>();

  // Track schedules we've created (for list functionality)
  // Note: Schedule tracking is in-memory only. After restart, only schedules
  // created in this process are visible via list(). Schedules persist in Redis
  // and will continue to run, but this process won't see them until they're
  // re-registered via upsert(). This differs from the DB driver which has a
  // persistent view of all schedules.
  const schedules = new Map<string, ScheduleConfig>();

  /**
   * Get or create a Queue instance for a given name
   */
  function getQueue(name: string): Queue {
    let queue = queues.get(name);
    if (!queue) {
      queue = new Queue(name, {
        connection,
        prefix,
      });
      queues.set(name, queue);
    }
    return queue;
  }

  return {
    async upsert(scheduleConfig: ScheduleConfig): Promise<string> {
      const {
        key,
        name,
        cron,
        data,
        enabled = true,
        limit,
        endDate,
        immediately = false,
      } = scheduleConfig;

      const queue = getQueue(name);

      try {
        // Only create in BullMQ if enabled
        if (enabled) {
          // BullMQ's upsertJobScheduler API
          await queue.upsertJobScheduler(
            key, // Schedule ID
            {
              pattern: cron,
              limit: limit || undefined,
              endDate: endDate || undefined,
              immediately,
            },
            {
              name,
              data,
            },
          );
          logger.info({ key, name, cron, enabled }, "Schedule upserted");
        } else {
          // If disabled, ensure it's removed from BullMQ (in case it existed before)
          try {
            await queue.removeJobScheduler(key);
          } catch {
            // Ignore if it doesn't exist
          }
          logger.info({ key, name, cron, enabled }, "Schedule stored (disabled)");
        }

        // Store for list functionality
        schedules.set(key, scheduleConfig);

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
      // Find which queue has this schedule
      const schedule = schedules.get(key);
      if (!schedule) {
        logger.debug({ key }, "Schedule not found");
        return false;
      }

      const queue = getQueue(schedule.name);

      try {
        await queue.removeJobScheduler(key);
        schedules.delete(key);
        logger.info({ key }, "Schedule removed");
        return true;
      } catch (error) {
        logger.error(
          { key, error: error instanceof Error ? error.message : "Unknown" },
          "Failed to remove schedule",
        );
        throw error;
      }
    },

    async setEnabled(key: string, enabled: boolean): Promise<void> {
      const schedule = schedules.get(key);
      if (!schedule) {
        throw new Error(`Schedule not found: ${key}`);
      }

      if (enabled) {
        // Re-create the schedule with enabled: true
        // (cached schedule may have enabled: false)
        await this.upsert({ ...schedule, enabled: true });
      } else {
        // Remove but keep in our cache
        const queue = getQueue(schedule.name);
        await queue.removeJobScheduler(key);
      }

      // Update cache
      schedules.set(key, { ...schedule, enabled });

      logger.info({ key, enabled }, "Schedule enabled state changed");
    },

    async list(name?: string): Promise<ScheduleConfig[]> {
      const results: ScheduleConfig[] = [];

      for (const [_, schedule] of schedules) {
        if (!name || schedule.name === name) {
          results.push(schedule);
        }
      }

      return results;
    },

    async start(): Promise<void> {
      // BullMQ schedulers are always running - nothing to start
      logger.info({}, "BullMQ scheduler started (always active)");
    },

    async stop(): Promise<void> {
      // Close all queues
      for (const [name, queue] of queues) {
        try {
          await queue.close();
        } catch (error) {
          logger.error(
            { name, error: error instanceof Error ? error.message : "Unknown" },
            "Error closing queue",
          );
        }
      }
      queues.clear();

      // Close Redis connection
      await closeRedisConnection(connection, logger);
      logger.info({}, "BullMQ scheduler stopped");
    },
  };
}
