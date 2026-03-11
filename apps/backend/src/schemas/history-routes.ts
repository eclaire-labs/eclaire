import { resolver } from "hono-openapi";
import { ValidationErrorSchema } from "./all-responses.js";
import { commonErrors } from "./common.js";
import {
  HistoryAccessDeniedSchema,
  HistoryListResponseSchema,
} from "./history-responses.js";

// GET /api/history - Get history records (with optional filtering)
export const getHistoryRouteDescription = {
  tags: ["History"],
  summary: "Get user history records",
  description:
    "Retrieve history records for the authenticated user with optional filtering by action, item type, actor, and date range",
  responses: {
    200: {
      description: "History records retrieved successfully",
      content: {
        "application/json": {
          schema: resolver(HistoryListResponseSchema),
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
    ...commonErrors,
    403: {
      description: "Access denied to history records",
      content: {
        "application/json": {
          schema: resolver(HistoryAccessDeniedSchema),
        },
      },
    },
  },
};
