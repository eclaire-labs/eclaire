import { resolver } from "hono-openapi";
import { ErrorResponseSchema, UnauthorizedSchema } from "./all-responses.js";

// GET /api/processing-events/stream - Stream processing events
export const getProcessingEventsStreamRouteDescription = {
  tags: ["Job Processing"],
  summary: "Stream processing events",
  description:
    "Server-sent events stream for processing status updates. Used by system workers and internal monitoring.",
  responses: {
    200: {
      description: "Processing events stream",
      content: {
        "text/event-stream": {
          schema: {
            type: "string" as const,
            description: "Server-sent events stream of processing updates",
          },
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
