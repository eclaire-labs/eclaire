import type { Queue } from "bullmq";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { db, schema, txManager, queueJobs } from "../../db/index.js";
import { generateJobId } from "@eclaire/queue/core";
const {
  bookmarks,
  documents,
  notes,
  photos,
  tasks,
} = schema;
import { publishProcessingEvent } from "../../routes/processing-events.js";
import type { AssetType, ProcessingStatus } from "../../types/assets.js";
import { createChildLogger } from "../logger.js";
import { getQueue, QueueNames } from "../queue/index.js";
import { processArtifacts } from "./artifact-processor.js";

const logger = createChildLogger("processing-status");

/**
 * Build queue name for an asset type and optional job type
 * Maps to queue names like "bookmark-processing", "task-tag_generation", etc.
 */
function buildQueueName(assetType: AssetType, jobType?: string): string {
  if (jobType && assetType === "tasks") {
    return `task-${jobType}`;
  }
  // photos -> photo-processing, bookmarks -> bookmark-processing, etc.
  return `${assetType.slice(0, -1)}-processing`;
}

/**
 * Build job key for an asset: "{assetType}:{assetId}"
 */
function buildJobKey(assetType: AssetType, assetId: string): string {
  return `${assetType}:${assetId}`;
}

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
 * Uses queueJobs table with key pattern: "{assetType}:{assetId}"
 */
