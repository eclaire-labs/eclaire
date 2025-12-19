import { createJobWaitlist, type AssetType, type JobWaitlistInterface } from "@eclaire/queue/app";
import { createChildLogger } from "../logger.js";
import { db, queueJobs } from "../../db/index.js";
import { and, or, eq, gt, sql } from "drizzle-orm";

const logger = createChildLogger("job-waitlist");

// Re-export AssetType for convenience
export type { AssetType };

/**
 * Find the next scheduled job for a specific asset type
 * This is used by the waitlist to schedule wakeup timers
 */
async function findNextScheduledJob(assetType: AssetType): Promise<Date | null> {
  const result = await db
    .select({ scheduledFor: queueJobs.scheduledFor })
    .from(queueJobs)
    .where(
      and(
        sql`${queueJobs.metadata}->>'assetType' = ${assetType}`,
        or(
          eq(queueJobs.status, "pending"),
          eq(queueJobs.status, "retry_pending")
        ),
        gt(queueJobs.scheduledFor, new Date())
      )
    )
    .orderBy(queueJobs.scheduledFor)
    .limit(1);

  return result.length > 0 && result[0]?.scheduledFor
    ? new Date(result[0]!.scheduledFor)
    : null;
}

// Create singleton instance using package factory
export const jobWaitlist = createJobWaitlist({
  logger,
  findNextScheduledJob,
});
