// schemas/notifications-routes.ts

import { resolver } from "hono-openapi";
import { SendNotificationSchema } from "./channels-params.js";
import { SendNotificationResponseSchema } from "./channels-responses.js";
import { commonErrorsWithValidation, requestBodyResolver } from "./common.js";

// POST /api/notifications - Send notification
export const postNotificationsRouteDescription = {
  tags: ["Notifications"],
  summary: "Send notification",
  description: "Send a notification message to user's communication channels",
  requestBody: {
    description: "Notification data",
    content: {
      "application/json": {
        schema: requestBodyResolver(SendNotificationSchema),
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
    ...commonErrorsWithValidation,
  },
};
