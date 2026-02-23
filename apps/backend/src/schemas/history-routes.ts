import { resolver } from "hono-openapi";
import {
  ErrorResponseSchema,
  UnauthorizedSchema,
  ValidationErrorSchema,
} from "./all-responses.js";
import {
  HistoryAccessDeniedSchema,
  HistorySearchResponseSchema,
} from "./history-responses.js";

// GET /api/history - Get history records (with optional filtering)
export const getHistoryRouteDescription = {
  tags: ["History"],
  summary: "Get user history records",
  description:
    "Retrieve history records for the authenticated user with optional filtering by action, item type, actor, and date range",
  parameters: [
    {
      name: "action",
      in: "query" as const,
      required: false,
      schema: {
        type: "string" as const,
        enum: [
          "create",
          "update",
          "delete",
          "api_call",
          "ai_prompt_image_response",
          "ai_prompt_text_response",
          "ai_prompt_error",
          "api_content_upload",
          "api_error_general",
        ],
      },
      description: "Filter by action type",
    },
    {
      name: "itemType",
      in: "query" as const,
      required: false,
      schema: {
        type: "string" as const,
        enum: [
          "task",
          "note",
          "bookmark",
          "document",
          "photo",
          "api",
          "prompt",
          "api_error",
          "content_submission",
        ],
      },
      description: "Filter by item type",
    },
    {
      name: "actor",
      in: "query" as const,
      required: false,
      schema: {
        type: "string" as const,
        enum: ["user", "assistant", "system"],
      },
      description: "Filter by actor who performed the action",
    },
    {
      name: "startDate",
      in: "query" as const,
      required: false,
      schema: { type: "string" as const, format: "date-time" as const },
      description: "Filter records after this date (ISO 8601 format)",
    },
    {
      name: "endDate",
      in: "query" as const,
      required: false,
      schema: { type: "string" as const, format: "date-time" as const },
      description: "Filter records before this date (ISO 8601 format)",
    },
    {
      name: "limit",
      in: "query" as const,
      required: false,
      schema: {
        type: "integer" as const,
        minimum: 1,
        maximum: 100,
        default: 50,
      },
      description: "Maximum number of history records to return",
    },
    {
      name: "offset",
      in: "query" as const,
      required: false,
      schema: { type: "integer" as const, minimum: 0, default: 0 },
      description: "Number of records to skip (for pagination)",
    },
  ],
  responses: {
    200: {
      description: "History records retrieved successfully",
      content: {
        "application/json": {
          schema: resolver(HistorySearchResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid filter parameters",
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
    403: {
      description: "Access denied to history records",
      content: {
        "application/json": {
          schema: resolver(HistoryAccessDeniedSchema),
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
