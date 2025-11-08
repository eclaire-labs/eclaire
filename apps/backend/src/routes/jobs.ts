// Job fetch API for database-backed queue mode
// Workers poll these endpoints to fetch and process jobs

import { Hono } from "hono";
import { db } from "@/db";
import { assetProcessingJobs } from "@/db/schema";
import { eq, and, lte, sql } from "drizzle-orm";
import { createChildLogger } from "@/lib/logger";
import { jobWaitlist, type AssetType } from "@/lib/job-waitlist";

const logger = createChildLogger("jobs-api");

const app = new Hono();

/**
 * Atomic job claim query that picks up:
 * - New pending jobs (status = 'pending' or 'retry_pending')
 * - Scheduled jobs that are now ready (scheduled_for <= NOW())
 * - Expired/timed-out jobs (status = 'processing' AND expires_at < NOW())
 *
 * This eliminates the need for a separate stale job detector
 */
async function claimJob(assetType: string, workerId: string) {
  const result = await db.execute(sql`
    UPDATE asset_processing_jobs
    SET
      status = 'processing',
      locked_by = ${workerId},
      locked_at = NOW(),
      expires_at = NOW() + INTERVAL '15 minutes',
      started_at = COALESCE(started_at, NOW()),
      updated_at = NOW()
    WHERE id = (
      SELECT id
      FROM asset_processing_jobs
      WHERE
        asset_type = ${assetType}
        AND (
          -- Pick up new/pending jobs
          (
            (status = 'pending' OR status = 'retry_pending')
            AND (scheduled_for IS NULL OR scheduled_for <= NOW())
          )
          -- Pick up expired/timed-out jobs (lazy reclamation)
          OR (
            status = 'processing'
            AND expires_at < NOW()
            AND retry_count < max_retries
          )
        )
      ORDER BY
        -- Prioritize recovery of expired jobs
        CASE WHEN status = 'processing' THEN 0 ELSE 1 END,
        priority DESC NULLS LAST,
        created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING
      id,
      asset_type,
      asset_id,
      user_id,
      status,
      job_data,
      locked_by,
      locked_at,
      expires_at,
      retry_count,
      max_retries,
      created_at
  `) as any;

  if (!result.rows || result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Fetch next available job for a worker
 * GET /api/jobs/fetch?assetType=bookmarks&workerId=worker-123
 *
 * Uses atomic UPDATE with RETURNING to safely claim a job
 * even with PGlite's single connection (serial execution)
 */
app.get("/fetch", async (c) => {
  const assetType = c.req.query("assetType");
  const workerId = c.req.query("workerId") || "unknown";

  if (!assetType) {
    return c.json({ error: "assetType query parameter is required" }, 400);
  }

  // Validate assetType
  const validAssetTypes = ["bookmarks", "photos", "documents", "notes", "tasks"];
  if (!validAssetTypes.includes(assetType)) {
    return c.json(
      {
        error: `Invalid assetType. Must be one of: ${validAssetTypes.join(", ")}`,
      },
      400,
    );
  }

  try {
    const job = await claimJob(assetType, workerId);

    if (!job) {
      // No jobs available
      return c.json(null);
    }

    logger.info(
      {
        jobId: job.id,
        assetType: job.asset_type,
        assetId: job.asset_id,
        workerId,
      },
      "Job claimed by worker",
    );

    return c.json(job);
  } catch (error) {
    logger.error(
      {
        assetType,
        workerId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Failed to fetch job",
    );

    return c.json(
      {
        error: "Failed to fetch job",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

/**
 * Wait for next available job (long-polling)
 * GET /api/jobs/wait?assetType=bookmarks&workerId=worker-123&timeout=30000
 *
 * This endpoint implements push-based notifications:
 * 1. Try to claim a job immediately
 * 2. If no job available, add worker to in-memory waitlist
 * 3. When a job is enqueued, waiters are notified immediately
 * 4. Returns job or null after timeout
 *
 * This eliminates continuous database polling!
 */
app.get("/wait", async (c) => {
  const assetType = c.req.query("assetType");
  const workerId = c.req.query("workerId") || "unknown";
  const timeoutMs = parseInt(c.req.query("timeout") || "30000", 10);

  if (!assetType) {
    return c.json({ error: "assetType query parameter is required" }, 400);
  }

  // Validate assetType
  const validAssetTypes: AssetType[] = ["bookmarks", "photos", "documents", "notes", "tasks"];
  if (!validAssetTypes.includes(assetType as AssetType)) {
    return c.json(
      {
        error: `Invalid assetType. Must be one of: ${validAssetTypes.join(", ")}`,
      },
      400,
    );
  }

  // Validate timeout (max 60 seconds)
  const maxTimeout = 60000;
  const actualTimeout = Math.min(Math.max(timeoutMs, 1000), maxTimeout);

  try {
    // First, try to claim a job immediately
    const immediateJob = await claimJob(assetType, workerId);

    if (immediateJob) {
      logger.info(
        {
          jobId: immediateJob.id,
          assetType: immediateJob.asset_type,
          assetId: immediateJob.asset_id,
          workerId,
        },
        "Job claimed immediately (no wait)",
      );
      return c.json(immediateJob);
    }

    // No job available - add to waitlist and wait for notification
    logger.debug(
      { assetType, workerId, timeout: actualTimeout },
      "No job available, adding to waitlist",
    );

    // Wait for notification or timeout
    await jobWaitlist.addWaiter(assetType as AssetType, workerId, actualTimeout);

    // After being notified (or timeout), try to claim a job
    const job = await claimJob(assetType, workerId);

    if (job) {
      logger.info(
        {
          jobId: job.id,
          assetType: job.asset_type,
          assetId: job.asset_id,
          workerId,
        },
        "Job claimed after wait",
      );
      return c.json(job);
    }

    // Still no job (another worker claimed it or timeout)
    logger.debug(
      { assetType, workerId },
      "No job available after wait (claimed by another worker or timeout)",
    );
    return c.json(null);
  } catch (error) {
    logger.error(
      {
        assetType,
        workerId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Failed to wait for job",
    );

    return c.json(
      {
        error: "Failed to wait for job",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

/**
 * Extend job lock expiration (heartbeat)
 * POST /api/jobs/:jobId/heartbeat
 * Body: { workerId: "worker-123" }
 *
 * Workers should call this periodically (e.g., every 60 seconds)
 * to keep long-running jobs alive and prevent timeout
 */
app.post("/:jobId/heartbeat", async (c) => {
  const jobId = c.req.param("jobId");
  let workerId: string;

  try {
    const body = await c.req.json();
    workerId = body.workerId;

    if (!workerId) {
      return c.json({ error: "workerId is required in request body" }, 400);
    }
  } catch (error) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  try {
    const result = await db
      .update(assetProcessingJobs)
      .set({
        expiresAt: sql`NOW() + INTERVAL '15 minutes'`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(assetProcessingJobs.id, jobId),
          eq(assetProcessingJobs.lockedBy, workerId),
          eq(assetProcessingJobs.status, "processing"),
        ),
      )
      .returning({ id: assetProcessingJobs.id });

    if (result.length === 0) {
      logger.warn(
        { jobId, workerId },
        "Heartbeat failed: job not found or not locked by this worker",
      );
      return c.json(
        { error: "Job not found or not locked by this worker" },
        404,
      );
    }

    logger.debug({ jobId, workerId }, "Job heartbeat updated");
    return c.json({ success: true });
  } catch (error) {
    logger.error(
      {
        jobId,
        workerId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to update job heartbeat",
    );

    return c.json(
      {
        error: "Failed to update heartbeat",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

/**
 * Reschedule a job (used for rate limiting)
 * POST /api/jobs/:jobId/reschedule
 * Body: { workerId: "worker-123", delayMs: 10000 }
 *
 * Releases the job back to pending state with a scheduledFor timestamp
 * This allows proper rate limiting in database mode
 */
app.post("/:jobId/reschedule", async (c) => {
  const jobId = c.req.param("jobId");
  let workerId: string;
  let delayMs: number;

  try {
    const body = await c.req.json();
    workerId = body.workerId;
    delayMs = body.delayMs || 0;

    if (!workerId) {
      return c.json({ error: "workerId is required in request body" }, 400);
    }

    if (typeof delayMs !== "number" || delayMs < 0) {
      return c.json({ error: "delayMs must be a non-negative number" }, 400);
    }
  } catch (error) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  try {
    // Calculate scheduled time
    const scheduledFor = new Date(Date.now() + delayMs);

    // Release the job back to pending with scheduled time
    const result = await db
      .update(assetProcessingJobs)
      .set({
        status: "pending",
        lockedBy: null,
        lockedAt: null,
        expiresAt: null,
        scheduledFor: scheduledFor,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(assetProcessingJobs.id, jobId),
          eq(assetProcessingJobs.lockedBy, workerId),
          eq(assetProcessingJobs.status, "processing"),
        ),
      )
      .returning({ id: assetProcessingJobs.id });

    if (result.length === 0) {
      logger.warn(
        { jobId, workerId },
        "Reschedule failed: job not found or not locked by this worker",
      );
      return c.json(
        { error: "Job not found or not locked by this worker" },
        404,
      );
    }

    logger.info(
      { jobId, workerId, delayMs, scheduledFor },
      "Job rescheduled for rate limiting",
    );
    return c.json({ success: true, scheduledFor });
  } catch (error) {
    logger.error(
      {
        jobId,
        workerId,
        delayMs,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to reschedule job",
    );

    return c.json(
      {
        error: "Failed to reschedule job",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

/**
 * Get queue statistics
 * GET /api/jobs/stats
 *
 * Returns counts of jobs by status and asset type
 * Useful for monitoring and debugging
 */
app.get("/stats", async (c) => {
  try {
    const result = await db.execute(sql`
      SELECT
        asset_type,
        status,
        COUNT(*) as count
      FROM asset_processing_jobs
      GROUP BY asset_type, status
      ORDER BY asset_type, status
    `) as any;

    const stats: Record<
      string,
      Record<string, number>
    > = {};

    for (const row of result.rows) {
      const assetType = row.asset_type as string;
      const status = row.status as string;
      const count = Number(row.count);

      if (!stats[assetType]) {
        stats[assetType] = {};
      }
      stats[assetType][status] = count;
    }

    return c.json(stats);
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to get queue stats",
    );

    return c.json(
      {
        error: "Failed to get stats",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

export default app;
export { app as jobsRoutes };
