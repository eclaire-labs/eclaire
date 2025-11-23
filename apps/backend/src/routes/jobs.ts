// Job fetch API for database-backed queue mode
// Workers poll these endpoints to fetch and process jobs

import { Hono } from "hono";
import { db, dbCapabilities, schema } from "@/db";

const { assetProcessingJobs } = schema;
import {
	eq,
	and,
	or,
	lte,
	lt,
	inArray,
	isNull,
	sql,
	asc,
	desc,
} from "drizzle-orm";
import { createChildLogger } from "@/lib/logger";
import { jobWaitlist, type AssetType } from "@/lib/job-waitlist";
import {
	getCurrentTimestamp,
	getExpirationTime,
	getScheduledTime,
	formatJobResult,
	type ClaimedJob,
} from "@/lib/db-queue-helpers";

const logger = createChildLogger("jobs-api");

const app = new Hono();

/**
 * Atomic job claim that picks up:
 * - New pending jobs (status = 'pending' or 'retry_pending')
 * - Scheduled jobs that are now ready (scheduled_for <= NOW())
 * - Expired/timed-out jobs (status = 'processing' AND expires_at < NOW())
 *
 * Uses database-specific optimizations:
 * - PostgreSQL/PGlite: FOR UPDATE SKIP LOCKED for optimal concurrency
 * - SQLite: Optimistic locking (SELECT then UPDATE)
 */
async function claimJob(
	assetType: string,
	workerId: string,
): Promise<ClaimedJob | null> {
	if (dbCapabilities.skipLocked) {
		// PostgreSQL/PGlite: Use atomic UPDATE with SKIP LOCKED
		return claimJobPostgres(assetType, workerId);
	} else {
		// SQLite: Use optimistic locking pattern
		return claimJobSqlite(assetType, workerId);
	}
}

/**
 * PostgreSQL/PGlite job claiming with FOR UPDATE SKIP LOCKED
 */
async function claimJobPostgres(
	assetType: string,
	workerId: string,
): Promise<ClaimedJob | null> {
	const now = getCurrentTimestamp();
	const expiresAt = getExpirationTime(15); // 15 minutes

	const [job] = await db
		.update(assetProcessingJobs)
		.set({
			status: "processing",
			lockedBy: workerId,
			lockedAt: now,
			expiresAt: expiresAt,
			startedAt: sql`COALESCE(${assetProcessingJobs.startedAt}, ${now})`,
			updatedAt: now,
		})
		.where(
			eq(
				assetProcessingJobs.id,
				db
					.select({ id: assetProcessingJobs.id })
					.from(assetProcessingJobs)
					.where(
						and(
							eq(
								assetProcessingJobs.assetType,
								assetType as
									| "tasks"
									| "bookmarks"
									| "documents"
									| "photos"
									| "notes",
							),
							or(
								// New/pending jobs ready to process
								and(
									inArray(assetProcessingJobs.status, [
										"pending",
										"retry_pending",
									]),
									or(
										isNull(assetProcessingJobs.scheduledFor),
										lte(assetProcessingJobs.scheduledFor, now),
									),
								),
								// Expired jobs (lazy reclamation)
								and(
									eq(assetProcessingJobs.status, "processing"),
									lt(assetProcessingJobs.expiresAt, now),
									lt(
										assetProcessingJobs.retryCount,
										assetProcessingJobs.maxRetries,
									),
								),
							),
						),
					)
					.orderBy(
						// Prioritize expired jobs for recovery
						sql`CASE WHEN ${assetProcessingJobs.status} = 'processing' THEN 0 ELSE 1 END`,
						desc(assetProcessingJobs.priority),
						asc(assetProcessingJobs.createdAt),
					)
					.limit(1)
					.for("update", { skipLocked: true }),
			),
		)
		.returning();

	return formatJobResult(job);
}

/**
 * SQLite job claiming with optimistic locking
 * Two-step process: SELECT then UPDATE with status verification
 */
