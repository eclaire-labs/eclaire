import { Hono } from "hono";
import { describeRoute, validator as zValidator } from "hono-openapi";
import { NotFoundError } from "../lib/errors.js";
import { createChildLogger } from "../lib/logger.js";
import { parseSearchFields } from "../lib/search-params.js";
import {
  createNoteEntry,
  deleteNoteEntry,
  findNotesPaginated,
  getNoteEntryById,
  parseNoteUploadMetadata,
  prepareNoteFromUpload,
  reprocessNote,
  updateNoteEntry,
  validateNoteFileUpload,
} from "../lib/services/notes.js";
import { withAuth } from "../middleware/with-auth.js";
// Import schemas
import {
  NoteMetadataSchema,
  NoteSchema,
  NoteSearchSchema,
  PartialNoteSchema,
} from "../schemas/notes-params.js";
import {
  deleteNoteRouteDescription,
  getNoteByIdRouteDescription,
  getNotesRouteDescription,
  patchNoteFlagRouteDescription,
  patchNotePinRouteDescription,
  patchNoteReviewRouteDescription,
  patchNoteRouteDescription,
  postNoteUploadRouteDescription,
  postNotesRouteDescription,
  putNoteRouteDescription,
} from "../schemas/notes-routes.js";
import type { RouteVariables } from "../types/route-variables.js";
import { registerCommonEndpoints } from "./shared-endpoints.js";

const logger = createChildLogger("notes");

/** Converts null dueDate to undefined for service layer compatibility. */
function toNoteServiceData<T extends { dueDate?: string | null }>(data: T) {
  return {
    ...data,
    dueDate: data.dueDate === null ? undefined : data.dueDate,
  };
}

export const notesRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/notes - Get all note entries or search note entries
notesRoutes.get(
  "/",
  describeRoute(getNotesRouteDescription),
  withAuth(async (c, userId) => {
    const params = NoteSearchSchema.parse(c.req.query());
    const parsed = parseSearchFields(params);

    const result = await findNotesPaginated({
      userId,
      text: params.text,
      ...parsed,
      limit: params.limit,
      cursor: params.cursor,
      sortBy: params.sortBy,
      sortDir: params.sortDir,
    });

    return c.json(result);
  }, logger),
);

// POST /api/notes - Create a new note entry
notesRoutes.post(
  "/",
  describeRoute(postNotesRouteDescription),
  zValidator("json", NoteSchema),
  withAuth(async (c, userId) => {
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
        processingEnabled: validatedData.processingEnabled, // Include processingEnabled flag
        dueDate: validatedData.dueDate || undefined,
        reviewStatus: validatedData.reviewStatus,
        flagColor: validatedData.flagColor,
        isPinned: validatedData.isPinned,
      },
      originalMimeType: "text/plain", // Default MIME type for JSON-created notes
      userAgent: c.req.header("User-Agent") || "",
    };

    const newEntry = await createNoteEntry(servicePayload, { userId, actor: "user" });
    return c.json(newEntry, 201);
  }, logger),
);

// POST /api/notes/upload - Create a new note entry from file upload
notesRoutes.post(
  "/upload",
  describeRoute(postNoteUploadRouteDescription),
  withAuth(async (c, userId) => {
    const body = await c.req.parseBody();
    const file = body.content as File;
    const metadataStr = body.metadata as string;

    // Validate file
    const fileValidation = validateNoteFileUpload(file);
    if (!fileValidation.valid) {
      return c.json({ error: fileValidation.error }, 400);
    }

    // Parse metadata
    const metadataResult = parseNoteUploadMetadata(metadataStr);
    if (!metadataResult.valid) {
      return c.json({ error: metadataResult.error }, 400);
    }

    // Validate metadata schema
    const validatedMetadata = NoteMetadataSchema.parse(metadataResult.metadata);

    // Prepare note from upload
    const prepared = await prepareNoteFromUpload(file, validatedMetadata);

    // Create service payload
    const servicePayload = {
      content: prepared.content,
      metadata: prepared.metadata,
      originalMimeType: prepared.originalMimeType,
      userAgent: c.req.header("User-Agent") || "",
    };

    // Reuse existing createNoteEntry function
    const newEntry = await createNoteEntry(servicePayload, { userId, actor: "user" });
    return c.json(newEntry, 201);
  }, logger),
);

// GET /api/notes/:id - Get a specific note entry by ID
notesRoutes.get(
  "/:id",
  describeRoute(getNoteByIdRouteDescription),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const entry = await getNoteEntryById(id, userId);

    if (!entry) {
      throw new NotFoundError("Note");
    }

    return c.json(entry);
  }, logger),
);

// PUT /api/notes/:id - Update a note entry (full update)
notesRoutes.put(
  "/:id",
  describeRoute(putNoteRouteDescription),
  zValidator("json", NoteSchema),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const updatedEntry = await updateNoteEntry(id, toNoteServiceData(c.req.valid("json")), { userId, actor: "user" });
    if (!updatedEntry) throw new NotFoundError("Note");
    return c.json(updatedEntry);
  }, logger),
);

// PATCH /api/notes/:id - Update a note entry (partial update)
notesRoutes.patch(
  "/:id",
  describeRoute(patchNoteRouteDescription),
  zValidator("json", PartialNoteSchema),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const updatedEntry = await updateNoteEntry(id, toNoteServiceData(c.req.valid("json")), { userId, actor: "user" });
    if (!updatedEntry) throw new NotFoundError("Note");
    return c.json(updatedEntry);
  }, logger),
);

// DELETE /api/notes/:id - Delete a note entry
notesRoutes.delete(
  "/:id",
  describeRoute(deleteNoteRouteDescription),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    await deleteNoteEntry(id, userId);
    return new Response(null, { status: 204 });
  }, logger),
);

// Common endpoints: PATCH review/flag/pin + POST reprocess
registerCommonEndpoints(notesRoutes, {
  resourceName: "Note",
  idKeyName: "noteId",
  updateFn: updateNoteEntry,
  reprocessFn: reprocessNote,
  routeDescriptions: {
    review: patchNoteReviewRouteDescription,
    flag: patchNoteFlagRouteDescription,
    pin: patchNotePinRouteDescription,
  },
  logger,
});
