/**
 * @eclaire/queue/driver-db - Types for the database driver
 */

import type {
  BackoffStrategy,
  JobEventCallbacks,
  JobStage,
  QueueLogger,
} from "../core/types.js";

// ============================================================================
// Database Types (generic, works with any drizzle db)
// ============================================================================

/**
 * Minimal database interface required by the driver
 *
 * This is compatible with drizzle-orm's database instance.
 */
export interface DbInstance {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  delete: (...args: any[]) => any;
}

/**
 * Database capabilities - features that vary between PostgreSQL and SQLite
 */
export interface DbCapabilities {
  /** Supports FOR UPDATE SKIP LOCKED (PostgreSQL) */
  skipLocked: boolean;

  /** Supports NOTIFY/LISTEN (PostgreSQL) */
  notify: boolean;

  /** Supports JSONB (PostgreSQL) or JSON text (SQLite) */
  jsonb: boolean;

  /** Database type identifier */
  type: "postgres" | "sqlite";
}

// ============================================================================
// Driver Configuration
// ============================================================================

/**
 * Configuration for the DB queue client
 */
export interface DbQueueClientConfig {
  /** Drizzle database instance */
  db: DbInstance;

  /** Queue schema (queueJobs, queueSchedules tables) */
  schema: {
    queueJobs: any;
    queueSchedules: any;
  };

  /** Database capabilities */
  capabilities: DbCapabilities;

  /** Logger instance */
  logger: QueueLogger;

  /** Default backoff strategy for retries */
  defaultBackoff?: BackoffStrategy;

  /** Default max attempts for jobs */
  defaultMaxAttempts?: number;

  /** Notification emitter for horizontal scaling (optional) */
  notifyEmitter?: NotifyEmitter;
}

/**
 * Configuration for the DB worker
 */
export interface DbWorkerConfig {
  /** Drizzle database instance */
  db: DbInstance;

  /** Queue schema */
  schema: {
    queueJobs: any;
    queueSchedules: any;
  };

  /** Database capabilities */
  capabilities: DbCapabilities;

  /** Logger instance */
  logger: QueueLogger;

  /** Worker ID (auto-generated if not provided) */
  workerId?: string;

  /** Job lock duration in milliseconds (default: 300000 = 5 minutes) */
  lockDuration?: number;

  /** Heartbeat interval in milliseconds (default: 60000 = 1 minute) */
  heartbeatInterval?: number;

  /** Poll interval when no notify listener (default: 5000 = 5 seconds) */
  pollInterval?: number;

  /**
   * Timeout for waiting on notifications (default: 30000 = 30 seconds)
   *
   * Only used when notifyListener is provided. This controls how long
   * the worker waits for a notification before checking for jobs anyway.
   * A longer timeout reduces unnecessary wakeups when idle.
   */
  notifyWaitTimeout?: number;

  /** Notification listener for horizontal scaling (optional) */
  notifyListener?: NotifyListener;

  /**
   * Timeout for graceful shutdown in milliseconds (default: 30000 = 30 seconds)
   *
   * After calling stop(), the worker will wait up to this long for active jobs
   * to complete before returning. If the timeout is reached, stop() returns
   * even if jobs are still active.
   */
  gracefulShutdownTimeout?: number;

  /**
   * Event callbacks for job lifecycle events (optional)
   *
   * These are called when jobs start/complete stages or finish processing.
   * Typically used to publish real-time updates via SSE or WebSocket.
   */
  eventCallbacks?: JobEventCallbacks;

  /**
   * Optional wrapper for job execution context (e.g., for request tracing).
   *
   * Receives the requestId from job data (if present) and a function to execute.
   * Use this to wrap job processing in AsyncLocalStorage or similar context.
   *
   * @example
   * ```typescript
   * wrapJobExecution: async (requestId, execute) => {
   *   if (requestId) {
   *     return runWithRequestId(requestId, execute);
   *   }
   *   return execute();
   * }
   * ```
   */
  wrapJobExecution?: <R>(
    requestId: string | undefined,
    execute: () => Promise<R>,
  ) => Promise<R>;
}

// ============================================================================
// Notification Types
// ============================================================================

/**
 * Notification emitter interface for publishing job availability
 *
 * Used when enqueuing jobs to wake up waiting workers.
 */
export interface NotifyEmitter {
  /**
   * Emit a notification that jobs are available
   *
   * @param name - Queue name
   */
  emit(name: string): Promise<void>;

  /**
   * Close the emitter
   */
  close(): Promise<void>;
}

/**
 * Notification listener interface for waking workers
 *
 * Used by workers to receive notifications when jobs are available.
 */
export interface NotifyListener {
  /**
   * Subscribe to job notifications for a queue
   *
   * @param name - Queue name
   * @param callback - Called when jobs are available
   * @returns Unsubscribe function for this specific callback
   */
  subscribe(name: string, callback: () => void): () => void;

  /**
   * Close the listener
   */
  close(): Promise<void>;
}

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Internal job representation during processing
 */
export interface ClaimedJob {
  id: string;
  queue: string;
  key: string | null;
  data: unknown;
  status: string;
  priority: number;
  scheduledFor: Date | null;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: Date | null;
  backoffMs: number | null;
  backoffType: string | null;
  lockedBy: string | null;
  lockedAt: Date | null;
  expiresAt: Date | null;
  /** Fencing token for preventing stale worker completion */
  lockToken: string | null;
  errorMessage: string | null;
  errorDetails: unknown;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  // Multi-stage progress tracking
  stages: JobStage[] | null;
  currentStage: string | null;
  overallProgress: number | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Result of a claim operation
 */
export interface ClaimResult {
  /** The claimed job, or null if no job available */
  job: ClaimedJob | null;

  /** Whether the claim was successful */
  success: boolean;
}

/**
 * Options for the claim operation
 */
export interface ClaimOptions {
  /** Worker ID claiming the job */
  workerId: string;

  /** Lock duration in milliseconds */
  lockDuration: number;
}
