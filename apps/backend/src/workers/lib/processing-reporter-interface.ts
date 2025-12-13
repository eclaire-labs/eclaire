/**
 * Shared interface for ProcessingReporter implementations.
 *
 * This interface defines the public contract for processing reporters,
 * allowing both HTTP-based and direct DB implementations to be used
 * interchangeably without unsafe type casts.
 */

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

export interface IProcessingReporter {
  /**
   * Initialize processing job with stages.
   */
  initializeJob(stages: string[]): Promise<void>;

  /**
   * Add additional stages to an existing job.
   */
  addStages(newStages: string[]): Promise<void>;

  /**
   * Update processing status for a specific stage.
   */
  updateStage(
    stage: string,
    status: ProcessingStatus,
    progress?: number,
  ): Promise<void>;

  /**
   * Update progress for the current stage. This only sends a real-time event
   * and does not hit the database to avoid excessive writes.
   */
  updateProgress(stage: string, progress: number): Promise<void>;

  /**
   * Complete a specific stage with optional artifacts.
   */
  completeStage(stage: string, artifacts?: Record<string, any>): Promise<void>;

  /**
   * Report overall job completion, with optional final artifacts.
   */
  completeJob(artifacts?: Record<string, any>): Promise<void>;

  /**
   * Report overall job failure.
   */
  failJob(error: string, errorDetails?: any): Promise<void>;

  /**
   * Report an error for a specific stage or the overall job.
   */
  reportError(error: Error, stage?: string, canRetry?: boolean): Promise<void>;
}
