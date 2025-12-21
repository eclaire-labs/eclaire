/**
 * Event Callbacks Factory
 *
 * Creates JobEventCallbacks for publishing real-time SSE events during job processing.
 * The callbacks extract metadata (userId, assetType, assetId) from the job and
 * transform queue events to the SSE event format.
 */

import type { JobEventCallbacks } from "../core/types.js";

/**
 * SSE event structure for real-time processing updates
 *
 * Event types follow a symmetric `{scope}_{action}` pattern:
 * - job_*: Job-level events
 * - stage_*: Stage-level events
 */
export interface ProcessingSSEEvent {
  type:
    | "job_queued" // Job created, waiting in queue
    | "stage_started" // Stage began processing
    | "stage_progress" // Progress update within stage (0-100)
    | "stage_completed" // Stage finished successfully
    | "stage_failed" // Stage failed
    | "job_completed" // All stages done, job succeeded
    | "job_failed"; // Job in terminal failure state

  assetType: string;
  assetId: string;
  timestamp: number;

  // Stage name (for stage_* events)
  stage?: string;

  // Progress 0-100 (for stage_progress)
  progress?: number;

  // Error message (for *_failed events)
  error?: string;
}

/**
 * Metadata structure stored in job.metadata
 */
export interface JobAssetMetadata {
  userId: string;
  assetType: string;
  assetId: string;
}

/**
 * Publisher function type for SSE events
 *
 * @param userId - User ID to send the event to
 * @param event - SSE event to publish
 */
export type SSEPublisher = (userId: string, event: ProcessingSSEEvent) => Promise<void>;

/**
 * Artifact processor function type
 *
 * Called when a stage completes with artifacts to persist them to the database.
 *
 * @param assetType - Type of asset (e.g., "notes", "photos")
 * @param assetId - ID of the asset
 * @param artifacts - Artifacts to process (e.g., { tags: [...] })
 */
export type ArtifactProcessor = (
  assetType: string,
  assetId: string,
  artifacts: Record<string, unknown>,
) => Promise<void>;

/**
 * Configuration for creating event callbacks
 */
export interface EventCallbacksConfig {
  /**
   * Function to publish SSE events
   *
   * For unified mode (same container as backend):
   * - Use `publishDirectSSEEvent` from processing-events.ts
   *
   * For worker mode (separate container):
   * - Use HTTP POST to `/api/processing-status/{assetType}/{assetId}/event`
   */
  publisher: SSEPublisher;

  /**
   * Optional function to process artifacts when a stage completes.
   *
   * For unified mode (direct-db workers):
   * - Use `processArtifacts` from artifact-processor.ts
   *
   * For worker mode (separate container):
   * - Artifacts are sent via HTTP and processed by the backend
   */
  artifactProcessor?: ArtifactProcessor;

  /**
   * Optional logger for debugging
   */
  logger?: {
    debug: (context: Record<string, unknown>, message: string) => void;
    warn: (context: Record<string, unknown>, message: string) => void;
    error: (context: Record<string, unknown>, message: string) => void;
  };
}

/**
 * Extract asset metadata from job metadata
 *
 * @param metadata - Job metadata (may be undefined)
 * @returns Asset metadata or null if not present
 */
function extractAssetMetadata(
  metadata?: Record<string, unknown>,
): JobAssetMetadata | null {
  if (!metadata) {
    return null;
  }

  const { userId, assetType, assetId } = metadata;

  if (
    typeof userId !== "string" ||
    typeof assetType !== "string" ||
    typeof assetId !== "string"
  ) {
    return null;
  }

  return { userId, assetType, assetId };
}

