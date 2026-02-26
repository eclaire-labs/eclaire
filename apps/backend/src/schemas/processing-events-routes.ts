import { commonErrors } from "./common.js";

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
    ...commonErrors,
  },
};