async function claimJobSqlite(
	assetType: string,
	workerId: string,
): Promise<ClaimedJob | null> {
	const now = getCurrentTimestamp();
	const expiresAt = getExpirationTime(15); // 15 minutes

	// Step 1: Find a claimable job (read-only, fast)
	const candidates = await db
		.select()
		.from(assetProcessingJobs)
		.where(
			and(
				eq(
					assetProcessingJobs.assetType,
					assetType as "tasks" | "bookmarks" | "documents" | "photos" | "notes",
				),
				or(
					// New/pending jobs ready to process
					and(
						inArray(assetProcessingJobs.status, ["pending", "retry_pending"]),
						or(
							isNull(assetProcessingJobs.scheduledFor),
							lte(assetProcessingJobs.scheduledFor, now),
						),
					),
					// Expired jobs (lazy reclamation)
					and(
						eq(assetProcessingJobs.status, "processing"),
						lt(assetProcessingJobs.expiresAt, now),
						lt(assetProcessingJobs.retryCount, assetProcessingJobs.maxRetries),
					),
				),
			),
		)
		.orderBy(
			// Prioritize expired jobs - SQLite compatible syntax
			sql`CASE WHEN ${assetProcessingJobs.status} = 'processing' THEN 0 ELSE 1 END`,
			sql`${assetProcessingJobs.priority} IS NULL`, // NULLs last
			desc(assetProcessingJobs.priority),
			asc(assetProcessingJobs.createdAt),
		)
		.limit(1);

	if (!candidates.length) {
		return null;
	}

	const candidate = candidates[0];
	if (!candidate) {
		return null;
	}

	// Step 2: Try to claim it (optimistic locking)
	// Only succeeds if job is still in the same state
	const [claimedJob] = await db
		.update(assetProcessingJobs)
		.set({
			status: "processing",
			lockedBy: workerId,
			lockedAt: now,
			expiresAt: expiresAt,
			startedAt: candidate.startedAt || now,
			updatedAt: now,
		})
		.where(
			and(
				eq(assetProcessingJobs.id, candidate.id),
				// Verify job is still in original state (optimistic lock)
				eq(assetProcessingJobs.status, candidate.status),
				or(
					isNull(assetProcessingJobs.lockedBy),
					eq(assetProcessingJobs.lockedBy, candidate.lockedBy || ""),
				),
			),
		)
		.returning();

	// If update failed, another worker claimed it (race condition)
	return formatJobResult(claimedJob);
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
		const now = getCurrentTimestamp();
		const newExpiresAt = getExpirationTime(15); // 15 minutes

		const result = await db
			.update(assetProcessingJobs)
			.set({
				expiresAt: newExpiresAt,
				updatedAt: now,
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
		const now = getCurrentTimestamp();
		const scheduledFor = getScheduledTime(delayMs);

		// Release the job back to pending with scheduled time
		const result = await db
			.update(assetProcessingJobs)
			.set({
				status: "pending",
				lockedBy: null,
				lockedAt: null,
				expiresAt: null,
				scheduledFor: scheduledFor,
				updatedAt: now,
			})
			.where(
				and(
					eq(assetProcessingJobs.id, jobId),
					eq(assetProcessingJobs.lockedBy, workerId),
					eq(assetProcessingJobs.status, "processing"),
				),
			)
			.returning({ id: assetProcessingJobs.id, assetType: assetProcessingJobs.assetType });

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

		// Wake up waiting workers appropriately based on schedule
		const assetType = result[0]!.assetType as AssetType;
		if (delayMs === 0) {
			// Job is ready immediately, notify waiting workers now
			jobWaitlist.notifyWaiters(assetType);
		} else {
			// Job scheduled for future, arm the timer to wake workers when ready
			jobWaitlist.scheduleNextWakeup(assetType);
		}

    logger.info(
      { jobId, workerId, delayMs, scheduledFor, assetType },
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
		const results = await db
			.select({
				asset_type: assetProcessingJobs.assetType,
				status: assetProcessingJobs.status,
				count: sql<number>`count(*)`.as("count"),
			})
			.from(assetProcessingJobs)
			.groupBy(assetProcessingJobs.assetType, assetProcessingJobs.status)
			.orderBy(assetProcessingJobs.assetType, assetProcessingJobs.status);

		const stats: Record<string, Record<string, number>> = {};

		for (const row of results) {
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
