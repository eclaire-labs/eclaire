import { resolver } from "hono-openapi";
import {
  ErrorResponseSchema,
  UnauthorizedSchema,
} from "./all-responses.js";

// GET /api/processing-status/summary - Get processing status summary
export const getProcessingStatusSummaryRouteDescription = {
  tags: ["Job Processing"],
  summary: "Get processing status summary",
  description:
    "Get a summary of processing status across all asset types. Used by system workers.",
  responses: {
    200: {
      description: "Processing status summary retrieved successfully",
      content: {
        "application/json": {
          schema: {
            type: "object" as const,
            properties: {
              summary: {
                type: "object" as const,
                description: "Summary of processing statuses",
              },
            },
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

// GET /api/processing-status/jobs - Get processing jobs
export const getProcessingJobsRouteDescription = {
  tags: ["Job Processing"],
  summary: "Get processing jobs",
  description:
    "Get information about active and pending processing jobs. Used by system workers.",
  responses: {
    200: {
      description: "Processing jobs retrieved successfully",
      content: {
        "application/json": {
          schema: {
            type: "object" as const,
            properties: {
              jobs: {
                type: "array" as const,
                description: "List of processing jobs",
                items: {
                  type: "object" as const,
                  properties: {
                    id: {
                      type: "string" as const,
                      description: "Job ID",
                    },
                    status: {
                      type: "string" as const,
                      description: "Job status",
                    },
                    type: {
                      type: "string" as const,
                      description: "Job type",
                    },
                    createdAt: {
                      type: "string" as const,
                      format: "date-time" as const,
                      description: "Job creation timestamp",
                    },
                  },
                },
              },
            },
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

// GET /api/processing-status/:assetType/:assetId - Get asset processing status
export const getAssetProcessingStatusRouteDescription = {
  tags: ["Job Processing"],
  summary: "Get asset processing status",
  description:
    "Get processing status for a specific asset. Used by system workers.",
  responses: {
    200: {
      description: "Asset processing status retrieved successfully",
      content: {
        "application/json": {
          schema: {
            type: "object" as const,
            properties: {
              status: {
                type: "string" as const,
                description: "Processing status of the asset",
              },
            },
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
    404: {
      description: "Asset not found",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
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

// POST /api/processing-status/retry - Retry processing
export const postProcessingRetryRouteDescription = {
  tags: ["Job Processing"],
  summary: "Retry processing",
  description: "Retry processing for failed items. Used by system workers.",
  responses: {
    200: {
      description: "Processing retry initiated successfully",
      content: {
        "application/json": {
          schema: {
            type: "object" as const,
            properties: {
              message: {
                type: "string" as const,
                description: "Success message",
              },
            },
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

// POST /api/processing-status/:assetType/:assetId/retry - Retry asset processing
export const postAssetProcessingRetryRouteDescription = {
  tags: ["Job Processing"],
  summary: "Retry asset processing",
  description: "Retry processing for a specific asset. Used by system workers.",
  responses: {
    200: {
      description: "Asset processing retry initiated successfully",
      content: {
        "application/json": {
          schema: {
            type: "object" as const,
            properties: {
              message: {
                type: "string" as const,
                description: "Success message",
              },
            },
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
    404: {
      description: "Asset not found",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
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

// PUT /api/processing-status/:assetType/:assetId/update - Update asset processing status
export const putAssetProcessingStatusUpdateRouteDescription = {
  tags: ["Job Processing"],
  summary: "Update asset processing status",
  description:
    "Update processing status for a specific asset. Used by system workers.",
  responses: {
    200: {
      description: "Asset processing status updated successfully",
      content: {
        "application/json": {
          schema: {
            type: "object" as const,
            properties: {
              message: {
                type: "string" as const,
                description: "Success message",
              },
            },
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
    404: {
      description: "Asset not found",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
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
