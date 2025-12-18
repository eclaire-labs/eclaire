import { createJobWaitlist, type AssetType, type JobWaitlistInterface } from "@eclaire/queue/app";
import { createChildLogger } from "./logger.js";
import { db, schema } from "../db/index.js";
import { and, or, eq, gt } from "drizzle-orm";

const { assetProcessingJobs } = schema;

const logger = createChildLogger("job-waitlist");

// Re-export AssetType for convenience
export type { AssetType };

/**
 * Find the next scheduled job for a specific asset type
 * This is used by the waitlist to schedule wakeup timers
 */
async function findNextScheduledJob(assetType: AssetType): Promise<Date | null> {
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

  return result.length > 0 && result[0]?.scheduledFor
    ? new Date(result[0]!.scheduledFor)
    : null;
}

// Create singleton instance using package factory
export const jobWaitlist = createJobWaitlist({
  logger,
  findNextScheduledJob,
});
