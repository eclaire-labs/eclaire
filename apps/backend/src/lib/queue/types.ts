/**
 * Eclaire-specific queue adapter types and interfaces
 */

import type { AssetType } from "../../types/assets.js";

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
  assigneeActorId?: string | null;
  dueDate?: Date;
  scheduledFor?: Date;
  jobType?: "tag_generation" | "execution";
}

export interface MediaJobData extends JobData {
  mediaId: string;
  userId: string;
  storageId?: string;
  mimeType?: string;
  originalFilename?: string;
  sourceUrl?: string;
}

export interface DeliveryTarget {
  type: "notification_channels" | "conversation";
  ref?: string;
}

export interface ScheduledActionJobData extends JobData {
  scheduledActionId: string;
  executionId: string;
  userId: string;
  kind: "reminder" | "agent_run";
  prompt: string;
  title: string;
  deliveryTargets: DeliveryTarget[];
  sourceConversationId?: string;
  agentActorId?: string;
  scheduledFor?: Date;
}

export interface AgentRunJobData extends JobData {
  agentRunId: string;
  taskId: string;
  userId: string;
  executorActorId: string;
  prompt: string;
}

// --- Queue Adapter Interface ---

export interface QueueAdapter {
  enqueueBookmark(data: BookmarkJobData): Promise<void>;
  enqueueImage(data: ImageJobData): Promise<void>;
  enqueueDocument(data: DocumentJobData): Promise<void>;
  enqueueNote(data: NoteJobData): Promise<void>;
  enqueueTask(data: TaskJobData): Promise<void>;
  enqueueMedia(data: MediaJobData): Promise<void>;
  enqueueScheduledAction(data: ScheduledActionJobData): Promise<void>;
  enqueueAgentRun(data: AgentRunJobData): Promise<void>;
  close(): Promise<void>;
}
