import { createChildLogger } from "./logger.js";
import { db, schema } from "../db/index.js";
const { assetProcessingJobs } = schema;
import { sql, and, or, eq, isNull, lte, gt } from "drizzle-orm";

const logger = createChildLogger("job-waitlist");

export type AssetType = "bookmarks" | "photos" | "documents" | "notes" | "tasks";

interface Waiter {
  resolve: (job: any) => void;
  reject: (error: Error) => void;
  timestamp: Date;
  workerId: string;
}

class JobWaitlist {
  private waiters = new Map<AssetType, Waiter[]>();
  private wakeTimers = new Map<AssetType, NodeJS.Timeout>();

  constructor() {
    // Initialize empty arrays for each asset type
    const assetTypes: AssetType[] = ["bookmarks", "photos", "documents", "notes", "tasks"];
    for (const assetType of assetTypes) {
      this.waiters.set(assetType, []);
    }
  }

  /**
   * Add a worker to the waitlist for a specific asset type
   * Returns a promise that resolves when a job becomes available or rejects on timeout
   */
  async addWaiter(
    assetType: AssetType,
    workerId: string,
    timeoutMs: number = 30000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timestamp: new Date(),
        workerId,
      };

      const waiters = this.waiters.get(assetType);
      if (!waiters) {
        reject(new Error(`Invalid asset type: ${assetType}`));
        return;
      }

      waiters.push(waiter);
      logger.debug(
        { assetType, workerId, waitersCount: waiters.length },
        "Added worker to waitlist"
      );

      // Set timeout to reject if no job arrives
      const timeout = setTimeout(() => {
        this.removeWaiter(assetType, waiter);
        resolve(null); // Timeout - no job available
      }, timeoutMs);

      // Store original resolve to clear timeout when called
      const originalResolve = waiter.resolve;
      waiter.resolve = (job: any) => {
        clearTimeout(timeout);
        originalResolve(job);
      };
    });
  }

  /**
   * Notify one or more waiting workers for a specific asset type
   * Returns the number of workers notified
   */
  notifyWaiters(assetType: AssetType, count: number = 1): number {
    const waiters = this.waiters.get(assetType);
    if (!waiters || waiters.length === 0) {
      logger.debug({ assetType }, "No waiters to notify");
      return 0;
    }

    const toNotify = Math.min(count, waiters.length);
    logger.info(
      { assetType, count: toNotify, totalWaiters: waiters.length },
      "Notifying waiters"
    );

    for (let i = 0; i < toNotify; i++) {
      const waiter = waiters.shift();
      if (waiter) {
        // Resolve with undefined - the waiter will try to claim a job
        waiter.resolve(undefined);
      }
    }

    return toNotify;
  }

  /**
   * Schedule a wakeup for when the next scheduled job becomes ready
   */
  async scheduleNextWakeup(assetType: AssetType): Promise<void> {
    // Clear existing timer
    const existingTimer = this.wakeTimers.get(assetType);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    try {
      // Find the earliest scheduled job for this asset type
      const result = await db
        .select({ scheduledFor: assetProcessingJobs.scheduledFor })
        .from(assetProcessingJobs)
        .where(
          and(
            eq(assetProcessingJobs.assetType, assetType),
            or(
              eq(assetProcessingJobs.status, "pending"),
              eq(assetProcessingJobs.status, "retry_pending")
            ),
            gt(assetProcessingJobs.scheduledFor, new Date())
          )
        )
        .orderBy(assetProcessingJobs.scheduledFor)
        .limit(1);

      if (result.length > 0 && result[0]?.scheduledFor) {
        const nextRun = new Date(result[0]!.scheduledFor);
        const delay = nextRun.getTime() - Date.now();

        if (delay > 0 && delay < 86400000) {
          // Max 24 hours
          logger.info(
            { assetType, nextRun: nextRun.toISOString(), delayMs: delay },
            "Scheduled next wakeup"
          );

          const timer = setTimeout(() => {
            logger.debug({ assetType }, "Wakeup timer fired");
            this.notifyAllWaiters(assetType);
            // Schedule the next wakeup
            this.scheduleNextWakeup(assetType);
          }, delay);

          this.wakeTimers.set(assetType, timer);
        }
      }
    } catch (error) {
      logger.error(
        { assetType, error: error instanceof Error ? error.message : "Unknown" },
        "Failed to schedule next wakeup"
      );
    }
  }

  /**
   * Notify all waiting workers for a specific asset type
   */
  notifyAllWaiters(assetType: AssetType): number {
    const waiters = this.waiters.get(assetType);
    if (!waiters) return 0;

    const count = waiters.length;
    return this.notifyWaiters(assetType, count);
  }

  /**
   * Remove a specific waiter from the waitlist
   */
  private removeWaiter(assetType: AssetType, waiter: Waiter): void {
    const waiters = this.waiters.get(assetType);
    if (!waiters) return;

    const index = waiters.indexOf(waiter);
    if (index !== -1) {
      waiters.splice(index, 1);
      logger.debug(
        { assetType, workerId: waiter.workerId, remainingWaiters: waiters.length },
        "Removed worker from waitlist"
      );
    }
  }

  /**
   * Get the number of waiting workers for a specific asset type
   */
  getWaiterCount(assetType: AssetType): number {
    return this.waiters.get(assetType)?.length || 0;
  }

  /**
   * Get statistics about all waitlists
   */
  getStats(): Record<AssetType, number> {
    const stats: Record<string, number> = {};
    for (const [assetType, waiters] of this.waiters.entries()) {
      stats[assetType] = waiters.length;
    }
    return stats as Record<AssetType, number>;
  }
}

// Singleton instance
export const jobWaitlist = new JobWaitlist();