export async function createOrUpdateProcessingJob(
  assetType: AssetType,
  assetId: string,
  userId: string,
  initialStages: string[] = [],
  jobType?: string,
): Promise<ProcessingJobDetails> {
  try {
    const jobKey = buildJobKey(assetType, assetId);
    const queueName = buildQueueName(assetType, jobType);

    // Check for existing job
    const existingJob = await db
      .select()
      .from(queueJobs)
      .where(and(eq(queueJobs.queue, queueName), eq(queueJobs.key, jobKey)))
      .limit(1);

    const stages: ProcessingStage[] = initialStages.map((stageName) => ({
      name: stageName,
      status: "pending" as ProcessingStatus,
      progress: 0,
    }));

    const metadata = { userId, assetType, assetId };

    if (existingJob.length > 0) {
      const [updatedJob] = await db
        .update(queueJobs)
        .set({
          status: "pending",
          stages: stages,
          currentStage: null,
          overallProgress: 0,
          errorMessage: null,
          errorDetails: null,
          attempts: 0,
          completedAt: null,
          updatedAt: new Date(),
          metadata,
        })
        .where(eq(queueJobs.id, existingJob[0]!.id))
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
      const jobId = generateJobId();
      const [newJob] = await db
        .insert(queueJobs)
        .values({
          id: jobId,
          queue: queueName,
          key: jobKey,
          data: {}, // Job data can be empty for processing status tracking
          status: "pending",
          stages: stages,
          currentStage: null,
          overallProgress: 0,
          attempts: 0,
          maxAttempts: 3,
          metadata,
        })
        .onConflictDoUpdate({
          target: [queueJobs.queue, queueJobs.key],
          set: {
            status: "pending",
            stages: stages,
            currentStage: null,
            overallProgress: 0,
            attempts: 0,
            errorMessage: null,
            errorDetails: null,
            completedAt: null,
            updatedAt: new Date(),
            metadata,
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
    const jobKey = buildJobKey(assetType, assetId);

    // Find job by key (without name filter to find any job for this asset)
    const jobs = await db
      .select()
      .from(queueJobs)
      .where(eq(queueJobs.key, jobKey))
      .limit(1);

    const job = jobs[0];

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
      .update(queueJobs)
      .set({
        stages: updatedStages,
        updatedAt: new Date(),
      })
      .where(eq(queueJobs.id, job.id))
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
    // 1. Fetch the current state of the job
    const jobKey = buildJobKey(assetType, assetId);
    const queueName = buildQueueName(assetType, jobType);

    const jobs = await db
      .select()
      .from(queueJobs)
      .where(and(eq(queueJobs.queue, queueName), eq(queueJobs.key, jobKey)))
      .limit(1);

    const job = jobs[0];

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

    // Get existing metadata to preserve and extend
    const existingMetadata = (job.metadata as Record<string, any>) || {};

    // Initialize updateData with a flexible type to handle SQL expressions
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    // 3. (RACE CONDITION FIX) Handle adding new stages first, if requested.
    if (addStages && addStages.length > 0) {
      const stagesToAdd: ProcessingStage[] = addStages
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

      updateData.currentStage = stage;
    }

    // 5. Determine the overall job status and manage job-level timestamps.
    if (status === "failed") {
      updateData.status = "failed";
      updateData.completedAt = nowDate;
      updateData.currentStage = stage || job.currentStage;
      updateData.errorMessage = error || null;
      updateData.errorDetails = errorDetails || null;
    } else if (status === "completed" && !stage) {
      updateData.status = "completed";
      updateData.completedAt = nowDate;
      updateData.currentStage = null;
      updateData.overallProgress = 100;
      for (const s of existingStages) {
        if (s.status !== "completed") {
          s.status = "completed";
          s.progress = 100;
          if (!s.completedAt) s.completedAt = now;
        }
      }
    } else {
      updateData.status = "processing";
      updateData.completedAt = null;
      // Store startedAt in metadata since queueJobs doesn't have this column
      if (!existingMetadata.startedAt) {
        updateData.metadata = { ...existingMetadata, startedAt: nowDate.toISOString() };
      }
    }

    // 6. Recalculate overall progress and finalize the update payload.
    updateData.stages = existingStages;
    if (updateData.status !== "completed") {
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

    // 8. Execute update (queueJobs is not in transaction manager, use direct update)
    const [updatedJob] = await db
      .update(queueJobs)
      .set(cleanUpdateData)
      .where(eq(queueJobs.id, job.id))
      .returning();

    if (!updatedJob) {
      return null;
    }

    const formattedJob = formatJobDetails(updatedJob);

    // Get userId from metadata for SSE
    const userId = (updatedJob.metadata as any)?.userId;

    // Publish SSE event for status update with full data
    try {
      if (userId) {
        const summary = await getUserProcessingSummary(userId);

        let eventType = "job_update";
        if (formattedJob.status === "completed") {
          eventType = "job_completed";
        } else if (formattedJob.status === "failed") {
          eventType = "job_failed";
        } else if (stage) {
          eventType = "stage_update";
        }

        await publishProcessingEvent(userId, {
          type: eventType,
          payload: {
            job: formattedJob,
            summary,
          },
        });
      }
    } catch (sseError) {
      logger.warn(
        { assetType, assetId, userId, sseError },
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
    const jobKey = buildJobKey(assetType, assetId);
    const queueName = buildQueueName(assetType, jobType);

    // Query by key and optionally by name (for tasks with multiple job types)
    const jobs = await db
      .select()
      .from(queueJobs)
      .where(
        and(
          eq(queueJobs.key, jobKey),
          eq(queueJobs.queue, queueName),
          sql`${queueJobs.metadata}->>'userId' = ${userId}`
        )
      )
      .limit(1);

    const job = jobs[0];
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
  try {
    // Use queueJobs with jsonb metadata for filtering
    // Join with asset tables to filter by enabled status
    const jobs = await db
      .select({
        status: queueJobs.status,
      })
      .from(queueJobs)
      .leftJoin(
        photos,
        and(
          sql`${queueJobs.metadata}->>'assetType' = 'photos'`,
          sql`${queueJobs.metadata}->>'assetId' = ${photos.id}`,
        ),
      )
      .leftJoin(
        documents,
        and(
          sql`${queueJobs.metadata}->>'assetType' = 'documents'`,
          sql`${queueJobs.metadata}->>'assetId' = ${documents.id}`,
        ),
      )
      .leftJoin(
        bookmarks,
        and(
          sql`${queueJobs.metadata}->>'assetType' = 'bookmarks'`,
          sql`${queueJobs.metadata}->>'assetId' = ${bookmarks.id}`,
        ),
      )
      .leftJoin(
        notes,
        and(
          sql`${queueJobs.metadata}->>'assetType' = 'notes'`,
          sql`${queueJobs.metadata}->>'assetId' = ${notes.id}`,
        ),
      )
      .leftJoin(
        tasks,
        and(
          sql`${queueJobs.metadata}->>'assetType' = 'tasks'`,
          sql`${queueJobs.metadata}->>'assetId' = ${tasks.id}`,
        ),
      )
      .where(
        and(
          sql`${queueJobs.metadata}->>'userId' = ${userId}`,
          // Only include jobs for enabled assets
          or(
            and(
              sql`${queueJobs.metadata}->>'assetType' = 'photos'`,
              photos.enabled,
            ),
            and(
              sql`${queueJobs.metadata}->>'assetType' = 'documents'`,
              documents.enabled,
            ),
            and(
              sql`${queueJobs.metadata}->>'assetType' = 'bookmarks'`,
              bookmarks.enabled,
            ),
            and(
              sql`${queueJobs.metadata}->>'assetType' = 'notes'`,
              notes.enabled,
            ),
            and(
              sql`${queueJobs.metadata}->>'assetType' = 'tasks'`,
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
    const { status, assetType, search, limit: queryLimit = 100, offset: queryOffset = 0 } = filters;

    // Build where conditions using SQL for jsonb metadata access
    const conditions: ReturnType<typeof sql>[] = [
      sql`${queueJobs.metadata}->>'userId' = ${userId}`
    ];

    if (status) {
      conditions.push(sql`${queueJobs.status} = ${status}`);
    }

    if (assetType) {
      conditions.push(sql`${queueJobs.metadata}->>'assetType' = ${assetType}`);
    }

    if (search) {
      conditions.push(sql`${queueJobs.metadata}->>'assetId' LIKE ${'%' + search + '%'}`);
    }

    logger.debug(
      {
        userId,
        conditionsCount: conditions.length,
        parsedFilters: { status, assetType, search, limit: queryLimit, offset: queryOffset },
      },
      "Built query conditions for processing jobs",
    );

    // Use queueJobs with joins to filter by enabled status
    const jobs = await db
      .select({
        id: queueJobs.id,
        queue: queueJobs.queue,
        key: queueJobs.key,
        status: queueJobs.status,
        stages: queueJobs.stages,
        currentStage: queueJobs.currentStage,
        overallProgress: queueJobs.overallProgress,
        errorMessage: queueJobs.errorMessage,
        errorDetails: queueJobs.errorDetails,
        attempts: queueJobs.attempts,
        maxAttempts: queueJobs.maxAttempts,
        nextRetryAt: queueJobs.nextRetryAt,
        completedAt: queueJobs.completedAt,
        createdAt: queueJobs.createdAt,
        updatedAt: queueJobs.updatedAt,
        metadata: queueJobs.metadata,
      })
      .from(queueJobs)
      .leftJoin(
        photos,
        and(
          sql`${queueJobs.metadata}->>'assetType' = 'photos'`,
          sql`${queueJobs.metadata}->>'assetId' = ${photos.id}`,
        ),
      )
      .leftJoin(
        documents,
        and(
          sql`${queueJobs.metadata}->>'assetType' = 'documents'`,
          sql`${queueJobs.metadata}->>'assetId' = ${documents.id}`,
        ),
      )
      .leftJoin(
        bookmarks,
        and(
          sql`${queueJobs.metadata}->>'assetType' = 'bookmarks'`,
          sql`${queueJobs.metadata}->>'assetId' = ${bookmarks.id}`,
        ),
      )
      .leftJoin(
        notes,
        and(
          sql`${queueJobs.metadata}->>'assetType' = 'notes'`,
          sql`${queueJobs.metadata}->>'assetId' = ${notes.id}`,
        ),
      )
      .leftJoin(
        tasks,
        and(
          sql`${queueJobs.metadata}->>'assetType' = 'tasks'`,
          sql`${queueJobs.metadata}->>'assetId' = ${tasks.id}`,
        ),
      )
      .where(
        and(
          ...conditions,
          // Only include jobs for enabled assets
          or(
            and(
              sql`${queueJobs.metadata}->>'assetType' = 'photos'`,
              photos.enabled,
            ),
            and(
              sql`${queueJobs.metadata}->>'assetType' = 'documents'`,
              documents.enabled,
            ),
            and(
              sql`${queueJobs.metadata}->>'assetType' = 'bookmarks'`,
              bookmarks.enabled,
            ),
            and(
              sql`${queueJobs.metadata}->>'assetType' = 'notes'`,
              notes.enabled,
            ),
            and(
              sql`${queueJobs.metadata}->>'assetType' = 'tasks'`,
              tasks.enabled,
            ),
          ),
        ),
      )
      .orderBy(desc(queueJobs.createdAt))
      .limit(queryLimit)
      .offset(queryOffset);

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

    // Unknown asset type
    return { success: false, error: `Unknown asset type: ${assetType}` };
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
    // Delete existing processing job record completely using queueJobs key
    const jobKey = buildJobKey(assetType, assetId);
    await db.delete(queueJobs).where(eq(queueJobs.key, jobKey));

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
    const { getQueueAdapter } = await import("../queue/index.js");
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
        return await retryBookmarkProcessing(assetId, userId);
      }
      case "notes": {
        return await retryNoteProcessing(assetId, userId);
      }
      case "tasks": {
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
    const { getQueueAdapter } = await import("../queue/index.js");
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
    const { getQueueAdapter } = await import("../queue/index.js");
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
    const { getQueueAdapter } = await import("../queue/index.js");
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
    const { getQueueAdapter } = await import("../queue/index.js");
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
 * Formats queueJobs data (metadata stored in jsonb)
 */
function formatJobDetails(job: any): ProcessingJobDetails {
  const stages: ProcessingStage[] = (job.stages as ProcessingStage[]) || [];

  // Handle queueJobs format (metadata contains userId, assetType, assetId, startedAt)
  const metadata = job.metadata as { userId?: string; assetType?: string; assetId?: string; startedAt?: string } | null;
  const assetType = job.assetType || metadata?.assetType || parseAssetTypeFromKey(job.key);
  const assetId = job.assetId || metadata?.assetId || parseAssetIdFromKey(job.key);
  const userId = job.userId || metadata?.userId;

  const retryCount = job.attempts ?? 0;
  const maxRetries = job.maxAttempts ?? 3;

  // Handle startedAt from either column or metadata
  const startedAtValue = job.startedAt || metadata?.startedAt;

  return {
    id: job.id,
    assetType,
    assetId,
    userId,
    status: job.status,
    stages,
    currentStage: job.currentStage || undefined,
    overallProgress: job.overallProgress || 0,
    errorMessage: job.errorMessage || undefined,
    errorDetails: job.errorDetails || undefined,
    retryCount,
    maxRetries,
    canRetry: job.status === "failed" && retryCount < maxRetries,
    nextRetryAt: job.nextRetryAt || undefined,
    startedAt: startedAtValue
      ? Math.floor(new Date(startedAtValue).getTime() / 1000)
      : undefined,
    completedAt: job.completedAt
      ? Math.floor(new Date(job.completedAt).getTime() / 1000)
      : undefined,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

/**
 * Parse assetType from queueJobs key format: "{assetType}:{assetId}"
 */
function parseAssetTypeFromKey(key: string | null | undefined): string {
  if (!key) return "";
  const [assetType] = key.split(":");
  return assetType || "";
}

/**
 * Parse assetId from queueJobs key format: "{assetType}:{assetId}"
 */
function parseAssetIdFromKey(key: string | null | undefined): string {
  if (!key) return "";
  const parts = key.split(":");
  return parts.slice(1).join(":") || ""; // Handle IDs that might contain ":"
}
