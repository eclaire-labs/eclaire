/**
 * Queue adapter types and interfaces
 */

import type { Logger } from "@eclaire/logger";
import type { DbInstance, TransactionManager } from "@eclaire/db";
import type { Redis } from "ioredis";

// --- Job Data Types ---

export interface JobData {
  /** Request ID for tracing - propagated from HTTP request that triggered the job */
  requestId?: string;
  [key: string]: any;
}

export interface BookmarkJobData extends JobData {
  bookmarkId: string;
  url: string;
  userId: string;
}

export interface ImageJobData extends JobData {
  imageId: string;
  userId: string;
  photoId?: string; // Alias for imageId used by worker
  storageId?: string;
  mimeType?: string;
  originalFilename?: string;
}

export interface DocumentJobData extends JobData {
  documentId: string;
  userId: string;
  storageId?: string;
  mimeType?: string;
  originalFilename?: string;
}

export interface NoteJobData extends JobData {
  noteId: string;
  userId: string;
  title?: string;
  content?: string;
}

export interface TaskJobData extends JobData {
  taskId: string;
  userId: string;
  title?: string;
  description?: string;
  isRecurringExecution?: boolean;
  isAssignedToAI?: boolean;
  assignedToId?: string;
  dueDate?: Date;
  scheduledFor?: Date;
  jobType?: "tag_generation" | "execution";
}

// --- Queue Adapter Interface ---

export interface QueueAdapter {
  enqueueBookmark(data: BookmarkJobData): Promise<void>;
  enqueueImage(data: ImageJobData): Promise<void>;
  enqueueDocument(data: DocumentJobData): Promise<void>;
  enqueueNote(data: NoteJobData): Promise<void>;
  enqueueTask(data: TaskJobData): Promise<void>;
  close(): Promise<void>;
}

// --- Configuration Types ---

export type AssetType = "bookmarks" | "photos" | "documents" | "notes" | "tasks";

export interface RedisQueueConfig {
  /** Redis connection URL */
  url: string;
}

export interface DatabaseQueueConfig {
  /** Drizzle database instance */
  db: DbInstance;
  /** Database type: 'postgres' or 'sqlite' */
  dbType: "postgres" | "sqlite";
  /** Optional transaction manager */
  txManager?: TransactionManager;
}

export interface QueueConfig {
  /** Queue mode: 'redis' for BullMQ, 'database' for database-backed queue */
  mode: "redis" | "database";
  /** Redis configuration (required for redis mode) */
  redis?: RedisQueueConfig;
  /** Database configuration (required for database mode) */
  database?: DatabaseQueueConfig;
  /** Logger instance */
  logger: Logger;
}

// --- Polling Configuration ---

export interface PollingConfig {
  /** Asset type to poll for */
  assetType: AssetType;
  /** Backend URL for job API */
  backendUrl: string;
  /** Job processor function */
  processor: (job: DatabaseJob) => Promise<void>;
  /** Logger instance */
  logger: Logger;
  /** Custom worker ID (optional) */
  workerId?: string;
  /** Wait timeout in ms (default: 30000) */
  waitTimeout?: number;
  /** Error retry delay in ms (default: 2000) */
  errorRetryDelay?: number;
  /** Heartbeat interval in ms (default: 60000) */
  heartbeatInterval?: number;
}

// --- Database Job Types ---

/**
 * Database job structure from backend API
 */
export interface DatabaseJob {
  id: string;
  asset_type: string;
  asset_id: string;
  user_id: string;
  job_type: string;
  status: string;
  job_data: any;
  locked_by: string | null;
  locked_at: string | null;
  expires_at: string | null;
  retry_count: number;
  max_retries: number;
  created_at: string;
}

/**
 * Mock BullMQ Job object for processors
 */
export interface MockBullMQJob {
  data: any;
  id: string;
  updateProgress?: (progress: number) => Promise<void>;
  log?: (message: string) => void;
}

/**
 * Claimed job result type (from database query)
 */
export interface ClaimedJob {
  id: string;
  asset_type: string;
  asset_id: string;
  user_id: string;
  job_type: string;
  status: string;
  job_data: any;
  locked_by: string | null;
  locked_at: Date | null;
  expires_at: Date | null;
  retry_count: number;
  max_retries: number;
  created_at: Date;
}

// --- Waitlist Interface ---

export interface JobWaitlistInterface {
  addWaiter(assetType: AssetType, workerId: string, timeout?: number): Promise<any>;
  notifyWaiters(assetType: AssetType, count?: number): number;
  notifyAllWaiters(assetType: AssetType): number;
  scheduleNextWakeup(assetType: AssetType): Promise<void>;
  getWaiterCount(assetType: AssetType): number;
  getStats(): Record<AssetType, number>;
  /** Close the waitlist, clearing all timers and rejecting pending waiters */
  close(): void;
}
