/**
 * Job Waitlist for database queue mode
 *
 * Provides push-based notifications to waiting workers when jobs become available.
 * This eliminates continuous polling by notifying workers immediately when new jobs are enqueued.
 */

import type { QueueLogger } from "../core/types.js";
import type { AssetType, JobWaitlistInterface } from "./types.js";

interface Waiter {
  resolve: (job: any) => void;
  reject: (error: Error) => void;
  timestamp: Date;
  workerId: string;
}

export interface WaitlistConfig {
  /** Logger instance */
  logger: QueueLogger;
  /** Function to find the next scheduled job (for scheduling wakeups) */
  findNextScheduledJob?: (assetType: AssetType) => Promise<Date | null>;
}

/**
 * Creates a job waitlist for managing worker notifications
 */
export function createJobWaitlist(config: WaitlistConfig): JobWaitlistInterface {
  const { logger, findNextScheduledJob } = config;

  const waiters = new Map<AssetType, Waiter[]>();
  const wakeTimers = new Map<AssetType, NodeJS.Timeout>();

  // Initialize empty arrays for each asset type
  const assetTypes: AssetType[] = ["bookmarks", "photos", "documents", "notes", "tasks"];
  for (const assetType of assetTypes) {
    waiters.set(assetType, []);
  }

  function removeWaiter(assetType: AssetType, waiter: Waiter): void {
    const waitersForType = waiters.get(assetType);
    if (!waitersForType) return;

    const index = waitersForType.indexOf(waiter);
    if (index !== -1) {
      waitersForType.splice(index, 1);
      logger.debug(
        { assetType, workerId: waiter.workerId, remainingWaiters: waitersForType.length },
        "Removed worker from waitlist"
      );
    }
  }

  return {
    async addWaiter(
      assetType: AssetType,
      workerId: string,
      timeout: number = 30000
    ): Promise<any> {
      return new Promise((resolve, reject) => {
        const waiter: Waiter = {
          resolve,
          reject,
          timestamp: new Date(),
          workerId,
        };

        const waitersForType = waiters.get(assetType);
        if (!waitersForType) {
          reject(new Error(`Invalid asset type: ${assetType}`));
          return;
        }

        waitersForType.push(waiter);
        logger.debug(
          { assetType, workerId, waitersCount: waitersForType.length },
          "Added worker to waitlist"
        );

        // Set timeout to reject if no job arrives
        const timeoutTimer = setTimeout(() => {
          removeWaiter(assetType, waiter);
          resolve(null); // Timeout - no job available
        }, timeout);

        // Store original resolve to clear timeout when called
        const originalResolve = waiter.resolve;
        waiter.resolve = (job: any) => {
          clearTimeout(timeoutTimer);
          originalResolve(job);
        };
      });
    },

    notifyWaiters(assetType: AssetType, count: number = 1): number {
      const waitersForType = waiters.get(assetType);
      if (!waitersForType || waitersForType.length === 0) {
        logger.debug({ assetType }, "No waiters to notify");
        return 0;
      }

      const toNotify = Math.min(count, waitersForType.length);
      logger.info(
        { assetType, count: toNotify, totalWaiters: waitersForType.length },
        "Notifying waiters"
      );

      for (let i = 0; i < toNotify; i++) {
        const waiter = waitersForType.shift();
        if (waiter) {
          // Resolve with undefined - the waiter will try to claim a job
          waiter.resolve(undefined);
        }
      }

      return toNotify;
    },

    notifyAllWaiters(assetType: AssetType): number {
      const waitersForType = waiters.get(assetType);
      if (!waitersForType) return 0;

      const count = waitersForType.length;
      return this.notifyWaiters(assetType, count);
    },

    async scheduleNextWakeup(assetType: AssetType): Promise<void> {
      // Clear existing timer
      const existingTimer = wakeTimers.get(assetType);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      if (!findNextScheduledJob) {
        logger.debug({ assetType }, "No findNextScheduledJob function provided - skipping wakeup scheduling");
        return;
      }

      try {
        // Find the earliest scheduled job for this asset type
        const nextRun = await findNextScheduledJob(assetType);

        if (nextRun) {
          const delay = nextRun.getTime() - Date.now();

          if (delay > 0 && delay < 86400000) {
            // Max 24 hours
            logger.info(
              { assetType, nextRun: nextRun.toISOString(), delay },
              "Scheduled next wakeup"
            );

            const timer = setTimeout(() => {
              logger.debug({ assetType }, "Wakeup timer fired");
              this.notifyAllWaiters(assetType);
              // Schedule the next wakeup
              this.scheduleNextWakeup(assetType);
            }, delay);

            wakeTimers.set(assetType, timer);
          }
        }
      } catch (error) {
        logger.error(
          { assetType, error: error instanceof Error ? error.message : "Unknown" },
          "Failed to schedule next wakeup"
        );
      }
    },

    getWaiterCount(assetType: AssetType): number {
      return waiters.get(assetType)?.length || 0;
    },

    getStats(): Record<AssetType, number> {
      const stats: Record<string, number> = {};
      for (const [assetType, waitersForType] of waiters.entries()) {
        stats[assetType] = waitersForType.length;
      }
      return stats as Record<AssetType, number>;
    },

    close(): void {
      logger.debug({}, "Closing waitlist");

      // Clear all wake timers
      for (const [assetType, timer] of wakeTimers.entries()) {
        clearTimeout(timer);
        logger.debug({ assetType }, "Cleared wake timer");
      }
      wakeTimers.clear();

      // Resolve all pending waiters with null (no job)
      for (const [assetType, waitersForType] of waiters.entries()) {
        const count = waitersForType.length;
        if (count > 0) {
          logger.debug({ assetType, count }, "Resolving pending waiters on close");
          for (const waiter of waitersForType) {
            waiter.resolve(null);
          }
          waitersForType.length = 0; // Clear the array
        }
      }

      logger.debug({}, "Waitlist closed");
    },
  };
}
