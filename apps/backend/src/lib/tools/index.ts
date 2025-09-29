import {
  countBookmarks as countBookmarksImpl,
  findBookmarks as findBookmarksImpl,
} from "@/lib/services/bookmarks";
import {
  countDocuments as countDocumentsImpl,
  findDocuments as findDocumentsImpl,
} from "@/lib/services/documents";
import {
  countNotes as countNotesImpl,
  createNoteEntry,
  findNotes as findNotesImpl,
} from "@/lib/services/notes";
import {
  countPhotos as countPhotosImpl,
  findPhotos as findPhotosImpl,
} from "@/lib/services/photos";
import {
  countTasks as countTasksImpl,
  findTasks as findTasksImpl,
  type TaskStatus,
} from "@/lib/services/tasks";

// --- Search Functions (Return items) ---

/**
 * Search note entries by full-text, tags, and date range.
 */
export async function findNotes(
  userId: string,
  text?: string,
  tags?: string[],
  startDate?: Date,
  endDate?: Date,
  limit?: number,
): Promise<any[]> {
  return await findNotesImpl(userId, text, tags, startDate, endDate, limit);
}

/**
 * Search bookmarks by text, tags, and date range.
 */
export async function findBookmarks(
  userId: string,
  text?: string,
  tags?: string[],
  startDate?: Date,
  endDate?: Date,
  limit?: number,
): Promise<any[]> {
  return await findBookmarksImpl(userId, text, tags, startDate, endDate, limit);
}

/**
 * Search documents by full-text, tags, file types, and date range.
 */
export async function findDocuments(
  userId: string,
  text?: string,
  tags?: string[],
  fileTypes?: string[],
  startDate?: Date,
  endDate?: Date,
  limit?: number,
): Promise<any[]> {
  return await findDocumentsImpl(
    userId,
    text,
    tags,
    fileTypes,
    startDate,
    endDate,
    limit,
  );
}

/**
 * Search photos by tags and date range.
 */
export async function findPhotos(
  userId: string,
  tags?: string[],
  startDate?: Date,
  endDate?: Date,
  locationCity?: string,
  dateField?: "createdAt" | "dateTaken",
  limit?: number,
): Promise<any[]> {
  return await findPhotosImpl(
    userId,
    tags,
    startDate,
    endDate,
    locationCity,
    dateField || "dateTaken",
    limit,
  );
}

/**
 * Search tasks by keywords, tags, status, and date range.
 */
export async function findTasks(
  userId: string,
  text?: string,
  tags?: string[],
  status?: "not-started" | "in-progress" | "completed",
  startDate?: Date,
  endDate?: Date,
  limit?: number,
): Promise<any[]> {
  let validStatus: TaskStatus | undefined;
  if (status && ["not-started", "in-progress", "completed"].includes(status)) {
    validStatus = status as TaskStatus;
  }
  return await findTasksImpl(
    userId,
    text,
    tags,
    validStatus,
    startDate,
    endDate,
    limit,
  );
}

// --- Create Functions (Return created items) ---

/**
 * Create a new note with text or markdown content.
 */
export async function createNote(
  userId: string,
  title: string,
  content: string,
): Promise<any> {
  const servicePayload = {
    content: content,
    metadata: {
      title: title,
      tags: [], // Empty initially, will be populated by AI background processing
      enabled: true, // Enable background processing for AI tagging
    },
    originalMimeType: "text/markdown", // Support both plain text and markdown
    userAgent: "AI Assistant",
  };

  return await createNoteEntry(servicePayload, userId);
}

// --- Count Functions (Return a number) ---

/**
 * Count note entries matching criteria.
 */
export async function countNotes(
  userId: string,
  text?: string,
  tags?: string[],
  startDate?: Date,
  endDate?: Date,
): Promise<number> {
  return await countNotesImpl(userId, text, tags, startDate, endDate);
}

/**
 * Count bookmarks matching criteria.
 */
export async function countBookmarks(
  userId: string,
  text?: string,
  tags?: string[],
  startDate?: Date,
  endDate?: Date,
): Promise<number> {
  return await countBookmarksImpl(userId, text, tags, startDate, endDate);
}

/**
 * Count documents matching criteria.
 */
export async function countDocuments(
  userId: string,
  text?: string,
  tags?: string[],
  fileTypes?: string[],
  startDate?: Date,
  endDate?: Date,
): Promise<number> {
  return await countDocumentsImpl(
    userId,
    text,
    tags,
    fileTypes,
    startDate,
    endDate,
  );
}

/**
 * Count photos matching criteria.
 */
export async function countPhotos(
  userId: string,
  tags?: string[],
  startDate?: Date,
  endDate?: Date,
): Promise<number> {
  return await countPhotosImpl(
    userId,
    tags,
    startDate,
    endDate,
    undefined,
    "createdAt",
  );
}

/**
 * Count tasks matching criteria.
 */
export async function countTasks(
  userId: string,
  text?: string,
  tags?: string[],
  status?: "not-started" | "in-progress" | "completed",
  startDate?: Date,
  endDate?: Date,
): Promise<number> {
  let validStatus: TaskStatus | undefined;
  if (status && ["not-started", "in-progress", "completed"].includes(status)) {
    validStatus = status as TaskStatus;
  }
  return await countTasksImpl(
    userId,
    text,
    tags,
    validStatus,
    startDate,
    endDate,
  );
}
