import type { Queue } from "bullmq";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { db, schema, txManager } from "../../db/index.js";
const {
  assetProcessingJobs,
  bookmarks,
  documents,
  notes,
  photos,
  tasks,
} = schema;
import { publishProcessingEvent } from "../../routes/processing-events.js";
import type { AssetType, ProcessingStatus } from "../../types/assets.js";
import { createChildLogger } from "../logger.js";
import { getQueue, QueueNames } from "../queues.js";
import { processArtifacts } from "./artifact-processor.js";

const logger = createChildLogger("processing-status");

export interface ProcessingStage {
  name: string;
  status: ProcessingStatus;
  progress: number; // 0-100
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface ProcessingJobDetails {
  id: string;
  assetType: AssetType;
  assetId: string;
  userId: string;
  status: ProcessingStatus;
  stages: ProcessingStage[];
  currentStage?: string;
  overallProgress: number;
  errorMessage?: string;
  errorDetails?: any;
  retryCount: number;
  maxRetries: number;
  canRetry: boolean;
  nextRetryAt?: number;
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProcessingSummary {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  retryPending: number;
  totalActive: number;
}

/**
 * Creates or updates a processing job for an asset
 */
export async function createOrUpdateProcessingJob(
  assetType: AssetType,
  assetId: string,
  userId: string,
  initialStages: string[] = [],
  jobType?: string,
): Promise<ProcessingJobDetails> {
  try {
    // For tasks with multiple job types, filter by jobType too
    const whereConditions = [
      eq(assetProcessingJobs.assetType, assetType),
      eq(assetProcessingJobs.assetId, assetId),
    ];
    if (jobType && assetType === "tasks") {
      whereConditions.push(eq(assetProcessingJobs.jobType, jobType));
    }
    const existingJob = await db.query.assetProcessingJobs.findFirst({
      where: and(...whereConditions),
    });

    const stages: ProcessingStage[] = initialStages.map((stageName) => ({
      name: stageName,
      status: "pending" as ProcessingStatus,
      progress: 0,
    }));

    if (existingJob) {
      const [updatedJob] = await db
        .update(assetProcessingJobs)
        .set({
          status: "pending",
          stages: stages,
          currentStage: null, // <-- FIX 1: Set to null for pending status
          overallProgress: 0,
          errorMessage: null,
          errorDetails: null,
          retryCount: 0,
          startedAt: null,
          completedAt: null, // Ensure this is also reset on retry/re-initialization
          updatedAt: new Date(),
        })
        .where(eq(assetProcessingJobs.id, existingJob.id))
        .returning();

      const formattedJob = formatJobDetails(updatedJob);

      // Publish SSE event for job creation/reset with full data
      try {
        const summary = await getUserProcessingSummary(userId);
        await publishProcessingEvent(userId, {
          type: "job_update",
          payload: {
            job: formattedJob,
            summary,
          },
        });
      } catch (error) {
        logger.warn(
          { assetType, assetId, userId, error },
          "Failed to publish SSE event for job update",
        );
      }

      return formattedJob;
    } else {
      // Use INSERT with ON CONFLICT to handle race conditions
      const [newJob] = await db
        .insert(assetProcessingJobs)
        .values({
          assetType,
          assetId,
          userId,
          jobType: jobType ?? "processing",
          status: "pending",
          stages: stages,
          currentStage: null,
          overallProgress: 0,
          retryCount: 0,
          maxRetries: 3,
        })
        .onConflictDoUpdate({
          target: [assetProcessingJobs.assetType, assetProcessingJobs.assetId, assetProcessingJobs.jobType],
          set: {
            status: "pending",
            stages: stages,
            currentStage: null,
            overallProgress: 0,
            retryCount: 0,
            errorMessage: null,
            errorDetails: null,
            startedAt: null,
            completedAt: null,
            // updatedAt removed - handled by schema defaults
          },
        })
        .returning();

      const formattedJob = formatJobDetails(newJob);

      // Publish SSE event for new job creation with full data
      try {
        const summary = await getUserProcessingSummary(userId);
        await publishProcessingEvent(userId, {
          type: "job_created",
          payload: {
            job: formattedJob,
            summary,
          },
        });
      } catch (error) {
        logger.warn(
          { assetType, assetId, userId, error },
          "Failed to publish SSE event for new job",
        );
      }

      return formattedJob;
    }
  } catch (error) {
    logger.error(
      {
        assetType,
        assetId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to create/update processing job",
    );
    throw error;
  }
}

/**
 * Adds new stages to an existing processing job
 */
export async function addStagesToProcessingJob(
  assetType: AssetType,
  assetId: string,
  newStages: string[],
): Promise<ProcessingJobDetails | null> {
  try {
    const job = await db.query.assetProcessingJobs.findFirst({
      where: and(
        eq(assetProcessingJobs.assetType, assetType),
        eq(assetProcessingJobs.assetId, assetId),
      ),
    });

    if (!job) {
      logger.warn(
        { assetType, assetId },
        "Processing job not found for adding stages",
      );
      return null;
    }

    const existingStages: ProcessingStage[] =
      (job.stages as ProcessingStage[]) || [];

    // Add new stages as pending
    const stagesToAdd: ProcessingStage[] = newStages.map((stageName) => ({
      name: stageName,
      status: "pending" as ProcessingStatus,
      progress: 0,
    }));

    // Combine existing and new stages
    const updatedStages = [...existingStages, ...stagesToAdd];

    const [updatedJob] = await db
      .update(assetProcessingJobs)
      .set({
        stages: updatedStages,
        updatedAt: new Date(),
      })
      .where(eq(assetProcessingJobs.id, job.id))
      .returning();

    logger.info(
      {
        assetType,
        assetId,
        newStages,
        totalStages: updatedStages.length,
      },
      "Added new stages to processing job",
    );

    return formatJobDetails(updatedJob);
  } catch (error) {
    logger.error(
      {
        assetType,
        assetId,
        newStages,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to add stages to processing job",
    );
    throw error;
  }
}

export async function updateProcessingJobStatus(
  assetType: AssetType,
  assetId: string,
  status: ProcessingStatus,
  stage?: string,
  progress?: number,
  error?: string,
  errorDetails?: any,
  addStages?: string[],
  jobType?: string,
): Promise<ProcessingJobDetails | null> {
  try {
    // 1. Fetch the current state of the job BEFORE transaction.
    // NOTE: This introduces a small race condition window, but it's necessary
    // for SQLite compatibility. The transaction still ensures atomicity of the update itself.
    // For tasks with multiple job types, filter by jobType too
    const whereConditions = [
      eq(assetProcessingJobs.assetType, assetType),
      eq(assetProcessingJobs.assetId, assetId),
    ];
    if (jobType && assetType === "tasks") {
      whereConditions.push(eq(assetProcessingJobs.jobType, jobType));
    }
    const job = await db.query.assetProcessingJobs.findFirst({
      where: and(...whereConditions),
    });

    if (!job) {
      logger.warn(
        { assetType, assetId },
        "Processing job not found for status update",
      );
      return null;
    }

    // 2. Prepare data structures for the update.
    const existingStages: ProcessingStage[] =
      (job.stages as ProcessingStage[]) || [];
    const now = Math.floor(Date.now() / 1000);
    const nowDate = new Date();

    // Initialize updateData with a flexible type to handle SQL expressions
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    // 3. (RACE CONDITION FIX) Handle adding new stages first, if requested.
    // This logic runs before any other status update, ensuring the stage list is
    // up-to-date within the same transaction.
    if (addStages && addStages.length > 0) {
      const stagesToAdd: ProcessingStage[] = addStages
        // Filter out stages that might already exist to be safe
        .filter((newName) => !existingStages.some((s) => s.name === newName))
        .map((stageName) => ({
          name: stageName,
          status: "pending",
          progress: 0,
        }));

      if (stagesToAdd.length > 0) {
        existingStages.push(...stagesToAdd);
      }
    }

    // 4. Update the specific stage's details if a 'stage' is provided in the call.
    if (stage) {
      const stageIndex = existingStages.findIndex((s) => s.name === stage);

      // This check is important for the race condition fix.
      // The stage now exists in `existingStages` because step 3 ran first.
      if (stageIndex >= 0) {
        const stageToUpdate = existingStages[stageIndex];
        if (!stageToUpdate) {
          logger.error(
            { assetType, assetId, stage, stageIndex },
            "Stage found by index but is undefined",
          );
          return null;
        }

        stageToUpdate.status = status;
        stageToUpdate.progress = progress ?? stageToUpdate.progress;
        if (error) stageToUpdate.error = error;

        // Set stage-specific timestamps
        if (status === "processing" && !stageToUpdate.startedAt) {
          stageToUpdate.startedAt = now;
        }
        if (["completed", "failed"].includes(status)) {
          stageToUpdate.completedAt = now;
        }
      } else {
        logger.warn(
          { assetType, assetId, stage },
          "Attempted to update a stage that does not exist in the job's stage list.",
        );
      }

      // The job's current stage is the one being actively updated.
      updateData.currentStage = stage;
    }

    // 5. Determine the overall job status and manage job-level timestamps.
    if (status === "failed") {
      // If any stage fails, the entire job fails.
      updateData.status = "failed";
      updateData.completedAt = nowDate; // A failed job is also a completed job.
      updateData.currentStage = stage || job.currentStage; // Keep context of what failed.
      updateData.errorMessage = error || null;
      updateData.errorDetails = errorDetails || null;
    } else if (status === "completed" && !stage) {
      // This block handles a 'completeJob()' call (no specific stage).
      updateData.status = "completed";
      updateData.completedAt = nowDate;
      updateData.currentStage = null; // No current stage when the job is fully done.
      updateData.overallProgress = 100;
      // Mark any pending stages as completed as well
      for (const s of existingStages) {
        if (s.status !== "completed") {
          s.status = "completed";
          s.progress = 100;
          if (!s.completedAt) s.completedAt = now;
        }
      }
    } else {
      // Any other update (e.g., stage 'processing', stage 'completed') means the job is 'processing'.
      updateData.status = "processing";
      updateData.completedAt = null; // (PREMATURE `completedAt` FIX) Explicitly nullify on processing.
      if (!job.startedAt) {
        updateData.startedAt = nowDate;
      }
    }

    // 6. Recalculate overall progress and finalize the update payload.
    updateData.stages = existingStages;
    if (updateData.status !== "completed") {
      // Avoid overwriting 100% on final completion
      updateData.overallProgress =
        existingStages.length > 0
          ? Math.round(
              existingStages.reduce((sum, s) => sum + (s.progress || 0), 0) /
                existingStages.length,
            )
          : (progress ?? job.overallProgress ?? 0);
    }

    // 7. Filter out undefined values to prevent SQL syntax errors
    const cleanUpdateData: Record<string, any> = {};
    for (const [key, value] of Object.entries(updateData)) {
      if (value !== undefined) {
        cleanUpdateData[key] = value;
      }
    }

    logger.debug(
      { assetType, assetId, cleanUpdateData },
      "About to update processing job with cleaned data",
    );

    // 8. Execute transaction to commit all collected changes
    let updatedJob: any;
    await txManager.withTransaction(async (tx) => {
      await tx.assetProcessingJobs.update(
        eq(assetProcessingJobs.id, job.id),
        cleanUpdateData
      );
    });

    // 9. Fetch the updated job to return (since we can't use .returning() in sync transaction)
    updatedJob = await db.query.assetProcessingJobs.findFirst({
      where: eq(assetProcessingJobs.id, job.id),
    });

    if (!updatedJob) {
      return null;
    }

    const formattedJob = formatJobDetails(updatedJob);

    // Publish SSE event for status update with full data
    try {
      const summary = await getUserProcessingSummary(updatedJob.userId);

      let eventType = "job_update";
      if (formattedJob.status === "completed") {
        eventType = "job_completed";
      } else if (formattedJob.status === "failed") {
        eventType = "job_failed";
      } else if (stage) {
        eventType = "stage_update";
      }

      await publishProcessingEvent(updatedJob.userId, {
        type: eventType,
        payload: {
          job: formattedJob,
          summary,
        },
      });
    } catch (sseError) {
      logger.warn(
        { assetType, assetId, userId: updatedJob.userId, sseError },
        "Failed to publish SSE event for status update",
      );
    }

    return formattedJob;
  } catch (error) {
    logger.error(
      {
        assetType,
        assetId,
        status,
        stage,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Failed to update processing job status",
    );
    throw error;
  }
}

/**
 * Gets processing job details for an asset
 */
export async function getProcessingJob(
  assetType: AssetType,
  assetId: string,
  userId: string,
  jobType?: string,
): Promise<ProcessingJobDetails | null> {
  try {
    // For tasks with multiple job types, filter by jobType too
    const whereConditions = [
      eq(assetProcessingJobs.assetType, assetType),
      eq(assetProcessingJobs.assetId, assetId),
      eq(assetProcessingJobs.userId, userId),
    ];
    if (jobType && assetType === "tasks") {
      whereConditions.push(eq(assetProcessingJobs.jobType, jobType));
    }
    const job = await db.query.assetProcessingJobs.findFirst({
      where: and(...whereConditions),
    });

    return job ? formatJobDetails(job) : null;
  } catch (error) {
    logger.error(
      {
        assetType,
        assetId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to get processing job",
    );
    throw error;
  }
}

/**
 * Gets processing summary for a user
 */
export async function getUserProcessingSummary(
  userId: string,
): Promise<ProcessingSummary> {
  //logger.debug({ userId }, "getUserProcessingSummary called");

  try {
    //logger.debug({ userId }, "Executing database query for processing jobs");

    // Use the same filtering logic as getUserProcessingJobs to exclude disabled assets
    const jobs = await db
      .select({
        status: assetProcessingJobs.status,
      })
      .from(assetProcessingJobs)
      .leftJoin(
        photos,
        and(
          eq(assetProcessingJobs.assetType, "photos"),
          eq(assetProcessingJobs.assetId, photos.id),
        ),
      )
      .leftJoin(
        documents,
        and(
          eq(assetProcessingJobs.assetType, "documents"),
          eq(assetProcessingJobs.assetId, documents.id),
        ),
      )
      .leftJoin(
        bookmarks,
        and(
          eq(assetProcessingJobs.assetType, "bookmarks"),
          eq(assetProcessingJobs.assetId, bookmarks.id),
        ),
      )
      .leftJoin(
        notes,
        and(
          eq(assetProcessingJobs.assetType, "notes"),
          eq(assetProcessingJobs.assetId, notes.id),
        ),
      )
      .leftJoin(
        tasks,
        and(
          eq(assetProcessingJobs.assetType, "tasks"),
          eq(assetProcessingJobs.assetId, tasks.id),
        ),
      )
      .where(
        and(
          eq(assetProcessingJobs.userId, userId),
          // Only include jobs for enabled assets
          or(
            and(
              eq(assetProcessingJobs.assetType, "photos"),
              photos.enabled,
            ),
            and(
              eq(assetProcessingJobs.assetType, "documents"),
              documents.enabled,
            ),
            and(
              eq(assetProcessingJobs.assetType, "bookmarks"),
              bookmarks.enabled,
            ),
            and(
              eq(assetProcessingJobs.assetType, "notes"),
              notes.enabled,
            ),
            and(
              eq(assetProcessingJobs.assetType, "tasks"),
              tasks.enabled,
            ),
          ),
        ),
      );

    // logger.info(
    //   {
    //     userId,
    //     jobCount: jobs.length,
    //     jobs,
    //   },
    //   "Database query completed for processing summary",
    // );

    const summary: ProcessingSummary = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      retryPending: 0,
      totalActive: 0,
    };

    for (const job of jobs) {
      //logger.debug({ userId, jobStatus: job.status }, "Processing job status");

      switch (job.status) {
        case "pending":
          summary.pending++;
          summary.totalActive++;
          break;
        case "processing":
          summary.processing++;
          summary.totalActive++;
          break;
        case "completed":
          summary.completed++;
          break;
        case "failed":
          summary.failed++;
          break;
        case "retry_pending":
          summary.retryPending++;
          summary.totalActive++;
          break;
        default:
          logger.warn(
            {
              userId,
              unknownStatus: job.status,
            },
            "Unknown job status encountered",
          );
      }
    }

    // logger.info(
    //   {
    //     userId,
    //     summary,
    //   },
    //   "Processing summary calculated successfully",
    // );

    return summary;
  } catch (error) {
    logger.error(
      {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        errorName: error instanceof Error ? error.name : "Unknown",
      },
      "Failed to get user processing summary",
    );
    throw error;
  }
}

/**
 * Get all processing jobs for a user with optional filtering
 */
export async function getUserProcessingJobs(
  userId: string,
  filters: {
    status?: ProcessingStatus;
    assetType?: AssetType;
    search?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<ProcessingJobDetails[]> {
  logger.debug({ userId, filters }, "getUserProcessingJobs called");

  try {
    const { status, assetType, search, limit = 100, offset = 0 } = filters;

    // Build where conditions
    const conditions = [eq(assetProcessingJobs.userId, userId)];

    if (status) {
      conditions.push(eq(assetProcessingJobs.status, status));
    }

    if (assetType) {
      conditions.push(eq(assetProcessingJobs.assetType, assetType));
    }

    if (search) {
      conditions.push(like(assetProcessingJobs.assetId, `%${search}%`));
    }

    logger.debug(
      {
        userId,
        conditionsCount: conditions.length,
        parsedFilters: { status, assetType, search, limit, offset },
      },
      "Built query conditions for processing jobs",
    );

    logger.debug(
      { userId },
      "Executing database query for user processing jobs",
    );

    // We need to use db.select with joins to filter by enabled status
    // since we need to join with multiple asset tables based on assetType
    const jobs = await db
      .select({
        id: assetProcessingJobs.id,
        assetType: assetProcessingJobs.assetType,
        assetId: assetProcessingJobs.assetId,
        userId: assetProcessingJobs.userId,
        status: assetProcessingJobs.status,
        stages: assetProcessingJobs.stages,
        currentStage: assetProcessingJobs.currentStage,
        overallProgress: assetProcessingJobs.overallProgress,
        errorMessage: assetProcessingJobs.errorMessage,
        errorDetails: assetProcessingJobs.errorDetails,
        retryCount: assetProcessingJobs.retryCount,
        maxRetries: assetProcessingJobs.maxRetries,
        nextRetryAt: assetProcessingJobs.nextRetryAt,
        startedAt: assetProcessingJobs.startedAt,
        completedAt: assetProcessingJobs.completedAt,
        createdAt: assetProcessingJobs.createdAt,
        updatedAt: assetProcessingJobs.updatedAt,
      })
      .from(assetProcessingJobs)
      .leftJoin(
        photos,
        and(
          eq(assetProcessingJobs.assetType, "photos"),
          eq(assetProcessingJobs.assetId, photos.id),
        ),
      )
      .leftJoin(
        documents,
        and(
          eq(assetProcessingJobs.assetType, "documents"),
          eq(assetProcessingJobs.assetId, documents.id),
        ),
      )
      .leftJoin(
        bookmarks,
        and(
          eq(assetProcessingJobs.assetType, "bookmarks"),
          eq(assetProcessingJobs.assetId, bookmarks.id),
        ),
      )
      .leftJoin(
        notes,
        and(
          eq(assetProcessingJobs.assetType, "notes"),
          eq(assetProcessingJobs.assetId, notes.id),
        ),
      )
      .leftJoin(
        tasks,
        and(
          eq(assetProcessingJobs.assetType, "tasks"),
          eq(assetProcessingJobs.assetId, tasks.id),
        ),
      )
      .where(
        and(
          ...conditions,
          // Only include jobs for enabled assets
          or(
            and(
              eq(assetProcessingJobs.assetType, "photos"),
              photos.enabled,
            ),
            and(
              eq(assetProcessingJobs.assetType, "documents"),
              documents.enabled,
            ),
            and(
              eq(assetProcessingJobs.assetType, "bookmarks"),
              bookmarks.enabled,
            ),
            and(
              eq(assetProcessingJobs.assetType, "notes"),
              notes.enabled,
            ),
            and(
              eq(assetProcessingJobs.assetType, "tasks"),
              tasks.enabled,
            ),
          ),
        ),
      )
      .orderBy(desc(assetProcessingJobs.createdAt))
      .limit(limit)
      .offset(offset);

    logger.info(
      {
        userId,
        jobCount: jobs.length,
        rawJobs: jobs,
      },
      "Database query completed for user processing jobs",
    );

    const formattedJobs = jobs.map(formatJobDetails);

    logger.info(
      {
        userId,
        formattedJobCount: formattedJobs.length,
      },
      "Successfully formatted processing jobs",
    );

    return formattedJobs;
  } catch (error) {
    logger.error(
      {
        userId,
        filters,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        errorName: error instanceof Error ? error.name : "Unknown",
      },
      "Failed to get user processing jobs",
    );
    throw error;
  }
}

/**
 * Unified function to update processing status with optional artifacts.
 * This function handles the complete flow: job initialization, artifacts processing, and status updates.
 * Used by both HTTP routes (workers) and in-process jobs (backend processing reporter).
 */
export async function updateProcessingStatusWithArtifacts(
  assetType: AssetType,
  assetId: string,
  userId: string,
  options: {
    status?: ProcessingStatus;
    stage?: string;
    progress?: number;
    error?: string;
    errorDetails?: any;
    stages?: string[]; // For job initialization
    addStages?: string[];
    artifacts?: Record<string, any>;
    jobType?: string; // For tasks with multiple job types (tag_generation, execution)
  },
): Promise<ProcessingJobDetails | null> {
  try {
    const {
      status,
      stage,
      progress,
      error,
      errorDetails,
      stages,
      addStages,
      artifacts,
      jobType,
    } = options;

    logger.debug(
      {
        assetType,
        assetId,
        userId,
        status,
        stage,
        hasArtifacts: !!artifacts,
      },
      "Processing status update with artifacts",
    );

    // 1. Handle Job Initialization
    if (stages && Array.isArray(stages)) {
      await createOrUpdateProcessingJob(assetType, assetId, userId, stages, jobType);
    }

    // 2. Handle Artifacts Processing
    if (artifacts && Object.keys(artifacts).length > 0) {
      logger.debug(
        { assetType, assetId },
        "Processing artifacts before status update",
      );
      await processArtifacts(assetType, assetId, artifacts);
    }

    // 3. Update Processing Status (only if status is provided)
    if (status) {
      const job = await updateProcessingJobStatus(
        assetType,
        assetId,
        status,
        stage,
        progress,
        error,
        errorDetails,
        addStages,
        jobType,
      );

      if (!job) {
        logger.warn(
          { assetType, assetId, userId },
          "Processing job not found for status update",
        );
        return null;
      }

      logger.info(
        { assetType, assetId, userId, status, stage },
        "Successfully updated processing status with artifacts",
      );

      return job;
    }

    // If no status update is needed, just return the current job
    return await getProcessingJob(assetType, assetId, userId, jobType);
  } catch (error) {
    logger.error(
      {
        assetType,
        assetId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Failed to update processing status with artifacts",
    );
    throw error;
  }
}

/**
 * Retries a failed processing job
 */
export async function retryAssetProcessing(
  assetType: AssetType,
  assetId: string,
  userId: string,
  force: boolean = false,
): Promise<{ success: boolean; error?: string }> {
  try {
    // For photos, use the enhanced retry logic that includes job state checking
    if (assetType === "photos") {
      if (force) {
        // Force mode: try to remove running jobs and restart
        const imageQueue = getQueue(QueueNames.IMAGE_PROCESSING);

        if (imageQueue) {
          // Force remove any existing jobs
          const imageJob = await imageQueue.getJob(assetId);

          if (imageJob) {
            try {
              await imageJob.remove();
              logger.info(
                { assetId, jobId: imageJob.id },
                "Force removed image conversion job",
              );
            } catch (removeError) {
              logger.warn(
                { assetId, removeError },
                "Could not remove image job (may not exist)",
              );
            }
          }
        }
      }

      // Use the safe photo retry logic
      return await retryPhotoProcessing(assetId, userId);
    }

    // For bookmarks, use the enhanced retry logic that includes job state checking
    if (assetType === "bookmarks") {
      if (force) {
        // Force mode: try to remove running jobs and restart
        const bookmarkQueue = getQueue(QueueNames.BOOKMARK_PROCESSING);

        if (bookmarkQueue) {
          // Force remove any existing job
          const existingJob = await bookmarkQueue.getJob(assetId);

          if (existingJob) {
            try {
              await existingJob.remove();
              logger.info(
                { assetId, jobId: existingJob.id },
                "Force removed bookmark processing job",
              );
            } catch (removeError) {
              logger.warn(
                { assetId, removeError },
                "Could not remove bookmark job (may not exist)",
              );
            }
          }
        }
      }

      // Use the safe bookmark retry logic
      return await retryBookmarkProcessing(assetId, userId);
    }

    // For notes, use the enhanced retry logic that includes job state checking
    if (assetType === "notes") {
      if (force) {
        // Force mode: try to remove running jobs and restart
        const noteQueue = getQueue(QueueNames.NOTE_PROCESSING);

        if (noteQueue) {
          // Force remove any existing job
          const existingJob = await noteQueue.getJob(assetId);

          if (existingJob) {
            try {
              await existingJob.remove();
              logger.info(
                { assetId, jobId: existingJob.id },
                "Force removed note processing job",
              );
            } catch (removeError) {
              logger.warn(
                { assetId, removeError },
                "Could not remove note job (may not exist)",
              );
            }
          }
        }
      }

      // Use the safe note retry logic
      return await retryNoteProcessing(assetId, userId);
    }

    if (assetType === "tasks") {
      if (force) {
        // Force mode: try to remove running jobs and restart
        const taskQueue = getQueue(QueueNames.TASK_PROCESSING);

        if (taskQueue) {
          // Force remove any existing job
          const existingJob = await taskQueue.getJob(assetId);

          if (existingJob) {
            try {
              await existingJob.remove();
              logger.info(
                { assetId, jobId: existingJob.id },
                "Force removed task processing job",
              );
            } catch (removeError) {
              logger.warn(
                { assetId, removeError },
                "Could not remove task job (may not exist)",
              );
            }
          }
        }
      }

      // Use the safe task retry logic
      return await retryTaskProcessing(assetId, userId);
    }

    // For documents, use the enhanced retry logic that includes job state checking
    if (assetType === "documents") {
      if (force) {
        // Force mode: try to remove running jobs from document processing queue
        const documentQueue = getQueue(QueueNames.DOCUMENT_PROCESSING);

        if (documentQueue) {
          try {
            const existingJob = await documentQueue.getJob(assetId);
            if (existingJob) {
              await existingJob.remove();
              logger.info(
                { assetId, jobId: existingJob.id },
                "Force removed document processing job",
              );
            }
          } catch (removeError) {
            logger.warn(
              { assetId, removeError },
              "Could not remove document job (may not exist)",
            );
          }
        }
      }

      // Use the safe document retry logic
      return await retryDocumentProcessing(assetId, userId);
    }

    // For other asset types, use the legacy approach for now
    const job = await db.query.assetProcessingJobs.findFirst({
      where: and(
        eq(assetProcessingJobs.assetType, assetType),
        eq(assetProcessingJobs.assetId, assetId),
        eq(assetProcessingJobs.userId, userId),
      ),
    });

    if (!job) {
      return { success: false, error: "Processing job not found" };
    }

    // Check status restrictions unless force is enabled
    if (!force) {
      if (job.status !== "failed") {
        return { success: false, error: "Job is not in failed state" };
      }

      if ((job.retryCount || 0) >= (job.maxRetries || 3)) {
        return { success: false, error: "Maximum retries exceeded" };
      }
    }

    // Reset job for retry
    const stages: ProcessingStage[] = (job.stages as ProcessingStage[]) || [];
    const resetStages = stages.map((stage) => ({
      ...stage,
      status: "pending" as ProcessingStatus,
      progress: 0,
      startedAt: undefined,
      completedAt: undefined,
      error: undefined,
    }));

    const newRetryCount = force ? 0 : (job.retryCount || 0) + 1;

    await db
      .update(assetProcessingJobs)
      .set({
        status: "retry_pending",
        stages: resetStages,
        currentStage: resetStages[0]?.name,
        overallProgress: 0,
        retryCount: newRetryCount,
        errorMessage: null,
        errorDetails: null,
        startedAt: null,
        completedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(assetProcessingJobs.id, job.id));

    // Queue the appropriate job based on asset type
    const queueResult = await queueRetryJob(assetType, assetId, userId);

    if (!queueResult.success) {
      // Revert status if queueing failed
      await db
        .update(assetProcessingJobs)
        .set({
          status: job.status, // Revert to original status
          updatedAt: new Date(),
        })
        .where(eq(assetProcessingJobs.id, job.id));

      return { success: false, error: queueResult.error };
    }

    logger.info(
      {
        assetType,
        assetId,
        userId,
        retryCount: newRetryCount,
        force,
      },
      force
        ? "Successfully queued processing re-run"
        : "Successfully queued processing retry",
    );

    return { success: true };
  } catch (error) {
    logger.error(
      {
        assetType,
        assetId,
        userId,
        force,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to retry asset processing",
    );
    return { success: false, error: "Internal server error" };
  }
}

/**
 * Resets processing job state completely by deleting the existing job record
 */
async function resetProcessingJobState(
  assetType: AssetType,
  assetId: string,
  userId: string,
): Promise<void> {
  try {
    // Delete existing processing job record completely
    await db
      .delete(assetProcessingJobs)
      .where(
        and(
          eq(assetProcessingJobs.assetType, assetType),
          eq(assetProcessingJobs.assetId, assetId),
        ),
      );

    logger.info(
      { assetType, assetId, userId },
      "Reset processing job state - deleted existing job record",
    );
  } catch (error) {
    logger.error(
      {
        assetType,
        assetId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to reset processing job state",
    );
    throw error;
  }
}

/**
 * Gets the appropriate queue for an asset type
 */
function getQueueForAssetType(assetType: AssetType): Queue | null {
  switch (assetType) {
    case "photos":
      return getQueue(QueueNames.IMAGE_PROCESSING);
    case "documents":
      return getQueue(QueueNames.DOCUMENT_PROCESSING);
    case "bookmarks":
      return getQueue(QueueNames.BOOKMARK_PROCESSING);
    case "notes":
      return getQueue(QueueNames.NOTE_PROCESSING);
    case "tasks":
      return getQueue(QueueNames.TASK_PROCESSING);
    default:
      return null;
  }
}

/**
 * Safely retries photo processing with proper job state management
 */
async function retryPhotoProcessing(
  assetId: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Reset processing state
    await resetProcessingJobState("photos", assetId, userId);

    // Get photo details to determine job requirements
    const { schema } = await import("../../db/index.js");
    const { photos } = schema;
    const { eq, and } = await import("drizzle-orm");

    const photo = await db.query.photos.findFirst({
      columns: {
        id: true,
        userId: true,
        storageId: true,
        mimeType: true,
        originalMimeType: true,
        originalFilename: true,
      },
      where: and(eq(photos.id, assetId), eq(photos.userId, userId)),
    });

    if (!photo) {
      return { success: false, error: "Photo not found" };
    }

    // Queue unified image processing job using Queue Adapter (supports both Redis and Database backends)
    const { getQueueAdapter } = await import("../queue-adapter.js");
    const queueAdapter = await getQueueAdapter();

    await queueAdapter.enqueueImage({
      imageId: assetId,
      photoId: assetId,
      storageId: photo.storageId || undefined,
      mimeType: photo.mimeType || photo.originalMimeType || undefined,
      userId: userId,
      originalFilename: photo.originalFilename || undefined,
    });

    logger.info(
      { assetId, userId },
      "Queued unified image processing job for retry",
    );

    return { success: true };
  } catch (error) {
    logger.error(
      {
        assetId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to retry photo processing",
    );
    return { success: false, error: "Failed to retry photo processing" };
  }
}

/**
 * Queues a retry job based on asset type
 */
async function queueRetryJob(
  assetType: AssetType,
  assetId: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  // Import necessary modules for document lookup
  const { schema } = await import("../../db/index.js");
  const { documents } = schema;
  const { eq, and } = await import("drizzle-orm");
  try {
    switch (assetType) {
      case "photos": {
        // Use the new safe photo retry logic
        return await retryPhotoProcessing(assetId, userId);
      }
      case "documents": {
        // Get document details to understand current state and reset statuses
        const document = await db.query.documents.findFirst({
          where: and(eq(documents.id, assetId), eq(documents.userId, userId)),
        });

        if (!document) {
          logger.warn(
            { assetId, userId, assetType },
            "Document not found for retry",
          );
          return { success: false, error: "Document not found" };
        }

        // Reset processing statuses before retry
        await db
          .update(documents)
          .set({
            // Note: Reset document processing fields if they exist in schema
            updatedAt: new Date(),
          })
          .where(eq(documents.id, assetId));

        logger.info(
          { assetId, userId, assetType },
          "Reset document processing statuses for retry",
        );

        // Queue document processing job (matches normal flow in documents.ts)
        const documentProcessingQueue = getQueue(
          QueueNames.DOCUMENT_PROCESSING,
        );
        if (documentProcessingQueue) {
          await documentProcessingQueue.add("processDocument", {
            documentId: assetId,
            storageId: document.storageId,
            mimeType:
              document.originalMimeType ||
              document.mimeType ||
              "application/pdf",
            userId: userId,
            originalFilename:
              document.originalFilename || `document-${assetId}`,
          });
          logger.info(
            { assetId, userId },
            "Queued document processing job for retry",
          );
        } else {
          logger.error(
            { assetId, userId },
            "Failed to get document processing queue for retry",
          );
        }

        break;
      }
      case "bookmarks": {
        // Use the new safe bookmark retry logic instead of legacy approach
        return await retryBookmarkProcessing(assetId, userId);
      }
      case "notes": {
        // Use the new safe note retry logic instead of legacy approach
        return await retryNoteProcessing(assetId, userId);
      }
      case "tasks": {
        // Use the new safe task retry logic instead of legacy approach
        return await retryTaskProcessing(assetId, userId);
      }
      default:
        return { success: false, error: "Unknown asset type" };
    }

    return { success: true };
  } catch (error) {
    logger.error(
      {
        assetType,
        assetId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to queue retry job",
    );
    return { success: false, error: "Failed to queue retry job" };
  }
}

/**
 * Safely retries bookmark processing with proper job state management
 */
async function retryBookmarkProcessing(
  assetId: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Reset processing state
    await resetProcessingJobState("bookmarks", assetId, userId);

    // Get bookmark details to determine job requirements
    const { schema } = await import("../../db/index.js");
    const { bookmarks } = schema;
    const { eq, and } = await import("drizzle-orm");

    const bookmark = await db.query.bookmarks.findFirst({
      where: and(eq(bookmarks.id, assetId), eq(bookmarks.userId, userId)),
    });

    if (!bookmark) {
      return { success: false, error: "Bookmark not found" };
    }

    // Queue new bookmark processing job using Queue Adapter (supports both Redis and Database backends)
    const { getQueueAdapter } = await import("../queue-adapter.js");
    const queueAdapter = await getQueueAdapter();

    await queueAdapter.enqueueBookmark({
      bookmarkId: assetId,
      url: bookmark.originalUrl,
      userId: userId,
    });

    logger.info(
      { assetId, userId },
      "Queued bookmark processing job for retry",
    );

    return { success: true };
  } catch (error) {
    logger.error(
      {
        assetId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to retry bookmark processing",
    );
    return { success: false, error: "Failed to retry bookmark processing" };
  }
}

/**
 * Safely retries document processing with proper job state management
 */
async function retryDocumentProcessing(
  assetId: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Reset processing state
    await resetProcessingJobState("documents", assetId, userId);

    // Get document details to determine job requirements
    const { schema } = await import("../../db/index.js");
    const { documents } = schema;
    const { eq, and } = await import("drizzle-orm");

    const document = await db.query.documents.findFirst({
      where: and(eq(documents.id, assetId), eq(documents.userId, userId)),
    });

    if (!document) {
      return { success: false, error: "Document not found" };
    }

    // Queue new document processing job using Queue Adapter (supports both Redis and Database backends)
    const { getQueueAdapter } = await import("../queue-adapter.js");
    const queueAdapter = await getQueueAdapter();

    await queueAdapter.enqueueDocument({
      documentId: assetId,
      storageId: document.storageId || undefined,
      mimeType:
        document.originalMimeType || document.mimeType || undefined,
      userId: userId,
      originalFilename: document.originalFilename || undefined,
    });

    logger.info(
      { assetId, userId },
      "Queued document processing job for retry",
    );

    return { success: true };
  } catch (error) {
    logger.error(
      {
        assetId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to retry document processing",
    );
    return { success: false, error: "Failed to retry document processing" };
  }
}

/**
 * Safely retries note processing with proper job state management
 */
async function retryNoteProcessing(
  assetId: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Reset processing state
    await resetProcessingJobState("notes", assetId, userId);

    // Get note details to determine job requirements
    const { schema } = await import("../../db/index.js");
    const { notes } = schema;
    const { eq, and } = await import("drizzle-orm");

    const note = await db.query.notes.findFirst({
      where: and(eq(notes.id, assetId), eq(notes.userId, userId)),
    });

    if (!note) {
      return { success: false, error: "Note not found" };
    }

    // Queue new note processing job using Queue Adapter (supports both Redis and Database backends)
    const { getQueueAdapter } = await import("../queue-adapter.js");
    const queueAdapter = await getQueueAdapter();

    await queueAdapter.enqueueNote({
      noteId: assetId,
      title: note.title || undefined,
      content: note.content || undefined,
      userId: userId,
    });

    logger.info({ assetId, userId }, "Queued note processing job for retry");

    return { success: true };
  } catch (error) {
    logger.error(
      {
        assetId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to retry note processing",
    );
    return { success: false, error: "Failed to retry note processing" };
  }
}

/**
 * Safely retries task processing with proper job state management
 */
async function retryTaskProcessing(
  assetId: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Reset processing state
    await resetProcessingJobState("tasks", assetId, userId);

    // Get task details to determine job requirements
    const { schema } = await import("../../db/index.js");
    const { tasks } = schema;
    const { eq, and } = await import("drizzle-orm");

    const task = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, assetId), eq(tasks.userId, userId)),
    });

    if (!task) {
      return { success: false, error: "Task not found" };
    }

    // Queue new task processing job using Queue Adapter (supports both Redis and Database backends)
    const { getQueueAdapter } = await import("../queue-adapter.js");
    const queueAdapter = await getQueueAdapter();

    await queueAdapter.enqueueTask({
      taskId: assetId,
      title: task.title || undefined,
      description: task.description || undefined,
      userId: userId,
    });

    logger.info({ assetId, userId }, "Queued task processing job for retry");

    return { success: true };
  } catch (error) {
    logger.error(
      {
        assetId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to retry task processing",
    );
    return { success: false, error: "Failed to retry task processing" };
  }
}

/**
 * Formats raw database job data into ProcessingJobDetails
 */
function formatJobDetails(job: any): ProcessingJobDetails {
  const stages: ProcessingStage[] = (job.stages as ProcessingStage[]) || [];

  return {
    id: job.id,
    assetType: job.assetType,
    assetId: job.assetId,
    userId: job.userId,
    status: job.status,
    stages,
    currentStage: job.currentStage || undefined,
    overallProgress: job.overallProgress || 0,
    errorMessage: job.errorMessage || undefined,
    errorDetails: job.errorDetails || undefined,
    retryCount: job.retryCount || 0,
    maxRetries: job.maxRetries || 3,
    canRetry:
      job.status === "failed" && (job.retryCount || 0) < (job.maxRetries || 3),
    nextRetryAt: job.nextRetryAt || undefined,
    startedAt: job.startedAt
      ? Math.floor(new Date(job.startedAt).getTime() / 1000)
      : undefined,
    completedAt: job.completedAt
      ? Math.floor(new Date(job.completedAt).getTime() / 1000)
      : undefined,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