/**
 * Create JobEventCallbacks for SSE event publishing
 *
 * These callbacks are passed to the queue worker and are called during job
 * processing to publish real-time updates to connected clients.
 *
 * @param config - Configuration with publisher function
 * @returns JobEventCallbacks to pass to worker config
 *
 * @example
 * ```typescript
 * // Unified mode (same container)
 * import { publishDirectSSEEvent } from "./routes/processing-events.js";
 * import { createEventCallbacks } from "@eclaire/queue/app";
 *
 * const eventCallbacks = createEventCallbacks({
 *   publisher: publishDirectSSEEvent,
 *   logger,
 * });
 *
 * const worker = createDbWorker({
 *   // ... other config
 *   eventCallbacks,
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Worker mode (separate container)
 * import { createEventCallbacks } from "@eclaire/queue/app";
 *
 * async function httpPublisher(userId: string, event: ProcessingSSEEvent) {
 *   await fetch(`${BACKEND_URL}/api/processing-events/publish`, {
 *     method: "POST",
 *     headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify({ userId, event }),
 *   });
 * }
 *
 * const eventCallbacks = createEventCallbacks({
 *   publisher: httpPublisher,
 *   logger,
 * });
 * ```
 */
export function createEventCallbacks(config: EventCallbacksConfig): JobEventCallbacks {
  const { publisher, artifactProcessor, logger } = config;

  /**
   * Safely publish an event, catching any errors
   */
  async function safePublish(
    jobId: string,
    metadata: Record<string, unknown> | undefined,
    event: Omit<ProcessingSSEEvent, "assetType" | "assetId" | "timestamp">,
  ): Promise<void> {
    const assetMetadata = extractAssetMetadata(metadata);

    if (!assetMetadata) {
      logger?.warn(
        { jobId, metadata },
        "Cannot publish event: missing asset metadata (userId, assetType, assetId)",
      );
      return;
    }

    const fullEvent: ProcessingSSEEvent = {
      ...event,
      assetType: assetMetadata.assetType,
      assetId: assetMetadata.assetId,
      timestamp: Date.now(),
    };

    try {
      await publisher(assetMetadata.userId, fullEvent);

      logger?.debug(
        { jobId, eventType: event.type, assetType: assetMetadata.assetType },
        "SSE event published",
      );
    } catch (error) {
      logger?.error(
        {
          jobId,
          eventType: event.type,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to publish SSE event",
      );
    }
  }

  return {
    onStageStart: async (jobId, stage, metadata) => {
      await safePublish(jobId, metadata, {
        type: "stage_started",
        stage,
        progress: 0,
      });
    },

    onStageProgress: async (jobId, stage, percent, metadata) => {
      await safePublish(jobId, metadata, {
        type: "stage_progress",
        stage,
        progress: percent,
      });
    },

    onStageComplete: async (jobId, stage, artifacts, metadata) => {
      // Publish SSE event
      await safePublish(jobId, metadata, {
        type: "stage_completed",
        stage,
        progress: 100,
      });

      // Process artifacts if provided and processor is configured
      if (artifacts && Object.keys(artifacts).length > 0 && artifactProcessor) {
        const assetMetadata = extractAssetMetadata(metadata);
        if (assetMetadata) {
          try {
            await artifactProcessor(
              assetMetadata.assetType,
              assetMetadata.assetId,
              artifacts,
            );
            logger?.debug(
              { jobId, stage, assetType: assetMetadata.assetType, assetId: assetMetadata.assetId },
              "Artifacts processed successfully",
            );
          } catch (error) {
            logger?.error(
              {
                jobId,
                stage,
                assetType: assetMetadata.assetType,
                assetId: assetMetadata.assetId,
                error: error instanceof Error ? error.message : "Unknown error",
              },
              "Failed to process artifacts",
            );
          }
        }
      }
    },

    onStageFail: async (jobId, stage, error, metadata) => {
      await safePublish(jobId, metadata, {
        type: "stage_failed",
        stage,
        error,
      });
    },

    onJobComplete: async (jobId, metadata) => {
      await safePublish(jobId, metadata, {
        type: "job_completed",
        progress: 100,
      });
    },

    onJobFail: async (jobId, error, metadata) => {
      await safePublish(jobId, metadata, {
        type: "job_failed",
        error,
      });
    },
  };
}
