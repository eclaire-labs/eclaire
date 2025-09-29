import {
  and,
  Column,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  like,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { assetProcessingJobs, notes, notesTags, tags } from "@/db/schema";
import { formatToISO8601, getOrCreateTags } from "@/lib/db-helpers";
import { getQueue, QueueNames } from "@/lib/queues";
import { createChildLogger } from "../logger";
import { recordHistory } from "./history";

const logger = createChildLogger("services:notes");

interface CreateNoteData {
  content: string;
  metadata: {
    title?: string;
    dueDate?: string;
    tags?: string[];
    reviewStatus?: "pending" | "accepted" | "rejected";
    flagColor?: "red" | "yellow" | "orange" | "green" | "blue" | null;
    isPinned?: boolean;
    [key: string]: any;
  };
  originalMimeType: string;
  userAgent: string;
}

interface UpdateNoteParams {
  title?: string;
  content?: string;
  dueDate?: string | null;
  tags?: string[];
  reviewStatus?: "pending" | "accepted" | "rejected";
  flagColor?: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned?: boolean;
}

// Create note entry function
export async function createNoteEntry(data: CreateNoteData, userId: string) {
  try {
    // The note ID will be generated automatically by the schema default function
    const { metadata } = data;

    // Check if background processing is enabled (default true if not specified)
    const enabled = metadata.enabled !== false; // Will be true unless explicitly set to false

    // Convert dueDate string to Date object
    const dueDateValue = metadata.dueDate ? new Date(metadata.dueDate) : null;

    const [newEntry] = await db.transaction(async (tx) => {
      // Create note entry
      const [noteEntry] = await tx
        .insert(notes)
        .values({
          // Remove explicit id - let schema default handle it
          userId: userId,
          title: metadata.title || "Untitled Note",
          content: data.content,
          description:
            data.content.substring(0, 100) +
            (data.content.length > 100 ? "..." : ""),
          dueDate: dueDateValue,
          rawMetadata: metadata,
          originalMimeType: data.originalMimeType,
          userAgent: data.userAgent,
          enabled: enabled, // Set the enabled flag based on metadata
          // New fields for review, flagging, and pinning
          reviewStatus: metadata.reviewStatus || "pending",
          flagColor: metadata.flagColor || null,
          isPinned: metadata.isPinned || false,
          // createdAt and updatedAt are handled by schema defaults
        })
        .returning();

      if (!noteEntry) {
        throw new Error("Failed to create note entry");
      }

      // Create processing job if enabled
      if (enabled) {
        await tx.insert(assetProcessingJobs).values({
          assetType: "notes",
          assetId: noteEntry.id,
          userId: userId,
          status: "pending",
          stages: [{ name: "ai_tagging", status: "pending", progress: 0 }],
          currentStage: "ai_tagging",
        });
      }

      return [noteEntry];
    });

    if (!newEntry) {
      throw new Error("Failed to create note entry in transaction");
    }

    const entryId = newEntry.id; // Use the generated ID

    // Handle tags if provided
    const tagNames = metadata.tags || [];
    if (tagNames.length > 0) {
      await addTagsToNote(entryId, tagNames, userId);
    }

    // Record history for note creation
    await recordHistory({
      action: "create",
      itemType: "note",
      itemId: entryId,
      itemName: newEntry.title,
      afterData: { ...newEntry, tags: tagNames },
      actor: "user",
      userId: userId,
    });

    // Only queue the AI processing job if enabled
    if (enabled) {
      const noteQueue = getQueue(QueueNames.NOTE_PROCESSING);
      if (noteQueue) {
        await noteQueue.add(
          "process-note",
          {
            noteId: entryId,
            title: newEntry.title,
            content: data.content,
            userId: userId,
          },
          {
            jobId: entryId, // Use noteId as jobId for deduplication
          },
        );
        logger.info(
          {
            noteId: entryId,
            userId,
            enabled: true,
          },
          "Queued note processing job",
        );
      } else {
        logger.error(
          {
            noteId: entryId,
            userId,
          },
          "Failed to get note processing queue",
        );
      }
    } else {
      logger.info(
        {
          noteId: entryId,
          userId,
          enabled: false,
        },
        "Skipped queuing note processing job",
      );
    }

    const entryWithTags = await getNoteEntryWithTags(entryId);
    return entryWithTags;
  } catch (error) {
    logger.error(
      {
        data,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error creating note entry",
    );
    throw new Error("Failed to create note entry");
  }
}

// Update note entry function
export async function updateNoteEntry(
  id: string,
  noteData: UpdateNoteParams,
  userId: string,
) {
  try {
    // Get existing entry for history
    const existingEntry = await getNoteEntryById(id, userId);

    if (!existingEntry) {
      throw new Error("Note entry not found");
    }

    // Prepare update data
    const { tags: tagNames, dueDate, ...updateData } = noteData;

    // Handle dueDate conversion if provided
    let dueDateValue: Date | null | undefined;
    if (Object.hasOwn(noteData, "dueDate")) {
      dueDateValue = dueDate ? new Date(dueDate) : null;
    }

    // Update content description if content is changed
    const description = noteData.content
      ? noteData.content.substring(0, 100) +
        (noteData.content.length > 100 ? "..." : "")
      : existingEntry.description;

    // Prepare the update set
    const updateSet = {
      ...(updateData as any),
      description,
      updatedAt: new Date(),
    };

    // Add dueDate if it was provided
    if (dueDateValue !== undefined) {
      updateSet.dueDate = dueDateValue;
    }

    // Update the note entry
    const [updatedEntry] = await db
      .update(notes)
      .set(updateSet)
      .where(and(eq(notes.id, id), eq(notes.userId, userId)))
      .returning();

    // Handle tags if provided
    if (tagNames !== undefined) {
      // Remove existing tags
      await db.delete(notesTags).where(eq(notesTags.noteId, id));

      // Add new tags
      if (tagNames.length > 0) {
        await addTagsToNote(id, tagNames, userId);
      }
    }

    // Record history for note update
    await recordHistory({
      action: "update",
      itemType: "note",
      itemId: id,
      itemName: noteData.title || existingEntry.title,
      beforeData: existingEntry,
      afterData: { ...existingEntry, ...noteData },
      actor: "user",
      userId: userId,
    });

    const entryWithTags = await getNoteEntryWithTags(id);
    return entryWithTags;
  } catch (error) {
    logger.error(
      {
        noteId: id,
        noteData,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error updating note entry",
    );
    throw new Error("Failed to update note entry");
  }
}

// Delete note entry function
export async function deleteNoteEntry(id: string, userId: string) {
  try {
    // Get existing entry for history
    const existingEntry = await getNoteEntryById(id, userId);

    if (!existingEntry) {
      throw new Error("Note entry not found");
    }

    // Delete note-tag relationships first
    await db.delete(notesTags).where(eq(notesTags.noteId, id));

    // Delete processing jobs for this note
    const { assetProcessingJobs } = await import("@/db/schema");
    await db
      .delete(assetProcessingJobs)
      .where(
        and(
          eq(assetProcessingJobs.assetType, "notes"),
          eq(assetProcessingJobs.assetId, id),
        ),
      );

    // Delete the note entry
    const deletedEntry = await db
      .delete(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, userId)))
      .returning();

    if (!deletedEntry.length) {
      throw new Error("Note entry not found");
    }

    // Record history for note deletion
    await recordHistory({
      action: "delete",
      itemType: "note",
      itemId: id,
      itemName: existingEntry.title,
      beforeData: existingEntry,
      actor: "user",
      userId: userId,
    });

    return { success: true };
  } catch (error) {
    logger.error(
      {
        noteId: id,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error deleting note entry",
    );
    throw new Error("Failed to delete note entry");
  }
}

// Get all note entries for a user with their tags
export async function getAllNoteEntries(userId: string) {
  try {
    // Get all note entries for the user with processing status
    const entriesList = await db
      .select({
        note: notes,
        status: assetProcessingJobs.status,
      })
      .from(notes)
      .leftJoin(
        assetProcessingJobs,
        and(
          eq(notes.id, assetProcessingJobs.assetId),
          eq(assetProcessingJobs.assetType, "notes"),
        ),
      )
      .where(eq(notes.userId, userId));

    // For each entry, get its tags
    const entriesWithTags = await Promise.all(
      entriesList.map(async (result) => {
        const entry = result.note;
        const entryTagNames = await getNoteEntryTags(entry.id);

        return {
          id: entry.id,
          title: entry.title,
          content: entry.content,
          description: entry.description,
          dueDate: entry.dueDate ? formatToISO8601(entry.dueDate) : null,
          createdAt: formatToISO8601(entry.createdAt),
          updatedAt: formatToISO8601(entry.updatedAt),
          processingStatus: result.status || null,
          reviewStatus: entry.reviewStatus || "pending",
          flagColor: entry.flagColor,
          isPinned: entry.isPinned || false,
          enabled: entry.enabled || false,
          originalMimeType: entry.originalMimeType,
          fileSize: null, // Not stored in notes table
          metadata: entry.rawMetadata,
          tags: entryTagNames,
        };
      }),
    );

    return entriesWithTags;
  } catch (error) {
    logger.error(
      {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error getting all note entries",
    );
    throw new Error("Failed to fetch note entries");
  }
}

// Get a single note entry by ID with its tags
export async function getNoteEntryById(entryId: string, userId: string) {
  try {
    // Get the note entry by ID
    const [result] = await db
      .select({
        note: notes,
        status: assetProcessingJobs.status,
      })
      .from(notes)
      .leftJoin(
        assetProcessingJobs,
        and(
          eq(notes.id, assetProcessingJobs.assetId),
          eq(assetProcessingJobs.assetType, "notes"),
        ),
      )
      .where(and(eq(notes.id, entryId), eq(notes.userId, userId)));

    if (!result) {
      return null;
    }

    const entry = result.note;

    // Get tags for the note entry
    const entryTagNames = await getNoteEntryTags(entryId);

    return {
      id: entry.id,
      title: entry.title,
      content: entry.content,
      description: entry.description,
      createdAt: formatToISO8601(entry.createdAt),
      updatedAt: formatToISO8601(entry.updatedAt),
      processingStatus: result.status || null,
      reviewStatus: entry.reviewStatus || "pending",
      flagColor: entry.flagColor,
      isPinned: entry.isPinned || false,
      enabled: entry.enabled || false,
      tags: entryTagNames,
    };
  } catch (error) {
    logger.error(
      {
        entryId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error getting note entry by ID",
    );
    throw new Error("Failed to fetch note entry");
  }
}

// Helper function to get tags for a note entry
async function getNoteEntryTags(entryId: string): Promise<string[]> {
  const entryTags = await db
    .select({ name: tags.name })
    .from(notesTags)
    .innerJoin(tags, eq(notesTags.tagId, tags.id))
    .where(eq(notesTags.noteId, entryId));

  return entryTags.map((tag) => tag.name);
}

// Helper function to add tags to a note entry
async function addTagsToNote(
  entryId: string,
  tagNames: string[],
  userId: string,
) {
  // Get or create tags scoped to this user
  const tagObjects = await getOrCreateTags(tagNames, userId);

  // Insert note-tag relationships
  await db.insert(notesTags).values(
    tagObjects.map((tag) => ({
      noteId: entryId,
      tagId: tag.id,
    })),
  );
}

// Helper function to get a note entry with its tags
async function getNoteEntryWithTags(entryId: string) {
  const [result] = await db
    .select({
      note: notes,
      status: assetProcessingJobs.status,
    })
    .from(notes)
    .leftJoin(
      assetProcessingJobs,
      and(
        eq(notes.id, assetProcessingJobs.assetId),
        eq(assetProcessingJobs.assetType, "notes"),
      ),
    )
    .where(eq(notes.id, entryId))
    .limit(1);

  if (!result) {
    throw new Error("Note entry not found");
  }

  const entry = result.note;
  const entryTagNames = await getNoteEntryTags(entryId);

  return {
    id: entry.id,
    title: entry.title,
    content: entry.content,
    description: entry.description,
    dueDate: entry.dueDate ? formatToISO8601(entry.dueDate) : null,
    createdAt: formatToISO8601(entry.createdAt),
    updatedAt: formatToISO8601(entry.updatedAt),
    processingStatus: result.status || null,
    reviewStatus: entry.reviewStatus || "pending",
    flagColor: entry.flagColor,
    isPinned: entry.isPinned || false,
    enabled: entry.enabled || false,
    originalMimeType: entry.originalMimeType,
    fileSize: null, // Not stored in notes table
    metadata: entry.rawMetadata,
    tags: entryTagNames,
  };
}

/**
 * Helper function to build query conditions for note searching
 */
function _buildNoteQueryConditions(
  userId: string,
  text?: string,
  startDate?: Date,
  endDate?: Date,
  dueDateStart?: Date,
  dueDateEnd?: Date,
): SQL<unknown>[] {
  const definedConditions: SQL<unknown>[] = [eq(notes.userId, userId)];

  if (text) {
    const searchTerm = `%${text.trim()}%`;
    // Search across title and content
    definedConditions.push(
      or(
        like(notes.title, searchTerm),
        like(notes.content, searchTerm),
      ) as SQL<unknown>,
    );
  }

  if (startDate) {
    definedConditions.push(gte(notes.createdAt, startDate));
  }

  if (endDate) {
    definedConditions.push(lte(notes.createdAt, endDate));
  }

  // Add due date filtering conditions
  if (dueDateStart) {
    definedConditions.push(gte(notes.dueDate, dueDateStart));
  }

  if (dueDateEnd) {
    definedConditions.push(lte(notes.dueDate, dueDateEnd));
  }

  return definedConditions;
}

/**
 * Find note entries with optional filters
 * @param userId - The user ID to search for
 * @param text - Optional text to search in title and content
 * @param tagsList - Optional array of tag names to filter by
 * @param startDate - Optional start date filter
 * @param endDate - Optional end date filter
 * @param limit - Maximum number of results to return (default: 50)
 * @returns Array of note entries with their tags
 */
export async function findNotes(
  userId: string,
  text?: string,
  tagsList?: string[],
  startDate?: Date,
  endDate?: Date,
  limit = 50,
  dueDateStart?: Date,
  dueDateEnd?: Date,
  offset = 0,
) {
  try {
    // Build base query conditions
    const baseConditions = _buildNoteQueryConditions(
      userId,
      text,
      startDate,
      endDate,
      dueDateStart,
      dueDateEnd,
    );

    let query;

    if (tagsList && tagsList.length > 0) {
      // More complex query when filtering by tags
      // We need to find note entries that have all the specified tags
      query = db
        .selectDistinct({
          note: notes,
          status: assetProcessingJobs.status,
        })
        .from(notes)
        .leftJoin(
          assetProcessingJobs,
          and(
            eq(notes.id, assetProcessingJobs.assetId),
            eq(assetProcessingJobs.assetType, "notes"),
          ),
        )
        .innerJoin(notesTags, eq(notes.id, notesTags.noteId))
        .innerJoin(tags, eq(notesTags.tagId, tags.id))
        .where(
          and(
            ...baseConditions,
            eq(tags.userId, userId),
            inArray(tags.name, tagsList),
          ),
        )
        .groupBy(notes.id, assetProcessingJobs.status)
        .having(eq(countDistinct(tags.id), tagsList.length)) // Ensure all tags are present
        .orderBy(desc(notes.createdAt))
        .limit(limit)
        .offset(offset);
    } else {
      // Simple query when not filtering by tags
      query = db
        .select({
          note: notes,
          status: assetProcessingJobs.status,
        })
        .from(notes)
        .leftJoin(
          assetProcessingJobs,
          and(
            eq(notes.id, assetProcessingJobs.assetId),
            eq(assetProcessingJobs.assetType, "notes"),
          ),
        )
        .where(and(...baseConditions))
        .orderBy(desc(notes.createdAt))
        .limit(limit)
        .offset(offset);
    }

    const entriesList = await query;

    // For each entry, get its tags
    const entriesWithTags = await Promise.all(
      entriesList.map(async (result) => {
        const entry = result.note;
        const entryTagNames = await getNoteEntryTags(entry.id);

        return {
          id: entry.id,
          title: entry.title,
          content: entry.content,
          description: entry.description,
          dueDate: entry.dueDate ? formatToISO8601(entry.dueDate) : null,
          createdAt: formatToISO8601(entry.createdAt),
          updatedAt: formatToISO8601(entry.updatedAt),
          processingStatus: result.status || null,
          reviewStatus: entry.reviewStatus || "pending",
          flagColor: entry.flagColor,
          isPinned: entry.isPinned || false,
          enabled: entry.enabled || false,
          tags: entryTagNames,
        };
      }),
    );

    return entriesWithTags;
  } catch (error) {
    logger.error(
      {
        userId,
        text,
        tagsList,
        startDate,
        endDate,
        limit,
        dueDateStart,
        dueDateEnd,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error finding note entries",
    );
    throw new Error("Failed to search note entries");
  }
}

/**
 * Count note entries with optional filters
 * @param userId - The user ID to search for
 * @param text - Optional text to search in title and content
 * @param tagsList - Optional array of tag names to filter by
 * @param startDate - Optional start date filter
 * @param endDate - Optional end date filter
 * @param dueDateStart - Optional start due date filter
 * @param dueDateEnd - Optional end due date filter
 * @returns Total count of matching note entries
 */
export async function countNotes(
  userId: string,
  text?: string,
  tagsList?: string[],
  startDate?: Date,
  endDate?: Date,
  dueDateStart?: Date,
  dueDateEnd?: Date,
): Promise<number> {
  try {
    // Build base query conditions
    const baseConditions = _buildNoteQueryConditions(
      userId,
      text,
      startDate,
      endDate,
      dueDateStart,
      dueDateEnd,
    );

    let countQuery;

    if (tagsList && tagsList.length > 0) {
      // Count distinct note IDs when filtering by tags
      countQuery = db
        .select({ count: countDistinct(notes.id) })
        .from(notes)
        .innerJoin(notesTags, eq(notes.id, notesTags.noteId))
        .innerJoin(tags, eq(notesTags.tagId, tags.id))
        .where(
          and(
            ...baseConditions,
            eq(tags.userId, userId),
            inArray(tags.name, tagsList),
          ),
        )
        .groupBy(notes.id)
        .having(eq(countDistinct(tags.id), tagsList.length));

      // Execute the subquery and count the results
      const subqueryResults = await countQuery;
      return subqueryResults.length;
    } else {
      // Simple count when not filtering by tags
      countQuery = db
        .select({ count: count() })
        .from(notes)
        .where(and(...baseConditions));

      const result = await countQuery;
      return result[0]?.count || 0;
    }
  } catch (error) {
    logger.error(
      {
        userId,
        text,
        tagsList,
        startDate,
        endDate,
        dueDateStart,
        dueDateEnd,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error counting note entries",
    );
    throw new Error("Failed to count note entries");
  }
}

// --- INTERNAL-ONLY SERVICES (Called by Worker) ---

/**
 * Updates the note record with artifact results (tags, etc.).
 * This function handles the database logic for saving worker-produced artifacts.
 *
 * @param noteId - The ID of the note to update
 * @param artifacts - The artifacts to save (e.g., { tags: ["tag1", "tag2"] })
 */
export async function updateNoteArtifacts(
  noteId: string,
  artifacts: {
    tags?: string[];
  },
): Promise<void> {
  // Changed return type to void for cleaner error handling
  try {
    const note = await db.query.notes.findFirst({
      columns: { userId: true },
      where: eq(notes.id, noteId),
    });

    if (!note) {
      logger.error({ noteId }, "Note not found for artifact update");
      // Throw an error to be caught by the calling function
      throw new Error(`Note not found with ID: ${noteId}`);
    }

    await db.transaction(async (tx) => {
      // Handle tags only if the 'tags' property exists in the artifacts object.
      // This prevents accidental deletion of tags if the worker sends an empty artifact payload.
      if (artifacts.tags !== undefined && Array.isArray(artifacts.tags)) {
        const tagNames = artifacts.tags;
        logger.info({ noteId, tags: tagNames }, "Updating note tags.");

        // Clear existing tags for a full replacement
        await tx.delete(notesTags).where(eq(notesTags.noteId, noteId));

        if (tagNames.length > 0) {
          const tagList = await getOrCreateTags(tagNames, note.userId, tx);
          if (tagList.length > 0) {
            await tx
              .insert(notesTags)
              .values(tagList.map((tag) => ({ noteId, tagId: tag.id })));
          }
        }
      }

      // Update the note's updated timestamp
      await tx
        .update(notes)
        .set({ updatedAt: new Date() })
        .where(eq(notes.id, noteId));
    });
  } catch (err) {
    logger.error(
      {
        noteId,
        artifacts,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      "Error updating note artifacts",
    );
    // Re-throw the error so the calling context (e.g., the route handler) knows it failed
    // and can return a proper 500-level response.
    throw err;
  }
}

/**
 * Re-processes an existing note by using the existing retry logic.
 * This allows users to refresh processing results without knowing about processing jobs.
 */
export async function reprocessNote(
  noteId: string,
  userId: string,
  force: boolean = false,
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Get the existing note to ensure it exists and user has access
    const note = await getNoteEntryById(noteId, userId);
    if (!note) {
      return { success: false, error: "Note not found" };
    }

    // 2. Use the existing retry logic with force parameter to properly handle job deduplication
    const { retryAssetProcessing } = await import("./processing-status");
    const result = await retryAssetProcessing("notes", noteId, userId, force);

    if (result.success) {
      logger.info(
        { noteId, userId },
        "Successfully queued note for reprocessing using retry logic",
      );
    } else {
      logger.error(
        { noteId, userId, error: result.error },
        "Failed to reprocess note using retry logic",
      );
    }

    return result;
  } catch (error) {
    logger.error(
      {
        noteId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error reprocessing note",
    );
    return { success: false, error: "Failed to reprocess note" };
  }
}
