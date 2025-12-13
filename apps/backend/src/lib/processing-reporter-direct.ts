import { publishDirectSSEEvent } from "../routes/processing-events.js";
import { createChildLogger } from "./logger.js";
import {
  addStagesToProcessingJob,
  updateProcessingStatusWithArtifacts,
} from "./services/processing-status.js";

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

const logger = createChildLogger("processing-reporter-backend");

export class ProcessingReporter {
  private assetType: AssetType;
  private assetId: string;
  private userId: string;
  private jobType?: string;

  constructor(assetType: AssetType, assetId: string, userId: string, jobType?: string) {
    this.assetType = assetType;
    this.assetId = assetId;
    this.userId = userId;
    this.jobType = jobType;
  }

  /**
   * Initialize processing job with stages.
   */
  async initializeJob(stages: string[]): Promise<void> {
    try {
      await updateProcessingStatusWithArtifacts(
        this.assetType,
        this.assetId,
        this.userId,
        {
          status: "pending",
          stages,
          jobType: this.jobType,
        },
      );

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
      await addStagesToProcessingJob(this.assetType, this.assetId, newStages);

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
      await updateProcessingStatusWithArtifacts(
        this.assetType,
        this.assetId,
        this.userId,
        {
          status,
          stage,
          progress,
          jobType: this.jobType,
        },
      );

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
    try {
      await updateProcessingStatusWithArtifacts(
        this.assetType,
        this.assetId,
        this.userId,
        {
          status: "completed",
          stage,
          progress: 100,
          artifacts,
          jobType: this.jobType,
        },
      );

      await this.publishEvent({
        type: "stage_complete",
        assetType: this.assetType,
        assetId: this.assetId,
        stage,
        status: "completed",
        progress: 100,
        timestamp: Date.now(),
      });

      logger.info(
        { assetType: this.assetType, assetId: this.assetId, stage },
        "Processing stage completed",
      );
    } catch (error) {
      logger.error(
        {
          assetType: this.assetType,
          assetId: this.assetId,
          stage,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to complete processing stage",
      );
    }
  }

  /**
   * Report overall job completion, with optional final artifacts.
   * @param artifacts An optional object containing the final consolidated results of the job.
   */
  async completeJob(artifacts?: Record<string, any>): Promise<void> {
    try {
      await updateProcessingStatusWithArtifacts(
        this.assetType,
        this.assetId,
        this.userId,
        {
          status: "completed",
          progress: 100,
          artifacts,
          jobType: this.jobType,
        },
      );

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
      logger.error(
        {
          assetType: this.assetType,
          assetId: this.assetId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to complete processing job",
      );
    }
  }

  /**
   * Report overall job failure.
   */
  async failJob(error: string, errorDetails?: any): Promise<void> {
    try {
      await updateProcessingStatusWithArtifacts(
        this.assetType,
        this.assetId,
        this.userId,
        {
          status: "failed",
          error,
          errorDetails,
          jobType: this.jobType,
        },
      );

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

      await updateProcessingStatusWithArtifacts(
        this.assetType,
        this.assetId,
        this.userId,
        {
          status: "failed",
          stage,
          error: error.message,
          errorDetails,
          jobType: this.jobType,
        },
      );

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
   * Publish a real-time event via direct SSE publishing.
   */
  private async publishEvent(event: ProcessingEvent): Promise<void> {
    try {
      await publishDirectSSEEvent(this.userId, event);
    } catch (error) {
      logger.error(
        {
          userId: this.userId,
          event,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to publish processing event via direct SSE",
      );
    }
  }
}

/**
 * Convenience function to create a processing reporter.
 * @param jobType Optional job type for tasks with multiple processing pipelines (tag_generation, execution)
 */
export function createProcessingReporter(
  assetType: AssetType,
  assetId: string,
  userId: string,
  jobType?: string,
): ProcessingReporter {
  return new ProcessingReporter(assetType, assetId, userId, jobType);
}
