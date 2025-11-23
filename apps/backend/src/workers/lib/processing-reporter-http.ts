import axios from "axios";
import { redisConnection } from "../queues";
import { createChildLogger } from "../../lib/logger";

export type AssetType =
  | "photos"
  | "documents"
  | "bookmarks"
  | "notes"
  | "tasks";
export type ProcessingStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "retry_pending";

export interface ProcessingEvent {
  type: "status_update" | "error" | "progress" | "stage_complete";
  assetType: AssetType;
  assetId: string;
  status?: ProcessingStatus;
  stage?: string;
  progress?: number;
  error?: string;
  timestamp: number;
}

const logger = createChildLogger("processing-reporter");

export class ProcessingReporter {
  private assetType: AssetType;
  private assetId: string;
  private userId: string;
  private apiBaseUrl: string;

  constructor(
    assetType: AssetType,
    assetId: string,
    userId: string,
    apiBaseUrl?: string,
  ) {
    this.assetType = assetType;
    this.assetId = assetId;
    this.userId = userId;
    this.apiBaseUrl =
      apiBaseUrl || process.env.API_BASE_URL || "http://localhost:3001";
  }

  /**
   * Initialize processing job with stages.
   */
  async initializeJob(stages: string[]): Promise<void> {
    try {
      // FIX: Call updateDatabase with the new `initialStages` parameter.
      await this.updateDatabase({ status: "pending", initialStages: stages });

      await this.publishEvent({
        type: "status_update",
        assetType: this.assetType,
        assetId: this.assetId,
        status: "pending",
        timestamp: Date.now(),
      });
      logger.info(
        { assetType: this.assetType, assetId: this.assetId, stages },
        "Processing job initialized",
      );
    } catch (error) {
      logger.error(
        {
          assetType: this.assetType,
          assetId: this.assetId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to initialize processing job",
      );
    }
  }

  /**
   * Add additional stages to an existing job.
   */
  async addStages(newStages: string[]): Promise<void> {
    try {
      // FIX: Call updateDatabase with the new `addStages` parameter.
      // The status is "processing" because adding stages implies the job is active.
      await this.updateDatabase({
        status: "processing",
        addStages: newStages,
        stage: newStages[0],
      });
      logger.info(
        { assetType: this.assetType, assetId: this.assetId, newStages },
        "Added new stages to processing job",
      );
    } catch (error) {
      logger.error(
        {
          assetType: this.assetType,
          assetId: this.assetId,
          newStages,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to add stages to processing job",
      );
    }
  }

  /**
   * Update processing status for a specific stage.
   */
  async updateStage(
    stage: string,
    status: ProcessingStatus,
    progress: number = 0,
  ): Promise<void> {
    try {
      // FIX: Call updateDatabase with a clear object payload.
      await this.updateDatabase({ status, stage, progress });
      await this.publishEvent({
        type: "status_update",
        assetType: this.assetType,
        assetId: this.assetId,
        status,
        stage,
        progress,
        timestamp: Date.now(),
      });
      logger.info(
        {
          assetType: this.assetType,
          assetId: this.assetId,
          stage,
          status,
          progress,
        },
        "Processing stage updated",
      );
    } catch (error) {
      logger.error(
        {
          assetType: this.assetType,
          assetId: this.assetId,
          stage,
          status,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to update processing stage",
      );
    }
  }

  /**
   * Update progress for the current stage. This only sends a real-time event
   * and does not hit the database to avoid excessive writes.
   */
  async updateProgress(stage: string, progress: number): Promise<void> {
    try {
      await this.publishEvent({
        type: "progress",
        assetType: this.assetType,
        assetId: this.assetId,
        stage,
        progress,
        timestamp: Date.now(),
      });

      logger.debug(
        { assetType: this.assetType, assetId: this.assetId, stage, progress },
        "Processing progress updated",
      );
    } catch (error) {
      logger.error(
        {
          assetType: this.assetType,
          assetId: this.assetId,
          stage,
          progress,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to update processing progress",
      );
    }
  }

  async completeStage(
    stage: string,
    artifacts?: Record<string, any>,
  ): Promise<void> {
    // FIX: Call updateDatabase with a clear object payload.
    await this.updateDatabase({
      status: "completed",
      stage,
      progress: 100,
      artifacts,
    });
    await this.publishEvent({
      type: "stage_complete",
      assetType: this.assetType,
      assetId: this.assetId,
      stage,
      status: "completed",
      progress: 100,
      timestamp: Date.now(),
    });
  }

  /**
   * Report overall job completion, with optional final artifacts.
   * @param artifacts An optional object containing the final consolidated results of the job.
   */
  async completeJob(artifacts?: Record<string, any>): Promise<void> {
    try {
      // FIX: Call updateDatabase with a clear object payload.
      await this.updateDatabase({
        status: "completed",
        progress: 100,
        artifacts,
      });
      await this.publishEvent({
        type: "status_update",
        assetType: this.assetType,
        assetId: this.assetId,
        status: "completed",
        progress: 100,
        timestamp: Date.now(),
      });
      logger.info(
        { assetType: this.assetType, assetId: this.assetId },
        "Processing job completed",
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(
        {
          assetType: this.assetType,
          assetId: this.assetId,
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Failed to complete processing job - marking as failed",
      );

      // Mark the job as failed since the final database update failed
      try {
        await this.failJob(`Final database update failed: ${errorMessage}`, {
          originalError: errorMessage,
          failureType: "database_update",
        });
      } catch (failError) {
        logger.error(
          {
            assetType: this.assetType,
            assetId: this.assetId,
            error:
              failError instanceof Error ? failError.message : "Unknown error",
          },
          "Failed to mark job as failed after completion failure",
        );
      }

      // Re-throw the error so BullMQ knows this job failed
      throw error;
    }
  }

  /**
   * Report overall job failure.
   */
  async failJob(error: string, errorDetails?: any): Promise<void> {
    try {
      // FIX: Call updateDatabase with a clear object payload.
      await this.updateDatabase({ status: "failed", error, errorDetails });
      await this.publishEvent({
        type: "error",
        assetType: this.assetType,
        assetId: this.assetId,
        status: "failed",
        error,
        timestamp: Date.now(),
      });
      logger.error(
        { assetType: this.assetType, assetId: this.assetId, error },
        "Processing job failed",
      );
    } catch (updateError) {
      logger.error(
        {
          assetType: this.assetType,
          assetId: this.assetId,
          error:
            updateError instanceof Error
              ? updateError.message
              : "Unknown error",
        },
        "Failed to report job failure",
      );
    }
  }

  /**
   * Report an error for a specific stage or the overall job.
   */
  async reportError(
    error: Error,
    stage?: string,
    canRetry: boolean = true,
  ): Promise<void> {
    try {
      const errorDetails = {
        message: error.message,
        stack: error.stack,
        stage,
        timestamp: Date.now(),
        canRetry,
      };
      // FIX: Call updateDatabase with a clear object payload.
      await this.updateDatabase({
        status: "failed",
        stage,
        error: error.message,
        errorDetails,
      });
      await this.publishEvent({
        type: "error",
        assetType: this.assetType,
        assetId: this.assetId,
        error: error.message,
        stage,
        status: "failed",
        timestamp: Date.now(),
      });
      logger.error(
        {
          assetType: this.assetType,
          assetId: this.assetId,
          stage,
          error: error.message,
        },
        "Processing error reported",
      );
    } catch (reportError) {
      logger.error(
        {
          assetType: this.assetType,
          assetId: this.assetId,
          originalError: error.message,
          reportError:
            reportError instanceof Error
              ? reportError.message
              : "Unknown error",
        },
        "Failed to report processing error",
      );
    }
  }

  /**
   * Update the database via the single, unified backend API endpoint.
   */
  private async updateDatabase(data: {
    status: ProcessingStatus;
    stage?: string;
    progress?: number;
    error?: string;
    errorDetails?: any;
    artifacts?: Record<string, any>;
    initialStages?: string[]; // Renamed from `stages` to avoid conflict
    addStages?: string[];
  }): Promise<void> {
    const endpoint = `${this.apiBaseUrl}/api/processing-status/${this.assetType}/${this.assetId}/update`;

    try {
      // The payload is now built directly from the structured data object.
      // We also rename `initialStages` to `stages` for the API contract.
      const payload: any = {
        userId: this.userId,
        status: data.status,
        stage: data.stage,
        progress: data.progress,
        error: data.error,
        errorDetails: data.errorDetails,
        artifacts: data.artifacts,
        stages: data.initialStages, // API expects `stages`
        addStages: data.addStages,
      };

      // Remove undefined properties to keep the payload clean
      Object.keys(payload).forEach(
        (key) => payload[key] === undefined && delete payload[key],
      );

      await axios.put(endpoint, payload, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Accept: "application/json; charset=utf-8",
        },
        timeout: 15000,
      });
    } catch (error) {
      logger.error(
        {
          assetType: this.assetType,
          assetId: this.assetId,
          endpoint,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to update database via backend API",
      );
      throw error;
    }
  }

  /**
   * Publish a real-time event via Redis Pub/Sub.
   * Skips publishing if Redis connection is not available (e.g., in database mode).
   */
  private async publishEvent(event: ProcessingEvent): Promise<void> {
    // Skip publishing if Redis is not available (database mode)
    if (!redisConnection) {
      logger.debug(
        {
          userId: this.userId,
          event,
        },
        "Skipping Redis publish - no connection available (database mode)",
      );
      return;
    }

    try {
      await redisConnection.publish(
        `processing:${this.userId}`,
        JSON.stringify(event),
      );
    } catch (error) {
      logger.error(
        {
          userId: this.userId,
          event,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to publish processing event to Redis",
      );
    }
  }
}

/**
 * Convenience function to create a processing reporter.
 */
export function createProcessingReporter(
  assetType: AssetType,
  assetId: string,
  userId: string,
): ProcessingReporter {
  return new ProcessingReporter(assetType, assetId, userId);
}
