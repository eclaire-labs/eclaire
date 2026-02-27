/**
 * Job Waitlist for database queue mode
 *
 * Provides push-based notifications to waiting workers when jobs become available.
 * This eliminates continuous polling by notifying workers immediately when new jobs are enqueued.
 */

import { getErrorMessage } from "@eclaire/core";
import type { QueueLogger } from "../core/types.js";
import type { JobWaitlistInterface } from "./types.js";

interface Waiter {
  // biome-ignore lint/suspicious/noExplicitAny: resolve callback accepts any job type or null
  resolve: (job: any) => void;
  reject: (error: Error) => void;
  timestamp: Date;
  workerId: string;
}

export interface WaitlistConfig {
  /** Logger instance */
  logger: QueueLogger;
  /** Function to find the next scheduled job (for scheduling wakeups) */
  findNextScheduledJob?: (queue: string) => Promise<Date | null>;
}

/**
 * Creates a job waitlist for managing worker notifications
 */
export function createJobWaitlist(
  config: WaitlistConfig,
): JobWaitlistInterface {
  const { logger, findNextScheduledJob } = config;

  const waiters = new Map<string, Waiter[]>();
  const wakeTimers = new Map<string, NodeJS.Timeout>();

  /** Get or create the waiter list for a queue */
  function getWaiters(queue: string): Waiter[] {
    let list = waiters.get(queue);
    if (!list) {
      list = [];
      waiters.set(queue, list);
    }
    return list;
  }

  function removeWaiter(queue: string, waiter: Waiter): void {
    const waitersForQueue = waiters.get(queue);
    if (!waitersForQueue) return;

    const index = waitersForQueue.indexOf(waiter);
    if (index !== -1) {
      waitersForQueue.splice(index, 1);
      logger.debug(
        {
          queue,
          workerId: waiter.workerId,
          remainingWaiters: waitersForQueue.length,
        },
        "Removed worker from waitlist",
      );
    }
  }

  return {
    async addWaiter(
      queue: string,
      workerId: string,
      timeout: number = 30000,
      // biome-ignore lint/suspicious/noExplicitAny: return type varies — resolves with claimed job or null
    ): Promise<any> {
      return new Promise((resolve, reject) => {
        const waiter: Waiter = {
          resolve,
          reject,
          timestamp: new Date(),
          workerId,
        };

        const waitersForQueue = getWaiters(queue);
        waitersForQueue.push(waiter);
        logger.debug(
          { queue, workerId, waitersCount: waitersForQueue.length },
          "Added worker to waitlist",
        );

        // Set timeout to reject if no job arrives
        const safeTimeout = Math.max(1, timeout);
        const timeoutTimer = setTimeout(() => {
          removeWaiter(queue, waiter);
          resolve(null); // Timeout - no job available
        }, safeTimeout);

        // Store original resolve to clear timeout when called
        const originalResolve = waiter.resolve;
        // biome-ignore lint/suspicious/noExplicitAny: resolve callback accepts any job type or null
        waiter.resolve = (job: any) => {
          clearTimeout(timeoutTimer);
          originalResolve(job);
        };
      });
    },

    notifyWaiters(queue: string, count: number = 1): number {
      const waitersForQueue = waiters.get(queue);
      if (!waitersForQueue || waitersForQueue.length === 0) {
        logger.debug({ queue }, "No waiters to notify");
        return 0;
      }

      const toNotify = Math.min(count, waitersForQueue.length);
      logger.info(
        { queue, count: toNotify, totalWaiters: waitersForQueue.length },
        "Notifying waiters",
      );

      for (let i = 0; i < toNotify; i++) {
        const waiter = waitersForQueue.shift();
        if (waiter) {
          // Resolve with undefined - the waiter will try to claim a job
          waiter.resolve(undefined);
        }
      }

      return toNotify;
    },

    notifyAllWaiters(queue: string): number {
      const waitersForQueue = waiters.get(queue);
      if (!waitersForQueue) return 0;

      const count = waitersForQueue.length;
      return this.notifyWaiters(queue, count);
    },

    async scheduleNextWakeup(queue: string): Promise<void> {
      // Clear existing timer
      const existingTimer = wakeTimers.get(queue);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      if (!findNextScheduledJob) {
        logger.debug(
          { queue },
          "No findNextScheduledJob function provided - skipping wakeup scheduling",
        );
        return;
      }

      try {
        // Find the earliest scheduled job for this queue
        const nextRun = await findNextScheduledJob(queue);

        if (nextRun) {
          const delay = nextRun.getTime() - Date.now();

          if (delay > 0 && delay < 86400000) {
            // Max 24 hours
            logger.info(
              { queue, nextRun: nextRun.toISOString(), delay },
              "Scheduled next wakeup",
            );

            const safeDelay = Math.max(1, delay || 0);
            const timer = setTimeout(() => {
              logger.debug({ queue }, "Wakeup timer fired");
              this.notifyAllWaiters(queue);
              // Schedule the next wakeup
              this.scheduleNextWakeup(queue);
            }, safeDelay);

            wakeTimers.set(queue, timer);
          }
        }
      } catch (error) {
        logger.error(
          {
            queue,
            error: getErrorMessage(error),
          },
          "Failed to schedule next wakeup",
        );
      }
    },

    getWaiterCount(queue: string): number {
      return waiters.get(queue)?.length || 0;
    },

    getStats(): Record<string, number> {
      const stats: Record<string, number> = {};
      for (const [queue, waitersForQueue] of waiters.entries()) {
        stats[queue] = waitersForQueue.length;
      }
      return stats;
    },

    close(): void {
      logger.debug({}, "Closing waitlist");

      // Clear all wake timers
      for (const [queue, timer] of wakeTimers.entries()) {
        clearTimeout(timer);
        logger.debug({ queue }, "Cleared wake timer");
      }
      wakeTimers.clear();

      // Resolve all pending waiters with null (no job)
      for (const [queue, waitersForQueue] of waiters.entries()) {
        const count = waitersForQueue.length;
        if (count > 0) {
          logger.debug(
            { queue, count },
            "Resolving pending waiters on close",
          );
          for (const waiter of waitersForQueue) {
            waiter.resolve(null);
          }
          waitersForQueue.length = 0; // Clear the array
        }
      }

      logger.debug({}, "Waitlist closed");
    },
  };
}
