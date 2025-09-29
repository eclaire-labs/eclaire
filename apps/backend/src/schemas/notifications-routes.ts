// schemas/notifications-routes.ts

import { resolver } from "hono-openapi/zod";
import { z } from "zod";
import {
  ErrorResponseSchema,
  UnauthorizedSchema,
  ValidationErrorSchema,
} from "./all-responses";
import { SendNotificationSchema } from "./channels-params";
import { SendNotificationResponseSchema } from "./channels-responses";

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
