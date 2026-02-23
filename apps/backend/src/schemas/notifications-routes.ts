// schemas/notifications-routes.ts

import { resolver } from "hono-openapi";
import {
  ErrorResponseSchema,
  UnauthorizedSchema,
  ValidationErrorSchema,
} from "./all-responses.js";
import { SendNotificationSchema } from "./channels-params.js";
import { SendNotificationResponseSchema } from "./channels-responses.js";

// POST /api/notifications - Send notification
export const postNotificationsRouteDescription = {
  tags: ["Notifications"],
  summary: "Send notification",
  description: "Send a notification message to user's communication channels",
  requestBody: {
    description: "Notification data",
    content: {
      "application/json": {
        schema: resolver(SendNotificationSchema) as any,
      },
    },
  },
  responses: {
    200: {
      description: "Notification sent successfully",
      content: {
        "application/json": {
          schema: resolver(SendNotificationResponseSchema),
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
