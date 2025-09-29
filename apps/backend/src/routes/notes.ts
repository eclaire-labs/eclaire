import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { validator as zValidator } from "hono-openapi/zod";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-utils";
import {
  countNotes,
  createNoteEntry,
  deleteNoteEntry,
  findNotes,
  getAllNoteEntries,
  getNoteEntryById,
  reprocessNote,
  updateNoteEntry,
} from "@/lib/services/notes";
// Import schemas
import {
  NoteMetadataSchema,
  NoteSchema,
  NoteSearchSchema,
  PartialNoteSchema,
} from "@/schemas/notes-params";
import {
  deleteNoteRouteDescription,
  getNoteByIdRouteDescription,
  getNotesRouteDescription,
  patchNoteFlagRouteDescription,
  patchNotePinRouteDescription,
  patchNoteReviewRouteDescription,
  patchNoteRouteDescription,
  postNotesRouteDescription,
  putNoteRouteDescription,
} from "@/schemas/notes-routes";
import type { RouteVariables } from "@/types/route-variables";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("notes");

// Helper function to transform file content to markdown
function transformFileContent(
  content: string,
  mimeType: string,
  filename: string,
): string {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");

  switch (mimeType) {
    case "text/plain":
      return content; // Direct text content
    case "text/markdown":
      return content; // Direct markdown content
    case "application/json":
      return `# ${nameWithoutExt}\n\n\`\`\`json\n${content}\n\`\`\``;
    default:
      return content;
  }
}

export const notesRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/notes - Get all note entries or search note entries
notesRoutes.get("/", describeRoute(getNotesRouteDescription), async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const query = c.req.query();
    const {
      text,
      tags,
      startDate,
      endDate,
      dueDateStart,
      dueDateEnd,
      limit,
      offset,
    } = NoteSearchSchema.parse(query);

    // If no search parameters, return all note entries with pagination
    if (
      !text &&
      !tags &&
      !startDate &&
      !endDate &&
      !dueDateStart &&
      !dueDateEnd
    ) {
      // Use findNotes with no filters to get paginated results
      const entries = await findNotes(
        userId,
        undefined, // text
        undefined, // tagsList
        undefined, // startDate
        undefined, // endDate
        limit,
        undefined, // dueDateStart
        undefined, // dueDateEnd
        offset,
      );

      // Get total count for pagination
      const totalCount = await countNotes(userId);

      return c.json({
        entries,
        pagination: {
          total: totalCount,
          limit: limit,
          offset: offset,
        },
      });
    }

    // Parse parameters for search
    const tagsList = tags
      ? tags.split(",").map((tag) => tag.trim())
      : undefined;
    const startDateObj = startDate ? new Date(startDate) : undefined;
    const endDateObj = endDate ? new Date(endDate) : undefined;
    const dueDateStartObj = dueDateStart ? new Date(dueDateStart) : undefined;
    const dueDateEndObj = dueDateEnd ? new Date(dueDateEnd) : undefined;

    // Search note entries with provided criteria
    const entries = await findNotes(
      userId,
      text,
      tagsList,
      startDateObj,
      endDateObj,
      limit,
      dueDateStartObj,
      dueDateEndObj,
      offset,
    );

    // Get total count for pagination
    const totalCount = await countNotes(
      userId,
      text,
      tagsList,
      startDateObj,
      endDateObj,
      dueDateStartObj,
      dueDateEndObj,
    );

    return c.json({
      entries,
      pagination: {
        total: totalCount,
        limit: limit,
        offset: offset,
      },
    });
  } catch (error) {
    const requestId = c.get("requestId");
    logger.error(
      {
        requestId,
        userId: await getAuthenticatedUserId(c),
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error getting note entries",
    );

    if (error instanceof z.ZodError) {
      return c.json(
        { error: "Invalid query parameters", details: error.errors },
        400,
      );
    }

    return c.json({ error: "Failed to fetch note entries" }, 500);
  }
});

// POST /api/notes - Create a new note entry
notesRoutes.post(
  "/",
  describeRoute(postNotesRouteDescription),
  zValidator("json", NoteSchema),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const validatedData = c.req.valid("json");

      if (!validatedData.title) {
        return c.json({ error: "A title is required to create a note." }, 400);
      }

      const servicePayload = {
        content: validatedData.content || "",
        metadata: {
          title: validatedData.title || "Untitled Note",
          tags: validatedData.tags || [],
          deviceName: validatedData.deviceName,
          deviceModel: validatedData.deviceModel,
          enabled: validatedData.enabled, // Include enabled flag
          dueDate: validatedData.dueDate || undefined,
          reviewStatus: validatedData.reviewStatus,
          flagColor: validatedData.flagColor,
          isPinned: validatedData.isPinned,
        },
        originalMimeType: "text/plain", // Default MIME type for JSON-created notes
        userAgent: c.req.header("User-Agent") || "",
      };

      const newEntry = await createNoteEntry(servicePayload, userId);
      return c.json(newEntry, 201);
    } catch (error) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error creating note entry",
      );

      if (error instanceof z.ZodError) {
        return c.json(
          { error: "Invalid input data", details: error.errors },
          400,
        );
      }

      return c.json({ error: "Failed to create note entry" }, 500);
    }
  },
);

