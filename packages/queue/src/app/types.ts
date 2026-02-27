/**
 * Queue adapter types and interfaces
 */

import type { AssetType } from "@eclaire/core/types";
import type { DbInstance, TransactionManager } from "@eclaire/db";
import type { Logger } from "@eclaire/logger";

export type { AssetType };

// --- Job Data Types ---

export interface JobData {
  /** Request ID for tracing - propagated from HTTP request that triggered the job */
  requestId?: string;
  // biome-ignore lint/suspicious/noExplicitAny: job data is user-defined and can contain any value
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

export interface RedisQueueConfig {
  /** Redis connection URL */
  url: string;
  /** Redis key prefix for BullMQ (default: "eclaire") */
  prefix?: string;
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

// --- Waitlist Interface ---

export interface JobWaitlistInterface {
  addWaiter(
    queue: string,
    workerId: string,
    timeout?: number,
    // biome-ignore lint/suspicious/noExplicitAny: return type varies — resolves with claimed job or null
  ): Promise<any>;
  notifyWaiters(queue: string, count?: number): number;
  notifyAllWaiters(queue: string): number;
  scheduleNextWakeup(queue: string): Promise<void>;
  getWaiterCount(queue: string): number;
  getStats(): Record<string, number>;
  /** Close the waitlist, clearing all timers and rejecting pending waiters */
  close(): void;
}
