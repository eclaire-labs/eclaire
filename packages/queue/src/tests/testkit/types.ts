/**
 * Types for queue test harness
 */

/**
 * Database type for DB driver tests
 */
export type TestDbType = "sqlite" | "pglite";

/**
 * Driver type for queue tests
 */
export type QueueDriverType = "db" | "bullmq";

/**
 * Capabilities that differ between drivers
 */
export interface HarnessCapabilities {
  /** DB can report retry_pending state; BullMQ collapses into delayed */
  supportsRetryPendingState: boolean;
  /** DB persists schedules; BullMQ only tracks in-memory within current process */
  supportsSchedulerPersistence: boolean;
  /** Can inspect delay/scheduledFor timing */
  supportsDelayInspection: boolean;
  /** DB supports linear backoff; BullMQ maps linear to fixed */
  supportsLinearBackoff: boolean;
}

/**
 * Test harness configuration
 */
export interface QueueTestHarnessConfig {
  driver: QueueDriverType;
  dbType?: TestDbType; // Only for DB driver
  label: string;
  capabilities: HarnessCapabilities;
}