// POST /api/notes/upload - Create a new note entry from file upload
notesRoutes.post(
  "/upload",
  describeRoute({
    summary: "Upload a file to create a new note",
    description:
      "Create a new note entry from an uploaded file (TXT, MD, or JSON)",
    tags: ["Notes"],
    responses: {
      201: {
        description: "Note created successfully",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/NoteResponse" },
          },
        },
      },
      400: {
        description: "Invalid file or metadata",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      500: {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
    },
  }),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const body = await c.req.parseBody();
      const file = body.content as File;
      const metadataStr = body.metadata as string;

      if (!file) {
        return c.json({ error: "No file provided" }, 400);
      }

      // Validate file type
      const allowedTypes = ["text/plain", "text/markdown", "application/json"];
      if (!allowedTypes.includes(file.type)) {
        return c.json(
          {
            error: "Invalid file type. Supported types: TXT, MD, JSON",
          },
          400,
        );
      }

      // Validate file size (1MB limit)
      const maxSize = 1024 * 1024; // 1MB
      if (file.size > maxSize) {
        return c.json(
          {
            error: "File too large. Maximum size is 1MB",
          },
          400,
        );
      }

      // Parse metadata
      let metadata = {};
      if (metadataStr) {
        try {
          metadata = JSON.parse(metadataStr);
        } catch (error) {
          return c.json({ error: "Invalid metadata JSON" }, 400);
        }
      }

      // Validate metadata
      const validatedMetadata = NoteMetadataSchema.parse(metadata);

      // Read file content
      const fileContent = await file.text();

      // Transform content based on file type
      const transformedContent = transformFileContent(
        fileContent,
        file.type,
        file.name,
      );

      // Extract title from filename if not provided
      const title =
        validatedMetadata.title || file.name.replace(/\.[^/.]+$/, "");

      // Create service payload
      const servicePayload = {
        content: transformedContent,
        metadata: {
          title,
          tags: validatedMetadata.tags || [],
          dueDate: validatedMetadata.dueDate || undefined,
        },
        originalMimeType: file.type,
        userAgent: c.req.header("User-Agent") || "",
      };

      // Reuse existing createNoteEntry function
      const newEntry = await createNoteEntry(servicePayload, userId);
      return c.json(newEntry, 201);
    } catch (error) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error uploading note file",
      );

      if (error instanceof z.ZodError) {
        return c.json(
          { error: "Invalid file metadata", details: error.errors },
          400,
        );
      }

      return c.json({ error: "Failed to upload file" }, 500);
    }
  },
);

// GET /api/notes/:id - Get a specific note entry by ID
notesRoutes.get(
  "/:id",
  describeRoute(getNoteByIdRouteDescription),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const id = c.req.param("id");

      const entry = await getNoteEntryById(id, userId);

      if (!entry) {
        return c.json({ error: "Note entry not found" }, 404);
      }

      return c.json(entry);
    } catch (error) {
      if ((error as Error).message === "Note entry not found") {
        return c.json({ error: "Note entry not found" }, 404);
      }

      // Handle any other errors
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          noteId: c.req.param("id"),
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error fetching note entry",
      );
      return c.json({ error: "Failed to fetch note entry" }, 500);
    }
  },
);

