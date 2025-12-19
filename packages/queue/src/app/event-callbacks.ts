/**
 * Event Callbacks Factory
 *
 * Creates JobEventCallbacks for publishing real-time SSE events during job processing.
 * The callbacks extract metadata (userId, assetType, assetId) from the job and
 * transform queue events to the SSE event format.
 */

import type { JobEventCallbacks } from "../core/types.js";

/**
 * SSE event structure expected by the frontend
 */
export interface ProcessingSSEEvent {
  type: "status_update" | "progress" | "stage_complete" | "error";
  assetType: string;
  assetId: string;
  status?: string;
  stage?: string;
  progress?: number;
  error?: string;
  timestamp: number;
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
  const { publisher, logger } = config;

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
    onStageStart: (jobId, stage, metadata) => {
      safePublish(jobId, metadata, {
        type: "status_update",
        status: "processing",
        stage,
        progress: 0,
      });
    },

    onStageProgress: (jobId, stage, percent, metadata) => {
      safePublish(jobId, metadata, {
        type: "progress",
        stage,
        progress: percent,
      });
    },

    onStageComplete: (jobId, stage, artifacts, metadata) => {
      safePublish(jobId, metadata, {
        type: "stage_complete",
        status: "completed",
        stage,
        progress: 100,
      });
    },

    onStageFail: (jobId, stage, error, metadata) => {
      safePublish(jobId, metadata, {
        type: "error",
        status: "failed",
        stage,
        error,
      });
    },

    onJobComplete: (jobId, metadata) => {
      safePublish(jobId, metadata, {
        type: "status_update",
        status: "completed",
        progress: 100,
      });
    },

    onJobFail: (jobId, error, metadata) => {
      safePublish(jobId, metadata, {
        type: "error",
        status: "failed",
        error,
      });
    },
  };
}
