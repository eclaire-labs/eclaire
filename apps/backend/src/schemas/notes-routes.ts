// schemas/notes-routes.ts
import { resolver } from "hono-openapi";
import {
  ErrorResponseSchema,
  UnauthorizedSchema,
  ValidationErrorSchema,
} from "./all-responses.js";
import {
  NoteFlagUpdateSchema,
  NotePinUpdateSchema,
  NoteReviewUpdateSchema,
  NoteSchema,
  PartialNoteSchema,
} from "./notes-params.js";
import {
  CreatedNoteResponseSchema,
  NoteDeleteResponseSchema,
  NoteNotFoundSchema,
  NoteResponseSchema,
  NotesListResponseSchema,
} from "./notes-responses.js";

// GET /api/notes - Get all notes or search notes
export const getNotesRouteDescription = {
  tags: ["Notes"],
  summary: "Get all notes or search notes",
  description:
    "Retrieve all notes for the authenticated user or search notes with optional filters",
  parameters: [
    {
      name: "text",
      in: "query" as const,
      description: "Search text to find in note titles and content",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "tags",
      in: "query" as const,
      description: "Comma-separated list of tags to filter by",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "startDate",
      in: "query" as const,
      description:
        "Filter notes created on or after this date (ISO 8601 format)",
      required: false,
      schema: { type: "string" as const, format: "date-time" as const },
    },
    {
      name: "endDate",
      in: "query" as const,
      description:
        "Filter notes created on or before this date (ISO 8601 format)",
      required: false,
      schema: { type: "string" as const, format: "date-time" as const },
    },
    {
      name: "limit",
      in: "query" as const,
      description: "Maximum number of results to return",
      required: false,
      schema: { type: "string" as const, pattern: "^\\d+$" },
    },
    {
      name: "offset",
      in: "query" as const,
      description: "Number of results to skip (for pagination)",
      required: false,
      schema: { type: "string" as const, pattern: "^\\d+$" },
    },
    {
      name: "dueDateStart",
      in: "query" as const,
      description:
        "Filter notes with due dates on or after this date (ISO 8601 format)",
      required: false,
      schema: { type: "string" as const, format: "date-time" as const },
    },
    {
      name: "dueDateEnd",
      in: "query" as const,
      description:
        "Filter notes with due dates on or before this date (ISO 8601 format)",
      required: false,
      schema: { type: "string" as const, format: "date-time" as const },
    },
  ],
  responses: {
    200: {
      description: "List of notes with pagination info",
      content: {
        "application/json": {
          schema: resolver(NotesListResponseSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// POST /api/notes - Create a new note
export const postNotesRouteDescription = {
  tags: ["Notes"],
  summary: "Create a new note",
  description:
    "Create a new note entry with title, content, and optional metadata",
  requestBody: {
    description: "Note data in JSON format",
    content: {
      "application/json": {
        schema: resolver(NoteSchema) as any,
      },
    },
  },
  responses: {
    201: {
      description: "Note created successfully",
      content: {
        "application/json": {
          schema: resolver(CreatedNoteResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid request data or file type",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// GET /api/notes/:id - Get a specific note
export const getNoteByIdRouteDescription = {
  tags: ["Notes"],
  summary: "Get note by ID",
  description: "Retrieve a specific note by its unique identifier",
  responses: {
    200: {
      description: "Note details",
      content: {
        "application/json": {
          schema: resolver(NoteResponseSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Note not found",
      content: {
        "application/json": {
          schema: resolver(NoteNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// PUT /api/notes/:id - Update a note (full)
export const putNoteRouteDescription = {
  tags: ["Notes"],
  summary: "Update note (full)",
  description:
    "Completely update a note with new data. All fields are required.",
  requestBody: {
    description: "Complete note data",
    content: {
      "application/json": {
        schema: resolver(NoteSchema) as any,
      },
    },
  },
  responses: {
    200: {
      description: "Note updated successfully",
      content: {
        "application/json": {
          schema: resolver(NoteResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid request data",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Note not found",
      content: {
        "application/json": {
          schema: resolver(NoteNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// PATCH /api/notes/:id - Update a note (partial)
export const patchNoteRouteDescription = {
  tags: ["Notes"],
  summary: "Update note (partial)",
  description: "Partially update a note. Only provided fields will be updated.",
  requestBody: {
    description: "Partial note data",
    content: {
      "application/json": {
        schema: resolver(PartialNoteSchema) as any,
      },
    },
  },
  responses: {
    200: {
      description: "Note updated successfully",
      content: {
        "application/json": {
          schema: resolver(NoteResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid request data",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Note not found",
      content: {
        "application/json": {
          schema: resolver(NoteNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// DELETE /api/notes/:id - Delete a note
export const deleteNoteRouteDescription = {
  tags: ["Notes"],
  summary: "Delete note",
  description: "Delete a note entry permanently",
  responses: {
    200: {
      description: "Note deleted successfully",
      content: {
        "application/json": {
          schema: resolver(NoteDeleteResponseSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Note not found",
      content: {
        "application/json": {
          schema: resolver(NoteNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// PATCH /api/notes/:id/review - Update review status
export const patchNoteReviewRouteDescription = {
  tags: ["Notes"],
  summary: "Update note review status",
  description: "Update the review status of a specific note",
  requestBody: {
    description: "Review status update data",
    content: {
      "application/json": {
        schema: resolver(NoteReviewUpdateSchema) as any,
      },
    },
  },
  responses: {
    200: {
      description: "Note review status updated successfully",
      content: {
        "application/json": {
          schema: resolver(NoteResponseSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Note not found",
      content: {
        "application/json": {
          schema: resolver(NoteNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// PATCH /api/notes/:id/flag - Update flag color
export const patchNoteFlagRouteDescription = {
  tags: ["Notes"],
  summary: "Update note flag color",
  description: "Update the flag color of a specific note",
  requestBody: {
    description: "Flag color update data",
    content: {
      "application/json": {
        schema: resolver(NoteFlagUpdateSchema) as any,
      },
    },
  },
  responses: {
    200: {
      description: "Note flag color updated successfully",
      content: {
        "application/json": {
          schema: resolver(NoteResponseSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Note not found",
      content: {
        "application/json": {
          schema: resolver(NoteNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// PATCH /api/notes/:id/pin - Toggle pin status
export const patchNotePinRouteDescription = {
  tags: ["Notes"],
  summary: "Update note pin status",
  description: "Pin or unpin a specific note",
  requestBody: {
    description: "Pin status update data",
    content: {
      "application/json": {
        schema: resolver(NotePinUpdateSchema) as any,
      },
    },
  },
  responses: {
    200: {
      description: "Note pin status updated successfully",
      content: {
        "application/json": {
          schema: resolver(NoteResponseSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Note not found",
      content: {
        "application/json": {
          schema: resolver(NoteNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};