// PUT /api/notes/:id - Update a note entry (full update)
notesRoutes.put(
  "/:id",
  describeRoute(putNoteRouteDescription),
  zValidator("json", NoteSchema),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const id = c.req.param("id");
      const validatedData = c.req.valid("json");

      try {
        // Convert null dates to undefined for service compatibility
        const serviceData = {
          ...validatedData,
          dueDate:
            validatedData.dueDate === null ? undefined : validatedData.dueDate,
        };
        const updatedEntry = await updateNoteEntry(id, serviceData, userId);

        if (!updatedEntry) {
          return c.json({ error: "Note entry not found" }, 404);
        }

        return c.json(updatedEntry);
      } catch (error) {
        if ((error as Error).message === "Note entry not found") {
          return c.json({ error: "Note entry not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      logger.error(
        { requestId: c.get("requestId") },
        "Error updating note entry:",
        error,
      );

      if (error instanceof z.ZodError) {
        return c.json(
          { error: "Invalid input data", details: error.errors },
          400,
        );
      }

      return c.json({ error: "Failed to update note entry" }, 500);
    }
  },
);

// PATCH /api/notes/:id - Update a note entry (partial update)
notesRoutes.patch(
  "/:id",
  describeRoute(patchNoteRouteDescription),
  zValidator("json", PartialNoteSchema),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const id = c.req.param("id");
      const validatedData = c.req.valid("json");

      try {
        // Convert null dates to undefined for service compatibility
        const serviceData = {
          ...validatedData,
          dueDate:
            validatedData.dueDate === null ? undefined : validatedData.dueDate,
        };
        const updatedEntry = await updateNoteEntry(id, serviceData, userId);

        if (!updatedEntry) {
          return c.json({ error: "Note entry not found" }, 404);
        }

        return c.json(updatedEntry);
      } catch (error) {
        if ((error as Error).message === "Note entry not found") {
          return c.json({ error: "Note entry not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      logger.error(
        { requestId: c.get("requestId") },
        "Error updating note entry:",
        error,
      );

      if (error instanceof z.ZodError) {
        return c.json(
          { error: "Invalid input data", details: error.errors },
          400,
        );
      }

      return c.json({ error: "Failed to update note entry" }, 500);
    }
  },
);

// POST /api/notes/:id/reprocess - Re-process an existing note
notesRoutes.post("/:id/reprocess", async (c) => {
  try {
    const id = c.req.param("id");
    const userId = await getAuthenticatedUserId(c);

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Parse body for optional force parameter
    const body = await c.req.json().catch(() => ({}));
    const force = body.force === true;

    const result = await reprocessNote(id, userId, force);

    if (result.success) {
      return c.json(
        {
          message: "Note queued for reprocessing successfully",
          noteId: id,
        },
        202,
      ); // 202 Accepted: The request has been accepted for processing
    } else {
      return c.json({ error: result.error }, 400);
    }
  } catch (error) {
    logger.error("Error reprocessing note:", error);
    return c.json({ error: "Failed to reprocess note" }, 500);
  }
});

// DELETE /api/notes/:id - Delete a note entry
notesRoutes.delete(
  "/:id",
  describeRoute(deleteNoteRouteDescription),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const id = c.req.param("id");

      try {
        await deleteNoteEntry(id, userId);
        return new Response(null, { status: 204 });
      } catch (error) {
        if ((error as Error).message === "Note entry not found") {
          return c.json({ error: "Note entry not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      logger.error(
        { requestId: c.get("requestId") },
        "Error deleting note entry:",
        error,
      );
      return c.json({ error: "Failed to delete note entry" }, 500);
    }
  },
);

// PATCH /api/notes/:id/review - Update review status
notesRoutes.patch(
  "/:id/review",
  describeRoute(patchNoteReviewRouteDescription),
  zValidator(
    "json",
    z.object({
      reviewStatus: z.enum(["pending", "accepted", "rejected"]).openapi({
        description: "New review status for the note",
        examples: ["accepted", "rejected"],
      }),
    }),
  ),
  async (c) => {
    try {
      const id = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const { reviewStatus } = c.req.valid("json");

      try {
        const updatedNote = await updateNoteEntry(id, { reviewStatus }, userId);

        if (!updatedNote) {
          return c.json({ error: "Note not found" }, 404);
        }

        return c.json(updatedNote);
      } catch (error) {
        if ((error as Error).message === "Note entry not found") {
          return c.json({ error: "Note not found" }, 404);
        }
        if ((error as Error).message === "Failed to update note entry") {
          return c.json({ error: "Note not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      logger.error("Error updating note review status:", error);
      return c.json({ error: "Failed to update note review status" }, 500);
    }
  },
);

// PATCH /api/notes/:id/flag - Update flag color
notesRoutes.patch(
  "/:id/flag",
  describeRoute(patchNoteFlagRouteDescription),
  zValidator(
    "json",
    z.object({
      flagColor: z
        .enum(["red", "yellow", "orange", "green", "blue"])
        .nullable()
        .openapi({
          description: "Flag color for the note (null to remove flag)",
          examples: ["red", "green", null],
        }),
    }),
  ),
  async (c) => {
    try {
      const id = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const { flagColor } = c.req.valid("json");

      try {
        const updatedNote = await updateNoteEntry(id, { flagColor }, userId);

        if (!updatedNote) {
          return c.json({ error: "Note not found" }, 404);
        }

        return c.json(updatedNote);
      } catch (error) {
        if ((error as Error).message === "Note entry not found") {
          return c.json({ error: "Note not found" }, 404);
        }
        if ((error as Error).message === "Failed to update note entry") {
          return c.json({ error: "Note not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      logger.error("Error updating note flag:", error);
      return c.json({ error: "Failed to update note flag" }, 500);
    }
  },
);

// PATCH /api/notes/:id/pin - Toggle pin status
notesRoutes.patch(
  "/:id/pin",
  describeRoute(patchNotePinRouteDescription),
  zValidator(
    "json",
    z.object({
      isPinned: z.boolean().openapi({
        description: "Whether to pin or unpin the note",
        examples: [true, false],
      }),
    }),
  ),
  async (c) => {
    try {
      const id = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const { isPinned } = c.req.valid("json");

      try {
        const updatedNote = await updateNoteEntry(id, { isPinned }, userId);

        if (!updatedNote) {
          return c.json({ error: "Note not found" }, 404);
        }

        return c.json(updatedNote);
      } catch (error) {
        if ((error as Error).message === "Note entry not found") {
          return c.json({ error: "Note not found" }, 404);
        }
        if ((error as Error).message === "Failed to update note entry") {
          return c.json({ error: "Note not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      logger.error("Error updating note pin status:", error);
      return c.json({ error: "Failed to update note pin status" }, 500);
    }
  },
);
